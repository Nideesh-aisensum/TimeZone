const http = require('http');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

const PORT = process.env.PORT || 3000;
const BASE_DIR = __dirname;
const LOCAL_URL = `http://localhost:${PORT}`;

// Kiosk Configuration - set 'location' in .env to filter offers for this specific kiosk
// Maps k1->Kiosk 1, k2->Kiosk 2, etc. to match Offer Builder venue checkboxes
const KIOSK_LOCATION = process.env.location || null;
const KIOSK_VENUE = KIOSK_LOCATION ? (() => {
    // Map shorthand (k1, k2) to full venue name (Kiosk 1, Kiosk 2)
    const locationMap = {
        'k1': 'Kiosk 1',
        'k2': 'Kiosk 2',
        'k3': 'Kiosk 3',
        'k4': 'Kiosk 4',
        'k5': 'Kiosk 5'
    };
    return locationMap[KIOSK_LOCATION.toLowerCase()] || KIOSK_LOCATION;
})() : null;

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
        // Fetch all active offers from the offers table
        const result = await pool.query(`
            SELECT 
                card_type,
                ROUND(cost / 1000) as topup_rb,
                ROUND(tizo_credit) as tizo_value
            FROM offers 
            WHERE is_active = true 
            AND (start_date IS NULL OR start_date <= CURRENT_DATE) 
            AND (end_date IS NULL OR end_date >= CURRENT_DATE)
            ORDER BY topup_rb DESC
        `);
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
        // Fallback to hardcoded rates if DB fails
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
        console.log('⚠️ Using fallback hardcoded custom top-up rates');
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
    host: process.env.CLOUD_DB_HOST || '47.129.117.239',
    port: process.env.CLOUD_DB_PORT || 5433,
    database: process.env.CLOUD_DB_NAME || 'TimeZone',
    user: process.env.CLOUD_DB_USER || 'postgres',
    password: process.env.CLOUD_DB_PASSWORD || 'tizo123',
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
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
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = $1
    `;
    const result = await pool.query(query, [tableName]);
    return result.rows.map(row => row.column_name);
}

async function syncTable(tableName) {
    console.log(`\n🔄 Syncing table: ${tableName}`);
    try {
        // 1. Fetch all data from CLOUD
        const cloudData = await getTableData(cloudPool, tableName);
        console.log(`   📥 Fetched ${cloudData.length} rows from cloud`);

        // 2. Get column names
        const columns = await getTableColumns(cloudPool, tableName);

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
                    const values = columns.map(col => row[col]);
                    const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
                    const columnNames = columns.map(col => `"${col}"`).join(', '); // Quote columns to be safe

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

        for (const tableName of cloudTables) {
            // Filter out system or irrelevant tables if needed
            if (tableName.startsWith('pg_') || tableName.startsWith('sql_')) continue;

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

    // Refresh cache if server is running
    await loadUpsellOffersCache();

    // Update last sync time so frontend knows to reload
    lastSyncTime = Date.now();
}

async function startPeriodicSync(minutes) {
    const ms = minutes * 60 * 1000;
    console.log(`\n⏰ Periodic sync enabled: executing every ${minutes} minutes...`);

    // Run immediately once
    // wrapping in try-catch to prevent crashing main server
    try {
        await syncAllTables();
    } catch (e) {
        console.error('Initial sync failed:', e.message);
    }

    setInterval(async () => {
        try {
            console.log(`\n⏰ Triggering periodic sync (${new Date().toLocaleTimeString()})...`);
            await syncAllTables();
        } catch (e) {
            console.error('Periodic sync failed:', e.message);
        }
    }, ms);
}

// ========================================================
// SYNC LOGIC END
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
            'red': 'Red',
            'blue': 'Blue',
            'gold': 'Gold',
            'silver': 'Platinum',
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

        // Apply venue filter if configured
        if (KIOSK_VENUE) {
            countQuery += ` AND (venue IS NULL OR venue = '{}' OR $2 = ANY(venue))`;
            params.push(KIOSK_VENUE);
            console.log(`[/api/layout-config] ✅ Venue filter APPLIED: ${KIOSK_VENUE}`);
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
            'red': 'Red',
            'blue': 'Blue',
            'gold': 'Gold',
            'silver': 'Platinum',
            'platinum': 'Platinum',
            'new_user': 'New User',
            'existing_user': 'Existing User'
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
            .then(result => {
                if (result.rows.length > 0) {
                    const offer = result.rows[0];
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
                        message: `Scratch card offer for ${dbCardType || 'default'}`
                    }));
                } else {
                    // Fallback: If no specific card offer found (e.g. Gold) and we were looking for one,
                    // try to find a generic "Existing User" offer (unless we were looking for New User)
                    if (dbCardType !== 'New User' && dbCardType !== 'Existing User') {
                        const fallbackQuery = `SELECT * FROM offers WHERE category = 'Scratch Card' AND is_active = true 
                            AND (start_date IS NULL OR start_date <= CURRENT_DATE) 
                            AND (end_date IS NULL OR end_date >= CURRENT_DATE)
                            AND card_type = 'Existing User'
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
            'red': 'Red',
            'blue': 'Blue',
            'gold': 'Gold',
            'silver': 'Platinum',
            'platinum': 'Platinum',
            'new_user': 'New User',
            'new_user_blue': 'New User - Blue',
            'new_user_gold': 'New User - Gold',
            'new_user_platinum': 'New User - Platinum',
            'new_user_red': 'New User - Red'
        };

        // Category map for OOH/OOD (case-insensitive)
        // Maps URL parameters to actual category names saved by Offer Builder
        const categoryMap = {
            'ooh': 'OFFER OF THE HOUR',
            'ood': 'OFFER OF THE DAY',
            'snacks': 'Snacks',
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
        if (KIOSK_VENUE && !offerId) {
            query += ` AND (venue IS NULL OR venue = '{}' OR $1 = ANY(venue))`;
            params.push(KIOSK_VENUE);
            console.log(`[/api/offers] ✅ Venue filter APPLIED: ${KIOSK_VENUE}`);
        } else {
            console.log(`[/api/offers] ⚠️ Venue filter NOT applied (KIOSK_VENUE=${KIOSK_VENUE})`);
        }
        let paramIndex = params.length + 1; // Start after any venue param

        // If screensaverOnly, filter to only OOD, OOH, and Snacks categories
        if (screensaverOnly && !offerId && !cost) {
            query += ` AND category IN ('OOD', 'OFFER OF THE DAY', 'OOH', 'OFFER OF THE HOUR', 'Snacks')`;
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
        }

        // Filter by card type if provided
        if (cardType && !offerId) {
            const dbCardType = cardTypeMap[cardType.toLowerCase()] || cardType;
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
    // SIMPLIFIED: Uses +50RB and +100RB from user's amount, calculates TIZO using universal custom_topup_rates table
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

        // Calculate upsell RB values: simply add +50 and +100 to user's amount
        const upsell1Rb = amountRb + 50;
        const upsell2Rb = amountRb + 100;

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
            message: 'Using universal custom_topup_rates table for all TIZO calculations'
        }));
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

        // Cache images, videos, fonts for 1 day
        if (['.png', '.jpg', '.gif', '.svg', '.mp4', '.webm', '.woff', '.woff2', '.ttf', '.ico'].includes(ext)) {
            headers['Cache-Control'] = 'public, max-age=86400'; // 1 day
        }
        // Cache CSS/JS for 1 hour
        else if (['.css', '.js'].includes(ext)) {
            headers['Cache-Control'] = 'public, max-age=3600'; // 1 hour
        }
        // No cache for HTML
        else if (ext === '.html') {
            headers['Cache-Control'] = 'no-cache';
        }

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
    const periodicIndex = args.indexOf('--periodic');
    const periodicInterval = periodicIndex !== -1 ? parseInt(args[periodicIndex + 1]) : 5;

    server.listen(PORT, async () => {
        console.log(`\n🚀 TIZO Server running at ${LOCAL_URL}`);
        console.log(`   (Listening on port ${PORT})`);

        // Show which DB we are using for API
        console.log(`\n🗄️  Local Database: ${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || 5433}`);

        // Show kiosk configuration
        if (KIOSK_LOCATION || KIOSK_VENUE) {
            console.log(`\n🏪 Kiosk Config:`);
            console.log(`   Location: ${KIOSK_LOCATION || '(not set)'}`);
            console.log(`   Venue Filter: ${KIOSK_VENUE || '(not set - showing all offers)'}`);
        } else {
            console.log(`\n🏪 Kiosk Config: Not configured (showing all offers)`);
        }

        // Load offers cache for TIZO calculation (Offers Page - card-type specific)
        await loadUpsellOffersCache();

        // Load UNIVERSAL custom top-up rates cache (Custom Top-Up page - NO card type)
        await loadCustomTopupRatesCache();

        // Start periodic sync automatically
        startPeriodicSync(periodicInterval);

        console.log(`\n📂 Open your pages:`);
        console.log(`   ${LOCAL_URL}/kiosk                         ⭐ KIOSK SHELL (Persistent BG)`);
        console.log(`   ${LOCAL_URL}/legacy                        (Old mode - no shell)`);
        console.log(`   ${LOCAL_URL}/page-1/kiosk-shell.html       (Direct shell URL)`);
        console.log(`   ${LOCAL_URL}/page-1/screensaver-ood.html   (Offer of the Day)`);
        console.log(`   ${LOCAL_URL}/page-1/screensaver.html       (Offer of the Hour)`);
        console.log(`   ${LOCAL_URL}/page-1/welcome.html`);
        console.log(`\n💾 Auto-save enabled - changes will be saved directly to files!`);
        console.log(`\nPress Ctrl+C to stop the server.\n`);
    });
}
