const http = require('http');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

const https = require('https');
const PORT = process.env.PORT || 3000;
const BASE_DIR = __dirname;
const LOCAL_URL = `http://localhost:${PORT}`;
const DASHBOARD_API_URL = 'https://timezone-dashboard.aisensum.com/api/kiosk';

// Send server start/stop event to dashboard
function sendServerEvent(action) {
    const kioskId = (process.env.location || 'K1').toUpperCase();
    const place = process.env.PLACE || '';
    const data = JSON.stringify({
        kioskId: place || kioskId,
        action,
        timestamp: new Date().toISOString(),
        place
    });
    console.log(`🖥️ Sending ${action} to dashboard...`);
    const url = new URL(DASHBOARD_API_URL + '/session');
    const req = https.request({
        hostname: url.hostname,
        path: url.pathname,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    }, (res) => {
        let body = '';
        res.on('data', c => body += c);
        res.on('end', () => console.log(`📊 ${action} logged to dashboard:`, body));
    });
    req.on('error', (e) => console.warn(`⚠️ Failed to log ${action}:`, e.message));
    req.write(data);
    req.end();
    return req;
}

// Kiosk Configuration - set 'PLACE' in .env to filter offers for this specific kiosk location
// PLACE should match the venue/place name set in the Offer Builder admin panel
// e.g. PLACE=Summarecon Mall Serpong
// Falls back to old 'location' mapping (k1->Kiosk 1) for backward compatibility
const KIOSK_LOCATION = process.env.location || null;
const KIOSK_PLACE_RAW = process.env.PLACE || null;
const KIOSK_VENUE = KIOSK_PLACE_RAW || (KIOSK_LOCATION ? (() => {
    // Legacy fallback: Map shorthand (k1, k2) to full venue name (Kiosk 1, Kiosk 2)
    const locationMap = {
        'k1': 'Kiosk 1',
        'k2': 'Kiosk 2',
        'k3': 'Kiosk 3',
        'k4': 'Kiosk 4',
        'k5': 'Kiosk 5'
    };
    return locationMap[KIOSK_LOCATION.toLowerCase()] || KIOSK_LOCATION;
})() : null);

/**
 * Fuzzy venue matching using regex
 * Handles minor spelling mistakes in .env PLACE value
 * Strategy: split PLACE into keywords, build a regex that matches if ALL keywords
 * appear (in any order) in the venue string, case-insensitive.
 * Each keyword allows 1-char tolerance via optional char patterns.
 * 
 * Example: PLACE="Sumarecon Mall" matches "Summarecon Mall Serpong"
 *          PLACE="margo" matches "Margo City"
 */
function buildFuzzyPattern(place) {
    if (!place) return null;
    // Split into words, filter out empty
    const words = place.trim().split(/\s+/).filter(w => w.length > 0);
    // For each word, build a pattern that allows optional doubled letters and optional spaces
    // e.g. "Sumarecon" -> "S+\s*u+\s*m+\s*a+\s*r+\s*e+\s*c+\s*o+\s*n+" (each char can repeat, spaces allowed between)
    // This handles: "MARGOCITY" matching "Margo City", "Sumarecon" matching "Summarecon"
    const wordPatterns = words.map(word => {
        // Escape special regex chars, then allow each letter to repeat with optional spaces between
        const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const flexPattern = escaped.split('').map(ch => {
            if (/[a-zA-Z]/.test(ch)) return ch + '+\\s*'; // allow repeated chars + optional spaces
            return ch;
        }).join('');
        return `(?=.*${flexPattern})`;
    });
    // All words must appear (lookaheads), case-insensitive
    return new RegExp(wordPatterns.join(''), 'i');
}

const KIOSK_VENUE_PATTERN = buildFuzzyPattern(KIOSK_VENUE);
if (KIOSK_VENUE) {
    console.log(`📍 Kiosk PLACE (from .env): "${KIOSK_VENUE}"`);
    console.log(`📍 Fuzzy pattern: ${KIOSK_VENUE_PATTERN}`);
}

// Resolved venue name (exact match from DB, found via fuzzy matching at startup)
// This gets set after DB connection is ready, so SQL queries use the exact DB name
let RESOLVED_VENUE = KIOSK_VENUE; // default to raw value

/**
 * Resolve the .env PLACE to an exact venue name from the database
 * Uses fuzzy regex to handle spelling mistakes
 * Called once at startup after DB is ready
 */
async function resolveVenueFromDB() {
    if (!KIOSK_VENUE || !KIOSK_VENUE_PATTERN) return;
    try {
        // First try the places table (if it exists from cloud sync)
        let venueNames = [];
        try {
            const placesResult = await pool.query('SELECT DISTINCT name FROM places WHERE is_active = true');
            venueNames = placesResult.rows.map(r => r.name);
        } catch (e) {
            // places table might not exist yet, fall through
        }

        // Also get distinct venues from offers table as fallback
        if (venueNames.length === 0) {
            const venueResult = await pool.query('SELECT DISTINCT unnest(venue) as v FROM offers WHERE venue IS NOT NULL');
            venueNames = venueResult.rows.map(r => r.v);
        }

        if (venueNames.length === 0) {
            console.log('📍 No venues found in DB, using raw PLACE value');
            return;
        }

        console.log(`📍 Available venues in DB: ${venueNames.join(', ')}`);

        // Find the best fuzzy match
        const match = venueNames.find(name => KIOSK_VENUE_PATTERN.test(name));
        if (match) {
            RESOLVED_VENUE = match;
            console.log(`📍 ✅ Fuzzy matched "${KIOSK_VENUE}" → "${RESOLVED_VENUE}"`);
        } else {
            // Try exact case-insensitive match as last resort
            const exactMatch = venueNames.find(name => name.toLowerCase() === KIOSK_VENUE.toLowerCase());
            if (exactMatch) {
                RESOLVED_VENUE = exactMatch;
                console.log(`📍 ✅ Exact matched "${KIOSK_VENUE}" → "${RESOLVED_VENUE}"`);
            } else {
                // Try normalized match: strip all spaces and compare case-insensitive
                // Handles: MARGOCITY -> Margo City, SUMMARECONMALLSERPONG -> Summarecon Mall Serpong
                const normalize = s => s.replace(/\s+/g, '').toLowerCase();
                const normalizedPlace = normalize(KIOSK_VENUE);
                const normalizedMatch = venueNames.find(name => normalize(name) === normalizedPlace);
                if (normalizedMatch) {
                    RESOLVED_VENUE = normalizedMatch;
                    console.log(`📍 ✅ Normalized matched "${KIOSK_VENUE}" → "${RESOLVED_VENUE}"`);
                } else {
                    console.log(`📍 ⚠️ No fuzzy match found for "${KIOSK_VENUE}" in DB venues. Using raw value.`);
                    console.log(`📍    Tip: Check that PLACE in .env matches a venue in the Offer Builder admin.`);
                }
            }
        }
    } catch (err) {
        console.error('📍 ❌ Error resolving venue from DB:', err.message);
    }
}

// Cache for offers from database (used for Offers Page TIZO calculation - card-type specific)
let upsellOffersCache = null;

// Cache for UNIVERSAL custom top-up rates (used for Custom Top-Up page - NO card type)
let customTopupRatesCache = null;

/**
 * Load offers from database into cache (for Offers Page - card-type specific)
 * Uses the main 'offers' table
 */
async function loadUpsellOffersCache() {
    try {
        // Fetch active offers from the offers table, filtered by venue if configured
        let query = `
            SELECT 
                card_type,
                ROUND(cost / 1000) as topup_rb,
                ROUND(tizo_credit) as tizo_value
            FROM offers 
            WHERE is_active = true 
            AND (start_date IS NULL OR start_date <= CURRENT_DATE) 
            AND (end_date IS NULL OR end_date >= CURRENT_DATE)`;
        let params = [];
        if (RESOLVED_VENUE) {
            query += ` AND (venue IS NULL OR venue = '{}' OR $1 = ANY(venue))`;
            params.push(RESOLVED_VENUE);
        }
        query += ` ORDER BY topup_rb DESC`;
        const result = await pool.query(query, params);
        upsellOffersCache = result.rows.map(row => ({
            card_type: row.card_type,
            topup_rb: parseInt(row.topup_rb),
            tizo_value: parseInt(row.tizo_value)
        }));
        console.log('✅ Loaded', upsellOffersCache.length, 'card-type TIZO rates from offers table');
        console.log('   Offers:', upsellOffersCache.slice(0, 10).map(o => `${o.card_type}:${o.topup_rb}RB=${o.tizo_value}TIZO`).join(', '), '...');
    } catch (err) {
        console.error('❌ Failed to load offers for TIZO calculation:', err.message);
    }
}

/**
 * Load UNIVERSAL custom top-up rates from database
 * Uses the 'custom_topup_rates' table - applies to ALL card types
 */
async function loadCustomTopupRatesCache() {
    try {
        const result = await pool.query(`
            SELECT topup_rb, tizo_value
            FROM custom_topup_rates
            WHERE is_active = true
            ORDER BY topup_rb DESC
        `);
        customTopupRatesCache = result.rows.map(row => ({
            topup_rb: parseInt(row.topup_rb),
            tizo_value: parseInt(row.tizo_value)
        }));
        console.log('✅ Loaded', customTopupRatesCache.length, 'UNIVERSAL custom top-up rates');
        console.log('   Rates:', customTopupRatesCache.map(r => `${r.topup_rb}RB=${r.tizo_value}TIZO`).join(', '));
    } catch (err) {
        console.error('❌ Failed to load custom top-up rates:', err.message);
        // Keep existing cache if available (from last successful sync)
        if (customTopupRatesCache && customTopupRatesCache.length > 0) {
            console.log('⚠️ Using previously cached custom top-up rates (DB error, keeping old data)');
        } else {
            // Absolute fallback: only used on first-ever boot with no DB
            customTopupRatesCache = [
                { topup_rb: 2000, tizo_value: 4000 },
                { topup_rb: 600, tizo_value: 1200 },
                { topup_rb: 500, tizo_value: 900 },
                { topup_rb: 400, tizo_value: 650 },
                { topup_rb: 350, tizo_value: 550 },
                { topup_rb: 300, tizo_value: 450 },
                { topup_rb: 250, tizo_value: 350 },
                { topup_rb: 200, tizo_value: 260 },
                { topup_rb: 150, tizo_value: 180 },
                { topup_rb: 100, tizo_value: 110 }
            ];
            console.log('⚠️ Using fallback hardcoded custom top-up rates (first boot, no cache)');
        }
    }
}

/**
 * Calculate TIZO for CUSTOM TOP-UP amounts
 * 
 * NEW SYSTEM: Uses UNIVERSAL rates from custom_topup_rates table
 * NO card type differentiation - same rates for all users
 * 
 * Example: 125 RB
 * - 100 RB = 110 TIZO (from universal table)
 * - Remaining 25 RB = 25 TIZO (1:1 ratio, below smallest offer of 100)
 * - Total = 135 TIZO
 * 
 * @param {number} amountRb - Amount in Rb (e.g., 125 for 125,000 Rp)
 * @param {string} cardType - IGNORED for custom top-up (kept for backward compatibility)
 * @returns {number} - TIZO credit amount
 */
function calculateCustomTizo(amountRb, cardType = 'red') {
    let totalTizo = 0;
    let remaining = amountRb;
    const breakdownParts = [];

    console.log(`[calculateCustomTizo] UNIVERSAL mode - Amount: ${amountRb} RB (card type ignored)`);

    // Use universal custom top-up rates (sorted descending, largest first)
    if (customTopupRatesCache && customTopupRatesCache.length > 0) {
        console.log(`[calculateCustomTizo] Available universal rates:`, customTopupRatesCache.map(r => `${r.topup_rb}RB=${r.tizo_value}TIZO`).join(', '));

        // Greedy allocation - use largest offers first
        for (const rate of customTopupRatesCache) {
            while (remaining >= rate.topup_rb) {
                totalTizo += rate.tizo_value;
                remaining -= rate.topup_rb;
                breakdownParts.push(`${rate.topup_rb}RB=${rate.tizo_value}`);
                console.log(`[calculateCustomTizo] Used ${rate.topup_rb}RB = ${rate.tizo_value}TIZO, remaining: ${remaining}RB`);
            }
        }
    }

    // Any remaining amount below smallest offer (100 RB) -> 1:1 ratio
    if (remaining > 0) {
        console.log(`[calculateCustomTizo] Remaining ${remaining}RB below smallest offer, adding at 1:1 ratio`);
        totalTizo += remaining;
        breakdownParts.push(`${remaining}RB=${remaining}(1:1)`);
    }

    console.log(`[calculateCustomTizo] FINAL: ${amountRb} RB = ${totalTizo} TIZO`);
    console.log(`[calculateCustomTizo] Breakdown: ${breakdownParts.join(' + ')}`);
    return totalTizo;
}

// Local database connection
// Used for serving API requests (should be fast/local)
const localPool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5433,
    database: process.env.DB_NAME || 'TimeZone',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'timezone@2025',
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
});

// Cloud database connection
// Used for fetching updates
const cloudPool = new Pool({
    host: process.env.CLOUD_DB_HOST || '34.142.198.255',
    port: process.env.CLOUD_DB_PORT || 5433,
    database: process.env.CLOUD_DB_NAME || 'TimeZone',
    user: process.env.CLOUD_DB_USER || 'postgres',
    password: process.env.CLOUD_DB_PASSWORD || 'tizo123',
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 30000,
});

// Alias localPool as pool for backward compatibility with existing API routes
const pool = localPool;

// ========================================================
// SYNC LOGIC START
// ========================================================

// Obsolete manual list - now we fetch dynamically
// const SYNC_TABLES = [ ... ];

async function getTables(pool) {
    const query = `
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
    `;
    const result = await pool.query(query);
    return result.rows.map(row => row.table_name);
}

async function createLocalTable(tableName) {
    console.log(`   🛠️  Creating missing table locally: ${tableName}`);
    try {
        // Get column definitions from Cloud
        const query = `
            SELECT column_name, data_type, character_maximum_length, is_nullable, udt_name
            FROM information_schema.columns
            WHERE table_name = $1 AND table_schema = 'public'
        `;
        const result = await cloudPool.query(query, [tableName]);

        if (result.rows.length === 0) {
            console.log(`   ⚠️  Table ${tableName} has no columns in cloud? Skipping creation.`);
            return false;
        }

        // Construct CREATE TABLE statement
        let createSql = `CREATE TABLE "${tableName}" (`;
        const colDefs = result.rows.map(col => {
            let type = col.data_type;

            // Handle ARRAY types using udt_name (e.g. _text -> text[])
            if (col.data_type === 'ARRAY') {
                if (col.udt_name.startsWith('_')) {
                    type = col.udt_name.substring(1) + '[]';
                } else {
                    type = 'text[]'; // Fallback
                }
            } else if (col.udt_name === 'geometry') {
                type = 'geometry';
            }

            let def = `"${col.column_name}" ${type}`;

            // Add length for varchar/char (only if not an array)
            if (['character varying', 'character', 'varchar', 'char'].includes(col.data_type) && col.character_maximum_length) {
                def += `(${col.character_maximum_length})`;
            }

            return def;
        });
        createSql += colDefs.join(', ');
        createSql += ');';

        // Execute on Local
        await localPool.query(createSql);
        console.log(`   ✨ Created table ${tableName} locally`);
        return true;
    } catch (err) {
        console.error(`   ❌ Failed to create table ${tableName}:`, err.message);
        throw err;
    }
}

async function getTableData(pool, tableName) {
    const result = await pool.query(`SELECT * FROM ${tableName}`);
    return result.rows;
}

async function getTableColumns(pool, tableName) {
    const query = `
        SELECT column_name, data_type, udt_name
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = $1
    `;
    const result = await pool.query(query, [tableName]);
    return result.rows.map(row => ({
        name: row.column_name,
        dataType: row.data_type,
        udtName: row.udt_name // e.g., 'jsonb', '_text' for text[]
    }));
}

/**
 * Ensure local table has all columns that exist in the cloud table
 * Automatically adds missing columns to local DB
 */
async function ensureMissingColumns(tableName) {
    try {
        // Get columns from cloud
        const cloudColumnsQuery = `
            SELECT column_name, data_type, udt_name, character_maximum_length
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = $1
        `;
        const cloudResult = await cloudPool.query(cloudColumnsQuery, [tableName]);
        const cloudColumns = cloudResult.rows;

        // Get columns from local
        const localResult = await localPool.query(cloudColumnsQuery, [tableName]);
        const localColumns = new Set(localResult.rows.map(r => r.column_name));

        // Find missing columns
        const missingColumns = cloudColumns.filter(col => !localColumns.has(col.column_name));

        if (missingColumns.length > 0) {
            console.log(`   🔧 Adding ${missingColumns.length} missing column(s) to local table...`);

            for (const col of missingColumns) {
                let type = col.data_type;

                // Handle ARRAY types
                if (col.data_type === 'ARRAY') {
                    if (col.udt_name.startsWith('_')) {
                        type = col.udt_name.substring(1) + '[]';
                    } else {
                        type = 'text[]';
                    }
                } else if (col.udt_name === 'jsonb') {
                    type = 'jsonb';
                } else if (col.udt_name === 'geometry') {
                    type = 'geometry';
                }

                // Add length for varchar/char
                if (['character varying', 'varchar'].includes(col.data_type) && col.character_maximum_length) {
                    type += `(${col.character_maximum_length})`;
                }

                const alterSql = `ALTER TABLE "${tableName}" ADD COLUMN IF NOT EXISTS "${col.column_name}" ${type}`;
                await localPool.query(alterSql);
                console.log(`      ✅ Added column: ${col.column_name} (${type})`);
            }
        }
    } catch (err) {
        console.error(`   ⚠️ Error checking/adding columns for ${tableName}:`, err.message);
        // Don't throw - continue with sync even if column check fails
    }
}

async function syncTable(tableName) {
    console.log(`\n🔄 Syncing table: ${tableName}`);
    try {
        // 0. Ensure local table has all columns from cloud (auto-migration)
        await ensureMissingColumns(tableName);

        // 1. Fetch all data from CLOUD
        const cloudData = await getTableData(cloudPool, tableName);
        console.log(`   📥 Fetched ${cloudData.length} rows from cloud`);

        // 2. Get column info (name + type)
        const columnInfo = await getTableColumns(cloudPool, tableName);
        const columns = columnInfo.map(c => c.name);

        // 3. Begin transaction on LOCAL
        const client = await localPool.connect();
        try {
            await client.query('BEGIN');

            // 4. DELETE all existing LOCAL data
            await client.query(`DELETE FROM ${tableName}`);
            console.log(`   🗑️  Cleared local table`);

            // 5. INSERT cloud data into LOCAL
            if (cloudData.length > 0) {
                for (const row of cloudData) {
                    // Process values - handle different column types
                    const values = columnInfo.map(colInfo => {
                        const val = row[colInfo.name];
                        if (val === null) return null;

                        // JSONB columns - stringify JS objects to JSON
                        if (colInfo.udtName === 'jsonb' && typeof val === 'object') {
                            return JSON.stringify(val);
                        }

                        // PostgreSQL arrays (text[], int[], etc.) - pass as-is
                        // node-postgres handles arrays correctly
                        return val;
                    });
                    const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
                    const columnNames = columns.map(col => `"${col}"`).join(', ');

                    await client.query(
                        `INSERT INTO "${tableName}" (${columnNames}) VALUES (${placeholders})`,
                        values
                    );
                }
            }
            console.log(`   ✅ Inserted ${cloudData.length} rows into local`);

            // 6. COMMIT transaction
            await client.query('COMMIT');
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    } catch (err) {
        console.error(`❌ Error syncing ${tableName}:`, err.message);
        throw err;
    }
}

async function syncAllTables() {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('🔄 Starting ONE-WAY sync: Cloud → Local');
    console.log('   (Local changes will be overwritten by cloud data)');
    console.log('═══════════════════════════════════════════════════════════');

    // Test connections
    try {
        await localPool.query('SELECT 1');
        console.log('✅ Connected to Local database');
        await cloudPool.query('SELECT 1');
        console.log('✅ Connected to Cloud database');
    } catch (err) {
        console.error('❌ Connection failed:', err.message);
        return;
    }

    // Dynamic Sync: Fetch all valid tables from Cloud
    let tablesToSync = [];
    let errorCount = 0;
    try {
        const cloudTables = await getTables(cloudPool);
        const localTables = await getTables(localPool);
        const localTableSet = new Set(localTables);

        console.log(`   📋 Found ${cloudTables.length} tables in Cloud`);

        // Tables that are written locally and synced TO cloud — never overwrite from cloud
        const LOCAL_WRITE_TABLES = new Set(['customer_transactions', 'kiosk_heartbeats']);

        for (const tableName of cloudTables) {
            // Filter out system or irrelevant tables if needed
            if (tableName.startsWith('pg_') || tableName.startsWith('sql_')) continue;

            // Skip local-write tables — these are written by the kiosk and pushed TO cloud,
            // not pulled FROM cloud. Syncing them would wipe unsent local transactions.
            if (LOCAL_WRITE_TABLES.has(tableName)) {
                console.log(`   ⏭️  Skipping local-write table: ${tableName}`);
                continue;
            }

            // Check if table exists locally
            if (!localTableSet.has(tableName)) {
                console.log(`   ⚠️  Table '${tableName}' missing locally`);
                try {
                    await createLocalTable(tableName);
                    // Add to sync list if creation succeeded
                    tablesToSync.push(tableName);
                } catch (createErr) {
                    console.error(`   ❌ Failed to create '${tableName}', skipping sync for it.`);
                    errorCount++;
                }
            } else {
                tablesToSync.push(tableName);
            }
        }
    } catch (err) {
        console.error('❌ Failed to fetch table lists:', err.message);
        return;
    }

    // Sync each identified table
    console.log(`   🚀 Syncing ${tablesToSync.length} tables...`);
    for (const table of tablesToSync) {
        try {
            await syncTable(table);
        } catch (e) {
            errorCount++;
        }
    }

    console.log('═══════════════════════════════════════════════════════════');
    console.log(`✅ Sync complete: ${tablesToSync.length} tables processed, ${errorCount} errors`);
    console.log('═══════════════════════════════════════════════════════════');

    // Re-resolve venue in case new places were synced from cloud
    await resolveVenueFromDB();

    // Refresh cache if server is running
    await loadUpsellOffersCache();

    // Update last sync time so frontend knows to reload
    lastSyncTime = Date.now();
}

// Calculate milliseconds until a specific hour:minute today or tomorrow
function msUntilTime(hour, minute = 0) {
    const now = new Date();
    const target = new Date(now);
    target.setHours(hour, minute, 0, 0);
    if (target <= now) {
        // Already passed today, schedule for tomorrow
        target.setDate(target.getDate() + 1);
    }
    return target.getTime() - now.getTime();
}

/**
 * Scheduled Offer Sync (Cloud → Local)
 * Replaces the old 1-minute periodic sync.
 * Syncs at: server startup + 10:00 AM + 8:00 PM local kiosk time.
 * If sync fails (no network), existing local DB data is used.
 */
async function startScheduledSync() {
    console.log(`\n⏰ Scheduled offer sync enabled: startup + 10:00 AM + 8:00 PM`);

    // 1. Sync immediately on startup
    try {
        console.log('🔄 Running initial offer sync on startup...');
        await syncAllTables();
        console.log('✅ Initial offer sync completed');
    } catch (e) {
        console.error('⚠️ Initial offer sync failed (using existing local DB):', e.message);
    }

    // 2. Schedule 10:00 AM sync
    const msTo10AM = msUntilTime(10, 0);
    const hours10AM = (msTo10AM / 3600000).toFixed(1);
    console.log(`   ⏰ Next 10:00 AM offer sync in ${hours10AM} hours`);
    setTimeout(async () => {
        try {
            console.log('\n⏰ [10:00 AM] Triggering scheduled offer sync...');
            await syncAllTables();
        } catch (e) {
            console.error('⚠️ 10:00 AM offer sync failed:', e.message);
        }
        // Then repeat every 24 hours
        setInterval(async () => {
            try {
                console.log('\n⏰ [10:00 AM] Triggering scheduled offer sync...');
                await syncAllTables();
            } catch (e) {
                console.error('⚠️ 10:00 AM offer sync failed:', e.message);
            }
        }, 24 * 60 * 60 * 1000);
    }, msTo10AM);

    // 3. Schedule 8:00 PM sync
    const msTo8PM = msUntilTime(20, 0);
    const hours8PM = (msTo8PM / 3600000).toFixed(1);
    console.log(`   ⏰ Next 8:00 PM offer sync in ${hours8PM} hours`);
    setTimeout(async () => {
        try {
            console.log('\n⏰ [8:00 PM] Triggering scheduled offer sync...');
            await syncAllTables();
        } catch (e) {
            console.error('⚠️ 8:00 PM offer sync failed:', e.message);
        }
        // Then repeat every 24 hours
        setInterval(async () => {
            try {
                console.log('\n⏰ [8:00 PM] Triggering scheduled offer sync...');
                await syncAllTables();
            } catch (e) {
                console.error('⚠️ 8:00 PM offer sync failed:', e.message);
            }
        }, 24 * 60 * 60 * 1000);
    }, msTo8PM);
}

// Real-time listener variables
let notifyClient = null;
let isListening = false;

/**
 * Setup real-time listener for database changes
 * Uses PostgreSQL LISTEN/NOTIFY for instant sync instead of polling
 * IMPORTANT: Uses a standalone Client (not pool) to keep connection alive
 */
async function setupRealtimeListener() {
    if (isListening) {
        console.log('⚠️  Real-time listener already active');
        return;
    }

    try {
        // Create a STANDALONE client (not from pool) for LISTEN
        // Pool connections get released after idle, breaking LISTEN
        const { Client } = require('pg');
        notifyClient = new Client({
            host: process.env.CLOUD_DB_HOST || '47.129.117.239',
            port: process.env.CLOUD_DB_PORT || 5433,
            database: process.env.CLOUD_DB_NAME || 'TimeZone',
            user: process.env.CLOUD_DB_USER || 'postgres',
            password: process.env.CLOUD_DB_PASSWORD || 'tizo123',
        });

        await notifyClient.connect();
        console.log('\n🔔 Setting up real-time database listener...');

        // Listen for notifications on 'kiosk_data_change' channel
        await notifyClient.query('LISTEN kiosk_data_change');
        isListening = true;
        console.log('✅ Real-time listener active on channel: kiosk_data_change');
        console.log('   📡 Kiosk will sync immediately when cloud data changes\n');

        // Handle incoming notifications
        notifyClient.on('notification', async (msg) => {
            if (msg.channel === 'kiosk_data_change') {
                try {
                    const payload = JSON.parse(msg.payload);
                    console.log(`\n🔔 Database change detected!`);
                    console.log(`   Table: ${payload.table}`);
                    console.log(`   Operation: ${payload.operation}`);
                    console.log(`   Time: ${new Date(payload.timestamp).toLocaleTimeString()}`);
                    console.log('   🔄 Triggering immediate sync...\n');

                    // Trigger immediate sync
                    await syncAllTables();
                    console.log('✅ Real-time sync completed\n');
                } catch (err) {
                    console.error('❌ Error processing notification:', err.message);
                }
            }
        });

        // Handle connection errors - reconnect automatically
        notifyClient.on('error', (err) => {
            console.error('❌ Notification client error:', err.message);
            isListening = false;
            notifyClient = null;
            // Attempt to reconnect after 5 seconds
            setTimeout(() => {
                console.log('🔄 Attempting to reconnect real-time listener...');
                setupRealtimeListener();
            }, 5000);
        });

        // Handle connection end - reconnect automatically
        notifyClient.on('end', () => {
            console.log('⚠️  Notification client disconnected');
            isListening = false;
            notifyClient = null;
            // Attempt to reconnect after 5 seconds
            setTimeout(() => {
                console.log('🔄 Attempting to reconnect real-time listener...');
                setupRealtimeListener();
            }, 5000);
        });

    } catch (err) {
        console.error('❌ Failed to setup real-time listener:', err.message);
        console.log('⚠️  Falling back to periodic sync mode');
        isListening = false;
        // Retry after 30 seconds
        setTimeout(() => {
            console.log('🔄 Retrying real-time listener setup...');
            setupRealtimeListener();
        }, 30000);
    }
}

// ========================================================
// SYNC LOGIC END
// ========================================================

// ========================================================
// CUSTOMER TRANSACTIONS & HEARTBEAT
// ========================================================

/**
 * Auto-create customer_transactions table in LOCAL DB on startup.
 * This table stores every completed kiosk transaction locally.
 * The synced_to_cloud flag tracks which rows have been uploaded.
 */
async function ensureCustomerTransactionsTable() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS customer_transactions (
                id SERIAL PRIMARY KEY,
                session_id VARCHAR(100),
                order_number VARCHAR(50),
                place VARCHAR(200),
                kiosk_location VARCHAR(50),
                is_new_user BOOLEAN,
                language VARCHAR(10),
                transaction_timestamp TIMESTAMPTZ DEFAULT NOW(),
                transaction_date DATE DEFAULT CURRENT_DATE,
                card_type VARCHAR(50),
                card_quantity INTEGER DEFAULT 1,
                offer_id INTEGER,
                offer_name VARCHAR(200),
                offer_cost NUMERIC DEFAULT 0,
                offer_tizo NUMERIC DEFAULT 0,
                offer_type VARCHAR(50),
                custom_amount NUMERIC,
                upsell_accepted BOOLEAN DEFAULT FALSE,
                second_upsell_accepted BOOLEAN DEFAULT FALSE,
                upsell_cost NUMERIC DEFAULT 0,
                upsell_tizo NUMERIC DEFAULT 0,
                ood_accepted BOOLEAN DEFAULT FALSE,
                ood_cost NUMERIC DEFAULT 0,
                ood_tizo NUMERIC DEFAULT 0,
                ooh_accepted BOOLEAN DEFAULT FALSE,
                ooh_cost NUMERIC DEFAULT 0,
                ooh_tizo NUMERIC DEFAULT 0,
                snacks_accepted BOOLEAN DEFAULT FALSE,
                snacks_cost NUMERIC DEFAULT 0,
                snacks_tizo NUMERIC DEFAULT 0,
                feedback_rating INTEGER,
                feedback_comment TEXT,
                scratch_card_revealed BOOLEAN DEFAULT FALSE,
                scratch_prize_type VARCHAR(100),
                scratch_prize_value NUMERIC DEFAULT 0,
                scratch_prize_label VARCHAR(200),
                bonus_accepted BOOLEAN DEFAULT FALSE,
                bonus_cost NUMERIC DEFAULT 0,
                bonus_tizo NUMERIC DEFAULT 0,
                bonus_gift VARCHAR(200),
                bonus_gift_details VARCHAR(200),
                bonus_free_games INTEGER DEFAULT 0,
                total_cost NUMERIC DEFAULT 0,
                total_tizo NUMERIC DEFAULT 0,
                final_payment NUMERIC DEFAULT 0,
                final_tizo NUMERIC DEFAULT 0,
                duration_seconds INTEGER DEFAULT 0,
                synced_to_cloud BOOLEAN DEFAULT FALSE
            )
        `);
        console.log('✅ customer_transactions table ready (local)');

        // Migration: Ensure synced_to_cloud column exists (for existing tables)
        try {
            await pool.query('ALTER TABLE customer_transactions ADD COLUMN IF NOT EXISTS synced_to_cloud BOOLEAN DEFAULT FALSE');
            console.log('✅ Checked/Added synced_to_cloud column');
        } catch (e) {
            try {
                await pool.query('ALTER TABLE customer_transactions ADD COLUMN synced_to_cloud BOOLEAN DEFAULT FALSE');
            } catch (ignored) { /* Ignore "column exists" error */ }
        }

        // Migration: Fix id column to use SERIAL sequence (if old table has plain integer id)
        try {
            await pool.query(`
                DO $$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'customer_transactions'
                        AND column_name = 'id'
                        AND column_default LIKE 'nextval%'
                    ) THEN
                        CREATE SEQUENCE IF NOT EXISTS customer_transactions_id_seq;
                        ALTER TABLE customer_transactions ALTER COLUMN id SET DEFAULT nextval('customer_transactions_id_seq');
                        PERFORM setval('customer_transactions_id_seq', COALESCE((SELECT MAX(id) FROM customer_transactions), 0) + 1, false);
                    END IF;
                END $$;
            `);
            console.log('✅ Checked/Fixed id sequence for customer_transactions');
        } catch (e) {
            console.warn('⚠️ Could not fix id sequence:', e.message);
        }

        // Migration: Fix transaction_timestamp to have DEFAULT NOW() if missing
        try {
            await pool.query(`
                ALTER TABLE customer_transactions
                ALTER COLUMN transaction_timestamp SET DEFAULT NOW()
            `);
            console.log('✅ Checked/Fixed transaction_timestamp default');
        } catch (e) {
            // Ignore if already set
        }

        // Migration: Fix transaction_date to have DEFAULT CURRENT_DATE if missing
        try {
            await pool.query(`
                ALTER TABLE customer_transactions
                ALTER COLUMN transaction_date SET DEFAULT CURRENT_DATE
            `);
        } catch (e) {
            // Ignore if already set
        }
    } catch (err) {
        console.error('❌ Failed to create customer_transactions table:', err.message);
    }
}

/**
 * Auto-create kiosk_heartbeats table in CLOUD DB on startup.
 */
async function ensureHeartbeatTable() {
    try {
        await cloudPool.query(`
            CREATE TABLE IF NOT EXISTS kiosk_heartbeats (
                id SERIAL PRIMARY KEY,
                kiosk_id VARCHAR(50) NOT NULL UNIQUE,
                place VARCHAR(200),
                status VARCHAR(20) DEFAULT 'online',
                last_heartbeat TIMESTAMPTZ DEFAULT NOW(),
                server_started_at TIMESTAMPTZ,
                ip_address VARCHAR(50)
            )
        `);
        console.log('✅ kiosk_heartbeats table ready (cloud)');
    } catch (err) {
        console.error('⚠️ Could not create kiosk_heartbeats table in cloud (will retry):', err.message);
    }
}

/**
 * Auto-create customer_transactions table in CLOUD DB on startup.
 * Same schema as local but without synced_to_cloud column.
 */
async function ensureCloudTransactionsTable() {
    try {
        await cloudPool.query(`
            CREATE TABLE IF NOT EXISTS customer_transactions (
                id SERIAL PRIMARY KEY,
                session_id VARCHAR(100),
                order_number VARCHAR(50),
                place VARCHAR(200),
                kiosk_location VARCHAR(50),
                is_new_user BOOLEAN,
                language VARCHAR(10),
                transaction_timestamp TIMESTAMPTZ DEFAULT NOW(),
                transaction_date DATE DEFAULT CURRENT_DATE,
                card_type VARCHAR(50),
                card_quantity INTEGER DEFAULT 1,
                offer_id INTEGER,
                offer_name VARCHAR(200),
                offer_cost NUMERIC DEFAULT 0,
                offer_tizo NUMERIC DEFAULT 0,
                offer_type VARCHAR(50),
                custom_amount NUMERIC,
                upsell_accepted BOOLEAN DEFAULT FALSE,
                second_upsell_accepted BOOLEAN DEFAULT FALSE,
                upsell_cost NUMERIC DEFAULT 0,
                upsell_tizo NUMERIC DEFAULT 0,
                ood_accepted BOOLEAN DEFAULT FALSE,
                ood_cost NUMERIC DEFAULT 0,
                ood_tizo NUMERIC DEFAULT 0,
                ooh_accepted BOOLEAN DEFAULT FALSE,
                ooh_cost NUMERIC DEFAULT 0,
                ooh_tizo NUMERIC DEFAULT 0,
                snacks_accepted BOOLEAN DEFAULT FALSE,
                snacks_cost NUMERIC DEFAULT 0,
                snacks_tizo NUMERIC DEFAULT 0,
                feedback_rating INTEGER,
                feedback_comment TEXT,
                scratch_card_revealed BOOLEAN DEFAULT FALSE,
                scratch_prize_type VARCHAR(100),
                scratch_prize_value NUMERIC DEFAULT 0,
                scratch_prize_label VARCHAR(200),
                bonus_accepted BOOLEAN DEFAULT FALSE,
                bonus_cost NUMERIC DEFAULT 0,
                bonus_tizo NUMERIC DEFAULT 0,
                bonus_gift VARCHAR(200),
                bonus_gift_details VARCHAR(200),
                bonus_free_games INTEGER DEFAULT 0,
                total_cost NUMERIC DEFAULT 0,
                total_tizo NUMERIC DEFAULT 0,
                final_payment NUMERIC DEFAULT 0,
                final_tizo NUMERIC DEFAULT 0,
                duration_seconds INTEGER DEFAULT 0,
                source_kiosk_id VARCHAR(50)
            )
        `);
        console.log('✅ customer_transactions table ready (cloud)');
    } catch (err) {
        console.error('⚠️ Could not create customer_transactions table in cloud:', err.message);
    }
}

/**
 * Sync unsynced transactions from local DB to cloud DB.
 * Marks rows as synced_to_cloud = true after successful upload.
 */
async function syncTransactionsToCloud() {
    try {
        const result = await pool.query(
            'SELECT * FROM customer_transactions WHERE synced_to_cloud = false ORDER BY id'
        );
        if (result.rows.length === 0) {
            console.log('☁️  No unsynced transactions to push to cloud');
            return;
        }
        console.log(`☁️  Pushing ${result.rows.length} unsynced transaction(s) to cloud...`);
        let successCount = 0;
        const kioskId = (process.env.location || 'K1').toUpperCase();
        for (const row of result.rows) {
            try {
                await cloudPool.query(`
                    INSERT INTO customer_transactions (
                        session_id, order_number, place, kiosk_location,
                        is_new_user, language, transaction_timestamp, transaction_date,
                        card_type, card_quantity, offer_id, offer_name,
                        offer_cost, offer_tizo, offer_type, custom_amount,
                        upsell_accepted, second_upsell_accepted, upsell_cost, upsell_tizo,
                        ood_accepted, ood_cost, ood_tizo,
                        ooh_accepted, ooh_cost, ooh_tizo,
                        snacks_accepted, snacks_cost, snacks_tizo,
                        feedback_rating, feedback_comment,
                        scratch_card_revealed, scratch_prize_type, scratch_prize_value, scratch_prize_label,
                        bonus_accepted, bonus_cost, bonus_tizo,
                        bonus_gift, bonus_gift_details, bonus_free_games,
                        total_cost, total_tizo, final_payment, final_tizo,
                        duration_seconds, source_kiosk_id
                    ) VALUES (
                        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,
                        $17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,
                        $30,$31,$32,$33,$34,$35,$36,$37,$38,$39,$40,$41,$42,$43,$44,$45,$46,$47
                    )
                `, [
                    row.session_id, row.order_number, row.place, row.kiosk_location,
                    row.is_new_user, row.language, row.transaction_timestamp, row.transaction_date,
                    row.card_type, row.card_quantity, row.offer_id, row.offer_name,
                    row.offer_cost, row.offer_tizo, row.offer_type, row.custom_amount,
                    row.upsell_accepted, row.second_upsell_accepted, row.upsell_cost, row.upsell_tizo,
                    row.ood_accepted, row.ood_cost, row.ood_tizo,
                    row.ooh_accepted, row.ooh_cost, row.ooh_tizo,
                    row.snacks_accepted, row.snacks_cost, row.snacks_tizo,
                    row.feedback_rating, row.feedback_comment,
                    row.scratch_card_revealed, row.scratch_prize_type, row.scratch_prize_value, row.scratch_prize_label,
                    row.bonus_accepted, row.bonus_cost, row.bonus_tizo,
                    row.bonus_gift, row.bonus_gift_details, row.bonus_free_games,
                    row.total_cost, row.total_tizo, row.final_payment, row.final_tizo,
                    row.duration_seconds, kioskId
                ]);
                // Mark as synced
                await pool.query('UPDATE customer_transactions SET synced_to_cloud = true WHERE id = $1', [row.id]);
                successCount++;
            } catch (e) {
                console.error(`⚠️ Failed to push transaction ${row.id} to cloud:`, e.message);
                break; // Stop on first error (likely network issue)
            }
        }
        console.log(`✅ Pushed ${successCount}/${result.rows.length} transactions to cloud`);
    } catch (err) {
        console.error('⚠️ Transaction cloud sync failed:', err.message);
    }
}

/**
 * Scheduled Transaction Sync (Local → Cloud)
 * Pushes unsynced transactions at: server startup + 8:00 AM + 10:00 PM local time.
 */
async function startScheduledTransactionSync() {
    console.log(`\n☁️  Scheduled transaction sync enabled: startup + 8:00 AM + 10:00 PM`);

    // 1. Sync unsynced transactions on startup
    try {
        await syncTransactionsToCloud();
    } catch (e) {
        console.error('⚠️ Startup transaction sync failed:', e.message);
    }

    // 2. Schedule 8:00 AM sync
    const msTo8AM = msUntilTime(8, 0);
    const hours8AM = (msTo8AM / 3600000).toFixed(1);
    console.log(`   ☁️  Next 8:00 AM transaction sync in ${hours8AM} hours`);
    setTimeout(async () => {
        try {
            console.log('\n☁️  [8:00 AM] Triggering transaction sync to cloud...');
            await syncTransactionsToCloud();
        } catch (e) {
            console.error('⚠️ 8:00 AM transaction sync failed:', e.message);
        }
        setInterval(async () => {
            try {
                console.log('\n☁️  [8:00 AM] Triggering transaction sync to cloud...');
                await syncTransactionsToCloud();
            } catch (e) {
                console.error('⚠️ 8:00 AM transaction sync failed:', e.message);
            }
        }, 24 * 60 * 60 * 1000);
    }, msTo8AM);

    // 3. Schedule 10:00 PM sync
    const msTo10PM = msUntilTime(22, 0);
    const hours10PM = (msTo10PM / 3600000).toFixed(1);
    console.log(`   ☁️  Next 10:00 PM transaction sync in ${hours10PM} hours`);
    setTimeout(async () => {
        try {
            console.log('\n☁️  [10:00 PM] Triggering transaction sync to cloud...');
            await syncTransactionsToCloud();
        } catch (e) {
            console.error('⚠️ 10:00 PM transaction sync failed:', e.message);
        }
        setInterval(async () => {
            try {
                console.log('\n☁️  [10:00 PM] Triggering transaction sync to cloud...');
                await syncTransactionsToCloud();
            } catch (e) {
                console.error('⚠️ 10:00 PM transaction sync failed:', e.message);
            }
        }, 24 * 60 * 60 * 1000);
    }, msTo10PM);

    // 4. Periodic "Catch-up" Sync (Every 5 minutes)
    // Ensures data syncs shortly after network restoration if startup sync failed
    setInterval(async () => {
        try {
            // Only logs if there's actual work or error
            await syncTransactionsToCloud();
        } catch (e) {
            // Silent fail on network error to avoid log spam
        }
    }, 5 * 60 * 1000);
    console.log(`   ☁️  Periodic sync enabled: every 5 minutes`);
}

/**
 * Heartbeat: Pings cloud DB every 2 minutes to signal kiosk is online.
 * Uses UPSERT (ON CONFLICT) so there's one row per kiosk.
 */
/**
 * Heartbeat: Pings Offer Builder API every 1 minute to signal kiosk is online.
 * API triggers real-time SSE update on the dashboard.
 */
async function startHeartbeat() {
    const kioskId = (process.env.location || 'K1').toUpperCase();
    const place = process.env.PLACE || '';
    const serverStartedAt = new Date().toISOString();
    const OFFER_BUILDER_HEARTBEAT_URL = 'http://34.142.198.255:3001/api/kiosk-heartbeat';

    function sendHeartbeat() {
        const data = JSON.stringify({
            kioskId,
            place,
            serverStartedAt
        });

        const url = new URL(OFFER_BUILDER_HEARTBEAT_URL);
        const req = http.request({
            hostname: url.hostname,
            port: url.port,
            path: url.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data)
            },
            timeout: 5000 // 5s timeout
        }, (res) => {
            console.log(`💓 Heartbeat sent. Status: ${res.statusCode}`);
            res.resume();
        });

        req.on('error', (e) => {
            console.warn(`⚠️ Heartbeat failed: ${e.message}`);
        });

        req.write(data);
        req.end();
    }

    // Send immediately
    sendHeartbeat();
    console.log(`💓 Heartbeat started for kiosk ${kioskId} (sending to ${OFFER_BUILDER_HEARTBEAT_URL} every 1 min)`);

    // Then every 1 minute
    setInterval(sendHeartbeat, 60 * 1000);
}

// ========================================================
// CUSTOMER TRANSACTIONS & HEARTBEAT END
// ========================================================

const mimeTypes = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.json': 'application/json',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.ico': 'image/x-icon'
};

// Track the last sync time to allow frontend to reload
let lastSyncTime = Date.now();

const server = http.createServer((req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Disable caching for API requests
    if (req.url.startsWith('/api/')) {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
    }

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    // API: Get last sync time (for auto-reload)
    if (req.method === 'GET' && req.url === '/api/last-sync-time') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            success: true,
            lastSyncTime: lastSyncTime
        }));
        return;
    }

    // API: Health check - test database connection
    if (req.method === 'GET' && req.url === '/api/health') {
        pool.query('SELECT NOW() as time, current_database() as database')
            .then(result => {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: true,
                    status: 'connected',
                    database: result.rows[0].database,
                    serverTime: result.rows[0].time,
                    message: '✅ Database connection successful!'
                }));
            })
            .catch(err => {
                console.error('Database connection error:', err);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: false,
                    status: 'disconnected',
                    error: err.message,
                    message: '❌ Database connection failed!'
                }));
            });
        return;
    }

    // API: Trigger immediate sync from cloud (called by Offer Builder when offers change)
    // This provides instant sync without relying on PostgreSQL LISTEN/NOTIFY
    if (req.method === 'POST' && req.url === '/api/trigger-sync') {
        console.log('\n📡 Sync trigger received from Offer Builder!');

        // Parse optional body for source info
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                let source = 'unknown';
                if (body) {
                    try {
                        const data = JSON.parse(body);
                        source = data.source || 'unknown';
                        if (data.table) console.log(`   Table changed: ${data.table}`);
                        if (data.operation) console.log(`   Operation: ${data.operation}`);
                    } catch (e) { /* ignore parse errors */ }
                }
                console.log(`   Source: ${source}`);
                console.log('   🔄 Triggering immediate sync...\n');

                await syncAllTables();

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: true,
                    message: '✅ Sync completed successfully',
                    lastSyncTime: lastSyncTime
                }));
            } catch (err) {
                console.error('❌ Sync trigger failed:', err.message);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: false,
                    error: err.message
                }));
            }
        });
        return;
    }

    // API: Get kiosk config (PLACE, location) for dashboard logging
    if (req.method === 'GET' && req.url === '/api/kiosk-config') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            success: true,
            place: process.env.PLACE || '',
            location: process.env.location || '',
            venue: KIOSK_VENUE || '',
            resolvedVenue: RESOLVED_VENUE || ''
        }));
        return;
    }

    // API: Save a customer transaction to local DB
    if (req.method === 'POST' && req.url === '/api/customer-transaction') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const txn = JSON.parse(body);
                console.log('📝 Received local transaction:', JSON.stringify(txn, null, 2));
                const place = process.env.PLACE || '';
                const kioskLocation = (process.env.location || 'K1').toUpperCase();

                const result = await pool.query(`
                    INSERT INTO customer_transactions (
                        session_id, order_number, place, kiosk_location,
                        is_new_user, language, card_type, card_quantity,
                        offer_id, offer_name, offer_cost, offer_tizo, offer_type, custom_amount,
                        upsell_accepted, second_upsell_accepted, upsell_cost, upsell_tizo,
                        ood_accepted, ood_cost, ood_tizo,
                        ooh_accepted, ooh_cost, ooh_tizo,
                        snacks_accepted, snacks_cost, snacks_tizo,
                        feedback_rating, feedback_comment,
                        scratch_card_revealed, scratch_prize_type, scratch_prize_value, scratch_prize_label,
                        bonus_accepted, bonus_cost, bonus_tizo,
                        bonus_gift, bonus_gift_details, bonus_free_games,
                        total_cost, total_tizo, final_payment, final_tizo,
                        duration_seconds, synced_to_cloud
                    ) VALUES (
                        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,
                        $17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,
                        $30,$31,$32,$33,$34,$35,$36,$37,$38,$39,$40,$41,$42,$43,$44,false
                    ) RETURNING id
                `, [
                    txn.sessionId || null,
                    txn.orderNumber || null,
                    txn.place || place,
                    txn.kioskLocation || kioskLocation,
                    txn.isNewUser === true,
                    txn.language || 'id',
                    txn.cardType || null,
                    parseInt(txn.cardQuantity) || 1,
                    txn.offerId || null,
                    txn.offerName || null,
                    parseFloat(txn.offerCost) || 0,
                    parseFloat(txn.offerTizo) || 0,
                    txn.offerType || null,
                    txn.customAmount ? parseFloat(txn.customAmount) : null,
                    txn.upsellAccepted === true,
                    txn.secondUpsellAccepted === true,
                    parseFloat(txn.upsellCost) || 0,
                    parseFloat(txn.upsellTizo) || 0,
                    txn.oodAccepted === true,
                    parseFloat(txn.oodCost) || 0,
                    parseFloat(txn.oodTizo) || 0,
                    txn.oohAccepted === true,
                    parseFloat(txn.oohCost) || 0,
                    parseFloat(txn.oohTizo) || 0,
                    txn.snacksAccepted === true,
                    parseFloat(txn.snacksCost) || 0,
                    parseFloat(txn.snacksTizo) || 0,
                    txn.feedbackRating ? parseInt(txn.feedbackRating) : null,
                    txn.feedbackComment || null,
                    txn.scratchCardRevealed === true,
                    txn.scratchPrizeType || null,
                    parseFloat(txn.scratchPrizeValue) || 0,
                    txn.scratchPrizeLabel || null,
                    txn.bonusAccepted === true,
                    parseFloat(txn.bonusCost) || 0,
                    parseFloat(txn.bonusTizo) || 0,
                    txn.bonusGift || null,
                    txn.bonusGiftDetails || null,
                    parseInt(txn.bonusFreeGames) || 0,
                    parseFloat(txn.totalCost) || 0,
                    parseFloat(txn.totalTizo) || 0,
                    parseFloat(txn.finalPayment) || 0,
                    parseFloat(txn.finalTizo) || 0,
                    parseInt(txn.durationSeconds) || 0
                ]);

                const newId = result.rows[0].id;
                console.log(`💾 Transaction #${newId} saved locally (session: ${txn.sessionId})`);

                // Attempt immediate cloud push in background (fire-and-forget)
                syncTransactionsToCloud().catch(() => { });

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, id: newId }));
            } catch (err) {
                console.error('❌ Failed to save transaction:', err.message);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: err.message }));
            }
        });
        return;
    }

    // API: Get recent customer transactions
    if (req.method === 'GET' && req.url.startsWith('/api/customer-transactions')) {
        const urlParams = new URL(req.url, LOCAL_URL);
        const limit = parseInt(urlParams.searchParams.get('limit')) || 50;
        pool.query(
            'SELECT * FROM customer_transactions ORDER BY id DESC LIMIT $1',
            [limit]
        ).then(result => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, data: result.rows, count: result.rows.length }));
        }).catch(err => {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: err.message }));
        });
        return;
    }

    // API: Get layout config based on card type count
    if (req.method === 'GET' && req.url.startsWith('/api/layout-config')) {
        const urlParams = new URL(req.url, LOCAL_URL);
        const cardType = urlParams.searchParams.get('cardType');

        if (!cardType) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'cardType parameter is required' }));
            return;
        }

        // Map frontend card names to database card_type values
        const cardTypeMap = {
            'red': 'Welcome',
            'welcome': 'Welcome',
            'blue': 'Blue',
            'gold': 'Gold',
            'platinum': 'Platinum',
            'new_user': 'New User'
        };

        const dbCardType = cardTypeMap[cardType.toLowerCase()] || cardType;

        // Count only active offers within valid date range, filtered by venue if configured
        let countQuery = `SELECT COUNT(*) as count FROM offers 
            WHERE card_type = $1 
            AND is_active = true 
            AND (start_date IS NULL OR start_date <= CURRENT_DATE) 
            AND (end_date IS NULL OR end_date >= CURRENT_DATE)`;
        let params = [dbCardType];

        // Apply venue filter if configured (uses fuzzy-resolved venue name)
        if (RESOLVED_VENUE) {
            countQuery += ` AND (venue IS NULL OR venue = '{}' OR $2 = ANY(venue))`;
            params.push(RESOLVED_VENUE);
            console.log(`[/api/layout-config] ✅ Venue filter APPLIED: ${RESOLVED_VENUE}`);
        }

        pool.query(countQuery, params)
            .then(result => {
                const count = parseInt(result.rows[0].count);
                let layout;

                if (count <= 3) {
                    layout = 3;
                } else if (count === 4) {
                    layout = 4;
                } else {
                    layout = 5;
                }

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: true,
                    layout: layout,
                    count: count,
                    cardType: dbCardType,
                    message: `Found ${count} ${dbCardType} cards, using layout ${layout}`
                }));
            })
            .catch(err => {
                console.error('Database error:', err);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: err.message }));
            });
        return;
    }

    // API: Get scratch card offers by card type
    // Category = "Scratch Card", card_type = "New User" or other card types
    if (req.method === 'GET' && req.url.startsWith('/api/scratch-card')) {
        const urlParams = new URL(req.url, LOCAL_URL);
        const cardType = urlParams.searchParams.get('cardType');

        const cardTypeMap = {
            'red': 'Welcome',
            'welcome': 'Welcome',
            'blue': 'Blue',
            'gold': 'Gold',
            'platinum': 'Platinum',
            'new_user': 'Scratch Card - New User',
            'existing_user': 'Scratch Card - Existing User'
        };

        const dbCardType = cardType ? (cardTypeMap[cardType.toLowerCase()] || cardType) : null;

        let query = `SELECT * FROM offers WHERE category = 'Scratch Card' AND is_active = true 
            AND (start_date IS NULL OR start_date <= CURRENT_DATE) 
            AND (end_date IS NULL OR end_date >= CURRENT_DATE)`;
        let params = [];

        if (dbCardType) {
            query += ' AND card_type = $1';
            params.push(dbCardType);
        }

        query += ' ORDER BY cost DESC, id DESC LIMIT 1';

        pool.query(query, params)
            .then(async result => {
                if (result.rows.length > 0) {
                    const offer = result.rows[0];

                    // Check for gift pool from OfferBuilder (gift_pool JSON column)
                    let prizes = [];
                    let selectedPrize = null;
                    let isRandomGift = true;

                    try {
                        // Parse gift_pool if it's a string (JSON stored as text)
                        let giftPool = offer.gift_pool;
                        if (typeof giftPool === 'string') {
                            try {
                                giftPool = JSON.parse(giftPool);
                            } catch (parseErr) {
                                console.error('[Scratch Card] Failed to parse gift_pool JSON:', parseErr);
                                giftPool = null;
                            }
                        }

                        console.log(`[Scratch Card] offer.id=${offer.id}, gift_pool type=${typeof giftPool}, is_random_gift=${offer.is_random_gift}`);
                        console.log(`[Scratch Card] gift_pool:`, giftPool);

                        // First, check if offer has gift_pool (from OfferBuilder)
                        if (giftPool && Array.isArray(giftPool) && giftPool.length > 0) {
                            console.log(`[Scratch Card] Using gift_pool from OfferBuilder (${giftPool.length} items)`);
                            isRandomGift = offer.is_random_gift !== false; // Default to true

                            // Map gift_pool entries to prize format
                            prizes = giftPool.map((gift, index) => ({
                                id: index + 1,
                                prize_type: gift.type, // 'TIZO', 'Gift'
                                prize_value: parseInt(gift.value) || 0,
                                prize_label: gift.label || (gift.type === 'TIZO' ? `${gift.value} TIZO` : gift.label),
                                probability: 1 // Equal probability for OfferBuilder gifts
                            }));

                            // Random selection from gift pool
                            if (isRandomGift && prizes.length > 0) {
                                const randomIndex = Math.floor(Math.random() * prizes.length);
                                selectedPrize = prizes[randomIndex];
                                console.log(`[Scratch Card] Randomly selected: ${selectedPrize.prize_label}`);
                            } else if (prizes.length > 0) {
                                selectedPrize = prizes[0]; // First prize if not random
                            }
                        } else {
                            // Fallback: Fetch prizes from scratch_card_prizes table
                            const prizesResult = await pool.query(
                                'SELECT * FROM scratch_card_prizes WHERE scratch_card_id = $1 AND is_active = true ORDER BY id',
                                [offer.id]
                            );
                            if (prizesResult.rows.length > 0) {
                                prizes = prizesResult.rows.map(p => ({
                                    id: p.id,
                                    prize_type: p.prize_type,
                                    prize_value: parseInt(p.prize_value),
                                    prize_label: p.prize_label,
                                    probability: parseFloat(p.probability)
                                }));

                                // Weighted random selection
                                const totalWeight = prizes.reduce((sum, p) => sum + p.probability, 0);
                                let random = Math.random() * totalWeight;
                                selectedPrize = prizes[0];
                                for (const prize of prizes) {
                                    random -= prize.probability;
                                    if (random <= 0) {
                                        selectedPrize = prize;
                                        break;
                                    }
                                }
                                console.log(`[Scratch Card] Selected prize from table: ${selectedPrize.prize_label}`);
                            }
                        }
                    } catch (prizeErr) {
                        console.error('Error fetching prizes:', prizeErr);
                    }

                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        success: true,
                        offer: {
                            id: offer.id,
                            cost: parseFloat(offer.cost),
                            tizo_credit: selectedPrize ? selectedPrize.prize_value : (parseFloat(offer.tizo_credit) || 0),
                            card_type: offer.card_type,
                            category: offer.category,
                            free_games: offer.free_games || null,
                            gift: offer.gift || null,
                            gift_details: offer.gift_details || null,
                            // New prize pool fields
                            has_prize_pool: prizes.length > 0,
                            prizes: prizes,
                            selected_prize: selectedPrize
                        },
                        message: selectedPrize
                            ? `Scratch card - Won: ${selectedPrize.prize_label}`
                            : `Scratch card offer for ${dbCardType || 'default'}`
                    }));
                } else {
                    // Fallback: If no specific card offer found (e.g. Gold) and we were looking for one,
                    // try to find a generic "Existing User" offer (unless we were looking for New User)
                    if (dbCardType !== 'Scratch Card - New User' && dbCardType !== 'Scratch Card - Existing User') {
                        const fallbackQuery = `SELECT * FROM offers WHERE category = 'Scratch Card' AND is_active = true 
                            AND (start_date IS NULL OR start_date <= CURRENT_DATE) 
                            AND (end_date IS NULL OR end_date >= CURRENT_DATE)
                            AND card_type = 'Scratch Card - Existing User'
                            ORDER BY cost DESC, id DESC LIMIT 1`;

                        pool.query(fallbackQuery)
                            .then(fallbackResult => {
                                if (fallbackResult.rows.length > 0) {
                                    const offer = fallbackResult.rows[0];
                                    res.writeHead(200, { 'Content-Type': 'application/json' });
                                    res.end(JSON.stringify({
                                        success: true,
                                        offer: {
                                            id: offer.id,
                                            cost: parseFloat(offer.cost),
                                            tizo_credit: parseFloat(offer.tizo_credit),
                                            card_type: offer.card_type,
                                            category: offer.category,
                                            free_games: offer.free_games || null,
                                            gift: offer.gift || null,
                                            gift_details: offer.gift_details || null
                                        },
                                        message: `Fallback scratch card offer for Existing User`
                                    }));
                                } else {
                                    res.writeHead(200, { 'Content-Type': 'application/json' });
                                    res.end(JSON.stringify({
                                        success: true,
                                        offer: null,
                                        message: 'No active scratch card offer found (checked specific and existing user)'
                                    }));
                                }
                            })
                            .catch(err => {
                                console.error('Database error in fallback:', err);
                                res.writeHead(500, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify({ success: false, error: err.message }));
                            });
                        return;
                    }

                    // Return null if no scratch card offer found
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        success: true,
                        offer: null,
                        message: 'No active scratch card offer found'
                    }));
                }
            })
            .catch(err => {
                console.error('Database error:', err);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: err.message }));
            });
        return;
    }

    // API: Get scratch card prizes and randomly select one
    // Returns all available prizes for a scratch card + a randomly selected winner
    if (req.method === 'GET' && req.url.startsWith('/api/scratch-card-prizes')) {
        const urlParams = new URL(req.url, LOCAL_URL);
        const scratchCardId = urlParams.searchParams.get('scratchCardId');

        if (!scratchCardId) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'scratchCardId parameter is required' }));
            return;
        }

        pool.query(
            'SELECT * FROM scratch_card_prizes WHERE scratch_card_id = $1 AND is_active = true ORDER BY id',
            [parseInt(scratchCardId)]
        )
            .then(result => {
                if (result.rows.length === 0) {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        success: true,
                        prizes: [],
                        selectedPrize: null,
                        message: 'No prizes found for this scratch card'
                    }));
                    return;
                }

                const prizes = result.rows.map(p => ({
                    id: p.id,
                    prize_type: p.prize_type,
                    prize_value: parseInt(p.prize_value),
                    prize_label: p.prize_label,
                    probability: parseFloat(p.probability)
                }));

                // Weighted random selection based on probability
                const totalWeight = prizes.reduce((sum, p) => sum + p.probability, 0);
                let random = Math.random() * totalWeight;
                let selectedPrize = prizes[0]; // fallback

                for (const prize of prizes) {
                    random -= prize.probability;
                    if (random <= 0) {
                        selectedPrize = prize;
                        break;
                    }
                }

                console.log(`[Scratch Card] Selected prize for card ${scratchCardId}: ${selectedPrize.prize_label}`);

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: true,
                    prizes: prizes,
                    selectedPrize: selectedPrize,
                    message: `Won: ${selectedPrize.prize_label}`
                }));
            })
            .catch(err => {
                console.error('Database error fetching prizes:', err);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: err.message }));
            });
        return;
    }

    // API: Get card info from card_offers table
    if (req.method === 'GET' && req.url.startsWith('/api/card-info')) {
        const urlParams = new URL(req.url, LOCAL_URL);
        const cardId = urlParams.searchParams.get('cardId');

        let query = 'SELECT * FROM card_offers WHERE is_active = true';
        let params = [];

        if (cardId) {
            query += ' AND id = $1';
            params.push(cardId.toLowerCase());
        }

        query += ' ORDER BY id';

        pool.query(query, params)
            .then(result => {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                if (cardId && result.rows.length > 0) {
                    // Single card requested
                    res.end(JSON.stringify({
                        success: true,
                        card: result.rows[0]
                    }));
                } else {
                    // All cards or no match
                    res.end(JSON.stringify({
                        success: true,
                        cards: result.rows,
                        count: result.rows.length
                    }));
                }
            })
            .catch(err => {
                console.error('Database error:', err);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: err.message }));
            });
        return;
    }

    // API: Get offers by card type OR category (for OOH/OOD screensaver) OR by ID OR by cost
    if (req.method === 'GET' && req.url.startsWith('/api/offers')) {
        const urlParams = new URL(req.url, LOCAL_URL);
        const cardType = urlParams.searchParams.get('cardType');
        const category = urlParams.searchParams.get('category');
        const offerId = urlParams.searchParams.get('offerId');
        const cost = urlParams.searchParams.get('cost'); // For looking up offer by cost (used for icon retrieval)
        const excludeImages = urlParams.searchParams.get('excludeImages') === 'true';
        const screensaverOnly = urlParams.searchParams.get('screensaverOnly') === 'true';

        const cardTypeMap = {
            'red': 'Welcome',
            'welcome': 'Welcome',
            'blue': 'Blue',
            'gold': 'Gold',
            'platinum': 'Platinum',
            'new_user': 'New User',
            'new_user_blue': 'New User - Blue',
            'new_user_gold': 'New User - Gold',
            'new_user_platinum': 'New User - Platinum',
            'new_user_welcome': 'New User - Welcome'
        };

        // Category map for OOH/OOD (case-insensitive)
        // Maps URL parameters to actual category names saved by Offer Builder
        const categoryMap = {
            'ooh': 'Fixed Offer',
            'ood': 'OOD',
            'snacks': 'Scratch Card',
            'voucher': 'Voucher',
            'scratch card': 'Scratch Card'
        };

        // Build query with filters for is_active and date range
        // If excludeImages is true, select only non-image columns for faster response
        const selectColumns = excludeImages
            ? 'id, product_name, cost, bonus_percent, tizo_credit, category, start_date, end_date, card_type, venue, gift, gift_details, created_at, updated_at, is_active'
            : '*';

        let query = `SELECT ${selectColumns} FROM offers WHERE is_active = true 
            AND (start_date IS NULL OR start_date <= CURRENT_DATE) 
            AND (end_date IS NULL OR end_date >= CURRENT_DATE)`;
        let params = [];

        // DEBUG: Log venue filter status
        console.log(`[/api/offers] 🔍 DEBUG: KIOSK_LOCATION=${KIOSK_LOCATION}, KIOSK_VENUE=${KIOSK_VENUE}`);
        console.log(`[/api/offers] 🔍 DEBUG: offerId=${offerId}, cost=${cost}, cardType=${cardType}`);

        // Filter by kiosk venue if configured (show offers matching venue OR global offers with empty venue)
        // Apply to all requests except specific offerId lookups (icons need exact match)
        if (RESOLVED_VENUE && !offerId) {
            query += ` AND (venue IS NULL OR venue = '{}' OR $1 = ANY(venue))`;
            params.push(RESOLVED_VENUE);
            console.log(`[/api/offers] ✅ Venue filter APPLIED: ${RESOLVED_VENUE}`);
        } else {
            console.log(`[/api/offers] ⚠️ Venue filter NOT applied (RESOLVED_VENUE=${RESOLVED_VENUE})`);
        }
        let paramIndex = params.length + 1; // Start after any venue param

        // If screensaverOnly, filter to only OOD, Fixed Offer, and Scratch Card categories WITH Universal card type
        // This ensures card-specific offers (Welcome, Blue, Gold, Platinum) don't appear in screensaver
        if (screensaverOnly && !offerId && !cost) {
            query += ` AND category IN ('OOD', 'Fixed Offer', 'Scratch Card') AND LOWER(card_type) = 'universal'`;
        }

        // Filter by offer ID if provided (for fetching specific offer with icons)
        if (offerId) {
            query = `SELECT * FROM offers WHERE id = $${paramIndex}`;
            params.push(offerId);
            paramIndex++;
        }

        // Filter by cost if provided (for fetching offer icons by cost/RB value)
        if (cost && !offerId) {
            query += ` AND cost = $${paramIndex}`;
            params.push(parseFloat(cost));
            paramIndex++;
        }

        // Filter by category if provided (for OOH/OOD screensaver)
        if (category && !offerId) {
            const dbCategory = categoryMap[category.toLowerCase()] || category;
            query += ` AND category = $${paramIndex}`;
            params.push(dbCategory);
            paramIndex++;

            // For screensaver categories (OOD, OOH, Snacks), only show Universal card type offers
            const screensaverCategories = ['ood', 'ooh', 'snacks'];
            if (screensaverCategories.includes(category.toLowerCase())) {
                query += ` AND LOWER(card_type) = 'universal'`;
                console.log(`[/api/offers] 🎯 Screensaver category detected - filtering to Universal card_type only`);
            }
        }

        // Filter by card type if provided
        if (cardType && !offerId) {
            const dbCardType = cardTypeMap[cardType.toLowerCase()] || cardType;
            // Only include specific card type offers (not Universal) for offers selection page
            // Universal offers are meant for screensaver (OOD/OOH) only, not regular card selection
            query += ` AND card_type = $${paramIndex}`;
            params.push(dbCardType);
            paramIndex++;
        }

        if (!offerId) {
            query += ' ORDER BY cost DESC';
        }

        // DEBUG: Log final query
        console.log(`[/api/offers] 🔍 QUERY: ${query}`);
        console.log(`[/api/offers] 🔍 PARAMS: ${JSON.stringify(params)}`);

        pool.query(query, params)
            .then(result => {
                // DEBUG: Log results
                console.log(`[/api/offers] ✅ Returned ${result.rows.length} offers`);
                if (KIOSK_VENUE && result.rows.length > 0) {
                    console.log(`[/api/offers] 🔍 Sample venues: ${result.rows.slice(0, 3).map(r => JSON.stringify(r.venue)).join(', ')}`);
                }
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: true,
                    offers: result.rows,
                    count: result.rows.length
                }));
            })
            .catch(err => {
                console.error('Database error:', err);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: err.message }));
            });
        return;
    }

    // API: Get all upsell offers (for TIZO rate lookup)
    if (req.method === 'GET' && req.url === '/api/upsell-offers-all') {
        pool.query('SELECT * FROM upsell_offers ORDER BY topup_rb')
            .then(result => {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: true,
                    offers: result.rows,
                    count: result.rows.length
                }));
            })
            .catch(err => {
                console.error('Database error:', err);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: err.message }));
            });
        return;
    }

    // API: Get UNIVERSAL custom top-up rates (for Custom Top-Up page)
    // These rates apply to ALL card types - no card type differentiation
    if (req.method === 'GET' && req.url === '/api/custom-topup-rates') {
        pool.query('SELECT topup_rb, tizo_value, percent_increase FROM custom_topup_rates WHERE is_active = true ORDER BY topup_rb DESC')
            .then(result => {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: true,
                    rates: result.rows.map(r => ({
                        topup_rb: parseInt(r.topup_rb),
                        tizo_value: parseInt(r.tizo_value),
                        percent_increase: parseFloat(r.percent_increase)
                    })),
                    count: result.rows.length,
                    message: 'Universal custom top-up rates (applies to all card types)'
                }));
            })
            .catch(err => {
                console.error('Database error:', err);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: err.message }));
            });
        return;
    }

    // API: Get upsell offer by RB value
    if (req.method === 'GET' && req.url.startsWith('/api/upsell-offer')) {
        const urlParams = new URL(req.url, LOCAL_URL);
        const rbValue = urlParams.searchParams.get('rb');

        if (!rbValue) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'rb parameter is required' }));
            return;
        }

        // Find the upsell offer matching the RB value
        pool.query('SELECT * FROM upsell_offers WHERE topup_rb = $1', [parseInt(rbValue)])
            .then(result => {
                if (result.rows.length > 0) {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        success: true,
                        offer: result.rows[0]
                    }));
                } else {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: 'No upsell offer found for this RB value' }));
                }
            })
            .catch(err => {
                console.error('Database error:', err);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: err.message }));
            });
        return;
    }

    // API: Get next two larger upsell offers from database
    // Logic: When user selects max offer for their card type:
    // - Get the next 2 RB values from the next tier
    // - But TIZO = base TIZO + 50 for first upsell, base TIZO + 100 for second upsell
    // Example: Red max 250 (350 Tizo) -> Upsell 1: 300 Rb (400 Tizo), Upsell 2: 350 Rb (450 Tizo)
    if (req.method === 'GET' && req.url.startsWith('/api/next-upsell-offers')) {
        const urlParams = new URL(req.url, LOCAL_URL);
        const rbValue = urlParams.searchParams.get('rb');
        const cardType = urlParams.searchParams.get('cardType') || '';
        const baseTizo = urlParams.searchParams.get('baseTizo') || '';

        if (!rbValue) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'rb parameter is required' }));
            return;
        }

        const currentRb = parseInt(rbValue);
        const currentTizo = baseTizo ? parseInt(baseTizo) : null;

        // Define max offers per card type and their next tier
        const cardTierConfig = {
            'red': { max: 250, nextTier: 'Blue' },
            'blue': { max: 550, nextTier: 'Gold' },
            'gold': { max: 800, nextTier: 'Platinum' },
            'platinum': { max: 2000, nextTier: null }
        };

        const normalizedCardType = cardType.toLowerCase();
        const config = cardTierConfig[normalizedCardType];

        // Check if user selected the max offer for their card type
        if (config && currentRb >= config.max) {
            if (!config.nextTier) {
                // Platinum max - no upsell, go directly to scratch card
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: true,
                    offers: [],
                    count: 0,
                    baseRb: currentRb,
                    message: 'Max tier reached, no upsell available'
                }));
                return;
            }

            // Get first 2 RB values from the next tier
            pool.query(
                'SELECT topup_rb, tizo_value FROM upsell_offers WHERE card_type = $1 ORDER BY topup_rb ASC LIMIT 2',
                [config.nextTier]
            )
                .then(result => {
                    // When at max of current tier, both upsells go to next tier
                    // First upsell: base TIZO + 50
                    // Second upsell: first upsell TIZO + 50 (which is base + 100)
                    const baseT = currentTizo || currentRb; // fallback to RB if no TIZO provided
                    const firstUpsellTizo = baseT + 50;
                    const offers = result.rows.map((row, index) => ({
                        topup_rb: row.topup_rb,
                        tizo_value: index === 0 ? firstUpsellTizo : firstUpsellTizo + 50,
                        card_type: config.nextTier,
                        crossesTier: true
                    }));

                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        success: true,
                        offers: offers,
                        count: offers.length,
                        baseRb: currentRb,
                        baseTizo: baseT,
                        nextTier: config.nextTier,
                        message: `At max of ${normalizedCardType}: upsells to ${config.nextTier} with TIZO +50/+100`
                    }));
                })
                .catch(err => {
                    console.error('Database error:', err);
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: err.message }));
                });
            return;
        }

        // Not at max - get next 2 offers with higher topup_rb
        // Logic: First upsell uses actual TIZO from table
        // Second upsell: if it crosses into next tier, use first upsell TIZO + 50
        pool.query('SELECT * FROM upsell_offers WHERE topup_rb > $1 ORDER BY topup_rb ASC LIMIT 2', [currentRb])
            .then(async result => {
                if (result.rows.length === 0) {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        success: true,
                        offers: [],
                        count: 0,
                        baseRb: currentRb
                    }));
                    return;
                }

                const offers = [];
                const firstUpsell = result.rows[0];

                // First upsell: always use actual TIZO from table
                offers.push({
                    topup_rb: firstUpsell.topup_rb,
                    tizo_value: firstUpsell.tizo_value,
                    card_type: firstUpsell.card_type
                });

                // Second upsell logic
                if (result.rows.length > 1) {
                    const secondUpsell = result.rows[1];

                    // Check if second upsell crosses into a different card tier
                    const firstCardType = firstUpsell.card_type;
                    const secondCardType = secondUpsell.card_type;

                    if (firstCardType !== secondCardType) {
                        // Crossing tier boundary: second upsell TIZO = first upsell TIZO + 50
                        offers.push({
                            topup_rb: secondUpsell.topup_rb,
                            tizo_value: firstUpsell.tizo_value + 50,
                            card_type: secondCardType,
                            crossesTier: true
                        });
                    } else {
                        // Same tier: use actual TIZO from table
                        offers.push({
                            topup_rb: secondUpsell.topup_rb,
                            tizo_value: secondUpsell.tizo_value,
                            card_type: secondUpsell.card_type
                        });
                    }
                }

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: true,
                    offers: offers,
                    count: offers.length,
                    baseRb: currentRb
                }));
            })
            .catch(err => {
                console.error('Database error:', err);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: err.message }));
            });
        return;
    }

    // API: Get custom topup upsell offers based on user's custom amount
    // Returns the two upsell box values for the 2nd upsell screen
    // USES DATABASE: Looks up upsell box values from custom_topup_upsell table (rounded tier values)
    // Then calculates TIZO for those amounts using universal custom_topup_rates table
    if (req.method === 'GET' && req.url.startsWith('/api/custom-topup-upsell')) {
        const urlParams = new URL(req.url, LOCAL_URL);
        const rbValue = urlParams.searchParams.get('rb');

        if (!rbValue) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'rb parameter is required (amount in Rb, e.g., 125 for 125,000 Rp)' }));
            return;
        }

        const amountRb = parseInt(rbValue);

        // Calculate base TIZO for custom amount using universal custom_topup_rates table
        const customTizo = calculateCustomTizo(amountRb);

        // Look up upsell box values from custom_topup_upsell table
        // This gives us rounded tier values (e.g., 1568 -> upsell1: 1600, upsell2: 1650)
        pool.query(
            'SELECT upsell_box_1, upsell_box_2 FROM custom_topup_upsell WHERE $1 >= range_min AND $1 <= range_max LIMIT 1',
            [amountRb]
        )
            .then(result => {
                let upsell1Rb, upsell2Rb;

                if (result.rows.length > 0) {
                    // Use database values (rounded tier values)
                    upsell1Rb = parseInt(result.rows[0].upsell_box_1);
                    upsell2Rb = parseInt(result.rows[0].upsell_box_2);
                    console.log(`[custom-topup-upsell] Found DB entry for ${amountRb}RB: Box1=${upsell1Rb}, Box2=${upsell2Rb}`);
                } else {
                    // Fallback: calculate based on rounding to nearest 50
                    // Round up to next 50 for upsell1, then +50 for upsell2
                    upsell1Rb = Math.ceil(amountRb / 50) * 50;
                    if (upsell1Rb === amountRb) upsell1Rb += 50; // Ensure it's higher than current
                    upsell2Rb = upsell1Rb + 50;
                    console.log(`[custom-topup-upsell] No DB entry, using fallback for ${amountRb}RB: Box1=${upsell1Rb}, Box2=${upsell2Rb}`);
                }

                // Calculate TIZO for upsells using the same universal custom_topup_rates table
                const tizo1 = calculateCustomTizo(upsell1Rb);
                const tizo2 = calculateCustomTizo(upsell2Rb);

                console.log(`[custom-topup-upsell] Base: ${amountRb}RB = ${customTizo} TIZO`);
                console.log(`[custom-topup-upsell] Upsell 1: ${upsell1Rb}RB = ${tizo1} TIZO`);
                console.log(`[custom-topup-upsell] Upsell 2: ${upsell2Rb}RB = ${tizo2} TIZO`);

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: true,
                    customAmount: amountRb,
                    customTizo: customTizo,
                    upsellBox1: {
                        rb: upsell1Rb,
                        tizo: tizo1
                    },
                    upsellBox2: {
                        rb: upsell2Rb,
                        tizo: tizo2
                    },
                    message: 'Upsell box values from custom_topup_upsell table, TIZO from universal custom_topup_rates'
                }));
            })
            .catch(err => {
                console.error('[custom-topup-upsell] Database error:', err);
                // Fallback to simple calculation on error
                const upsell1Rb = Math.ceil(amountRb / 50) * 50;
                const upsell2Rb = upsell1Rb + 50;
                const tizo1 = calculateCustomTizo(upsell1Rb);
                const tizo2 = calculateCustomTizo(upsell2Rb);

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: true,
                    customAmount: amountRb,
                    customTizo: customTizo,
                    upsellBox1: { rb: upsell1Rb, tizo: tizo1 },
                    upsellBox2: { rb: upsell2Rb, tizo: tizo2 },
                    message: 'Using fallback calculation (DB error)'
                }));
            });
        return;
    }

    // Handle save request
    if (req.method === 'POST' && req.url === '/save') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const { filePath, content } = JSON.parse(body);

                // Remove leading slash if present for proper path joining
                const cleanPath = filePath.startsWith('/') ? filePath.slice(1) : filePath;
                const fullPath = path.join(BASE_DIR, cleanPath);

                console.log('Attempting to save to:', fullPath);
                console.log('Content length:', content ? content.length : 0);

                // Security check - only allow saving in BASE_DIR
                const normalizedFullPath = path.normalize(fullPath);
                const normalizedBaseDir = path.normalize(BASE_DIR);
                if (!normalizedFullPath.startsWith(normalizedBaseDir)) {
                    console.error('Access denied - path outside BASE_DIR:', normalizedFullPath);
                    res.writeHead(403, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Access denied' }));
                    return;
                }

                if (!content) {
                    console.error('No content provided');
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'No content provided' }));
                    return;
                }

                fs.writeFileSync(fullPath, content, 'utf8');
                console.log('✅ Saved:', fullPath);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true }));
            } catch (err) {
                console.error('Save error:', err.message);
                console.error('Stack:', err.stack);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: err.message }));
            }
        });
        return;
    }

    // Serve static files
    // Strip query parameters from URL before looking up file
    let requestUrl = req.url.split('?')[0];

    // Root redirect - go to kiosk shell (persistent background)
    if (requestUrl === '/') {
        res.writeHead(302, { 'Location': '/page-1/kiosk-shell.html' });
        res.end();
        return;
    }

    // /kiosk shortcut - redirect to kiosk shell
    if (requestUrl === '/kiosk' || requestUrl === '/kiosk/') {
        res.writeHead(302, { 'Location': '/page-1/kiosk-shell.html' });
        res.end();
        return;
    }

    // /legacy shortcut - for testing without shell (direct welcome.html)
    if (requestUrl === '/legacy' || requestUrl === '/legacy/') {
        res.writeHead(302, { 'Location': '/page-1/welcome.html' });
        res.end();
        return;
    }
    let filePath = requestUrl;
    filePath = path.join(BASE_DIR, filePath);

    const ext = path.extname(filePath).toLowerCase();
    const contentType = mimeTypes[ext] || 'application/octet-stream';

    // Check if file exists
    fs.stat(filePath, (err, stats) => {
        if (err) {
            if (err.code === 'ENOENT') {
                res.writeHead(404);
                res.end('File not found');
            } else {
                res.writeHead(500);
                res.end('Server error');
            }
            return;
        }

        // Set cache headers for static assets (not HTML)
        const headers = { 'Content-Type': contentType };

        // Disable caching for ALL static files to ensure fresh code logic
        // (Especially critical for Kiosk debugging)
        const noCacheHeaders = 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0';

        headers['Cache-Control'] = noCacheHeaders;
        headers['Pragma'] = 'no-cache';
        headers['Expires'] = '0';

        // Add Content-Length for all files
        headers['Content-Length'] = stats.size;

        // Use streaming for large files (> 1MB)
        if (stats.size > 1024 * 1024) {
            res.writeHead(200, headers);
            const stream = fs.createReadStream(filePath);
            stream.pipe(res);
            stream.on('error', (streamErr) => {
                console.error('Stream error:', streamErr);
                res.end();
            });
        } else {
            // For smaller files, use readFile (faster for small files)
            fs.readFile(filePath, (readErr, content) => {
                if (readErr) {
                    res.writeHead(500);
                    res.end('Server error');
                } else {
                    res.writeHead(200, headers);
                    res.end(content);
                }
            });
        }
    });
});

// Handle CLI Arguments
const args = process.argv.slice(2);

if (args.includes('--sync')) {
    // One-time sync mode
    (async () => {
        try {
            await syncAllTables();
            process.exit(0);
        } catch (e) {
            console.error(e);
            process.exit(1);
        }
    })();
} else if (args.includes('--check')) {
    // Check mode (placeholder for now, runs sync)
    // The requirement was "Check if cloud has newer data", but simpliest impl is just sync or a dumb check. 
    // The provided MD has "npm run sync:check: node db-sync.js --check".
    // We will just run sync for now or maybe just log connections.
    console.log('Check mode: Checking connections...');
    (async () => {
        try {
            await cloudPool.query('SELECT 1');
            console.log('✅ Cloud DB Accessible');
            process.exit(0);
        } catch (e) {
            console.error('❌ Cloud DB Error:', e.message);
            process.exit(1);
        }
    })();
} else {
    // Normal Server Mode
    server.listen(PORT, async () => {
        console.log(`\n🚀 TIZO Server running at ${LOCAL_URL}`);
        console.log(`   (Listening on port ${PORT})`);

        // Show which DB we are using for API
        console.log(`\n🗄️  Local Database: ${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || 5433}`);

        // Resolve fuzzy venue match from DB before loading caches
        await resolveVenueFromDB();

        // Show kiosk configuration
        if (KIOSK_VENUE || RESOLVED_VENUE) {
            console.log(`\n🏪 Kiosk Config:`);
            console.log(`   PLACE (from .env): ${KIOSK_VENUE || '(not set)'}`);
            console.log(`   Resolved Venue: ${RESOLVED_VENUE || '(not set - showing all offers)'}`);
        } else {
            console.log(`\n🏪 Kiosk Config: Not configured (showing all offers)`);
        }

        // Load offers cache for TIZO calculation (Offers Page - card-type specific)
        await loadUpsellOffersCache();

        // Load UNIVERSAL custom top-up rates cache (Custom Top-Up page - NO card type)
        await loadCustomTopupRatesCache();

        // Ensure local customer_transactions table exists
        await ensureCustomerTransactionsTable();

        // Ensure cloud tables exist for heartbeat and transactions
        await ensureHeartbeatTable();
        await ensureCloudTransactionsTable();

        // Start scheduled offer sync (Cloud → Local): startup + 10AM + 8PM
        startScheduledSync();

        // Start scheduled transaction sync (Local → Cloud): startup + 8AM + 10PM
        startScheduledTransactionSync();

        // Start heartbeat (every 2 minutes)
        startHeartbeat();

        // Enable real-time sync via PostgreSQL LISTEN/NOTIFY
        // This allows instant sync when Offer Builder updates cloud DB
        setupRealtimeListener();

        console.log(`\n📂 Open your pages:`);
        console.log(`   ${LOCAL_URL}/kiosk                         ⭐ KIOSK SHELL (Persistent BG)`);
        console.log(`   ${LOCAL_URL}/legacy                        (Old mode - no shell)`);
        console.log(`   ${LOCAL_URL}/page-1/kiosk-shell.html       (Direct shell URL)`);
        console.log(`   ${LOCAL_URL}/page-1/screensaver-ood.html   (Offer of the Day)`);
        console.log(`   ${LOCAL_URL}/page-1/screensaver.html       (Offer of the Hour)`);
        console.log(`   ${LOCAL_URL}/page-1/welcome.html`);
        console.log(`\n💾 Auto-save enabled - changes will be saved directly to files!`);
        console.log(`\nPress Ctrl+C to stop the server.\n`);

        // Log server start to dashboard
        sendServerEvent('server_start');
    });

    // Send server stop on shutdown (Windows-compatible)
    let shutdownSent = false;
    function handleShutdown(signal) {
        if (shutdownSent) return;
        shutdownSent = true;
        console.log(`\n🛑 ${signal} received - logging server stop...`);

        // 1. Send final offline heartbeat (Best effort)
        // We use sendBeacon-like fire-and-forget logic if possible, but here we just try a quick request
        const kioskId = (process.env.location || 'K1').toUpperCase();
        const place = process.env.PLACE || '';
        const OFFER_BUILDER_HEARTBEAT_URL = 'http://34.142.198.255:3001/api/kiosk-heartbeat';

        const data = JSON.stringify({ kioskId, place, status: 'offline' });
        const url = new URL(OFFER_BUILDER_HEARTBEAT_URL);
        const req = http.request({
            hostname: url.hostname, port: url.port, path: url.pathname, method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
            timeout: 1000 // Very short timeout for shutdown
        });
        req.on('error', () => { });
        req.write(data);
        req.end();

        // 2. Also log to session API
        const req2 = sendServerEvent('server_stop');
        req2.on('close', () => process.exit(0));
        setTimeout(() => process.exit(0), 1500);
    }

    // Windows: use readline to properly capture Ctrl+C
    if (process.platform === 'win32') {
        const rl = require('readline').createInterface({ input: process.stdin });
        rl.on('SIGINT', () => handleShutdown('SIGINT'));
        rl.on('close', () => handleShutdown('CLOSE'));
    }
    process.on('SIGINT', () => handleShutdown('SIGINT'));
    process.on('SIGTERM', () => handleShutdown('SIGTERM'));
    process.on('SIGBREAK', () => handleShutdown('SIGBREAK'));
}
