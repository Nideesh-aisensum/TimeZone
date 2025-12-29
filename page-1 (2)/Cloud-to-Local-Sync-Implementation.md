# Cloud to Local Database Sync Implementation

## Overview

This document describes the **one-way database synchronization** system that pulls data from a **Cloud PostgreSQL database** to a **Local PostgreSQL database**.

```
┌─────────────────┐         ┌─────────────────┐
│   CLOUD DB      │ ──────► │   LOCAL DB      │
│ (47.129.117.239)│  PULL   │  (localhost)    │
└─────────────────┘         └─────────────────┘
        │                           │
        │    ONE-WAY SYNC           │
        │    Cloud → Local          │
        │                           │
        │    Local changes do       │
        │    NOT sync to cloud      │
        └───────────────────────────┘
```

---

## Files Involved

| File | Purpose |
|------|---------|
| `db-sync.js` | Main sync module with all sync functions |
| `db.js` | Original local database connection (unchanged) |
| `.env` | Environment variables for both databases |
| `package.json` | NPM scripts for running sync |

---

## Environment Configuration (`.env`)

```env
# Local Database (your computer)
DB_HOST=localhost
DB_PORT=5433
DB_NAME=TimeZone
DB_USER=postgres
DB_PASSWORD=timezone@2025

# Cloud Database (remote server)
CLOUD_DB_HOST=47.129.117.239
CLOUD_DB_PORT=5433
CLOUD_DB_NAME=TimeZone
CLOUD_DB_USER=postgres
CLOUD_DB_PASSWORD=tizo123
CLOUD_DB_SSL=false
```

---

## How It Works

### Step 1: Connect to Both Databases

```javascript
// Local database connection
const localPool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5433,
    database: process.env.DB_NAME || 'TimeZone',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
});

// Cloud database connection
const cloudPool = new Pool({
    host: process.env.CLOUD_DB_HOST || '47.129.117.239',
    port: process.env.CLOUD_DB_PORT || 5432,
    database: process.env.CLOUD_DB_NAME || 'TimeZone',
    user: process.env.CLOUD_DB_USER || 'postgres',
    password: process.env.CLOUD_DB_PASSWORD,
});
```

### Step 2: Fetch Data from Cloud

```javascript
async function getTableData(pool, tableName) {
    const result = await pool.query(`SELECT * FROM ${tableName}`);
    return result.rows;
}

// Usage
const cloudData = await getTableData(cloudPool, 'offers');
```

### Step 3: Replace Local Data with Cloud Data

```javascript
async function syncTable(tableName) {
    // 1. Fetch all data from CLOUD
    const cloudData = await getTableData(cloudPool, tableName);
    
    // 2. Get column names
    const columns = await getTableColumns(cloudPool, tableName);
    
    // 3. Begin transaction
    const client = await localPool.connect();
    await client.query('BEGIN');
    
    // 4. DELETE all existing LOCAL data
    await client.query(`DELETE FROM ${tableName}`);
    
    // 5. INSERT cloud data into LOCAL
    for (const row of cloudData) {
        const values = columns.map(col => row[col]);
        const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
        const columnNames = columns.join(', ');
        
        await client.query(
            `INSERT INTO ${tableName} (${columnNames}) VALUES (${placeholders})`,
            values
        );
    }
    
    // 6. COMMIT transaction
    await client.query('COMMIT');
    client.release();
}
```

### Step 4: Sync All Tables

```javascript
const SYNC_TABLES = [
    'bonus_percent_options',
    'card_offers',
    'topup_values',
    'upsell_offers',
    'offers'
];

async function syncAllTables() {
    for (const table of SYNC_TABLES) {
        await syncTable(table);
    }
}
```

---

## NPM Scripts

| Command | Description |
|---------|-------------|
| `npm run sync` | One-time sync from cloud to local |
| `npm run sync:check` | Check if cloud has newer data |
| `npm run sync:periodic` | Auto-sync every 2 minutes |

### package.json scripts:

```json
{
    "scripts": {
        "sync": "node db-sync.js",
        "sync:check": "node db-sync.js --check",
        "sync:periodic": "node db-sync.js --periodic 2"
    }
}
```

---

## Usage Examples

### One-Time Sync
```bash
npm run sync
```

**Output:**
```
═══════════════════════════════════════════════════════════
🔄 Starting ONE-WAY sync: Cloud → Local
   (Local changes will be overwritten by cloud data)
═══════════════════════════════════════════════════════════
✅ Connected to Local database
✅ Connected to Cloud database

🔄 Syncing table: bonus_percent_options
   📥 Fetched 40 rows from cloud
   🗑️ Cleared local table
   ✅ Inserted 40 rows into local

🔄 Syncing table: offers
   📥 Fetched 26 rows from cloud
   🗑️ Cleared local table
   ✅ Inserted 26 rows into local

═══════════════════════════════════════════════════════════
✅ Sync complete: 5 tables synced, 0 errors
═══════════════════════════════════════════════════════════
```

### Periodic Sync (Every 2 Minutes)
```bash
npm run sync:periodic
```

Or with custom interval:
```bash
node db-sync.js --periodic 5    # Every 5 minutes
node db-sync.js --periodic 10   # Every 10 minutes
```

### Check for Updates Only
```bash
npm run sync:check
```

---

## Tables Synced

| Table | Description |
|-------|-------------|
| `bonus_percent_options` | Bonus percentage options |
| `card_offers` | Card offer types (Blue, Gold, Platinum, Red) |
| `topup_values` | Top-up value options |
| `upsell_offers` | Upsell offer configurations |
| `offers` | Main offers with images and details |

---

## Key Functions in `db-sync.js`

| Function | Purpose |
|----------|---------|
| `testConnection(pool, name)` | Test database connection |
| `getTableData(pool, tableName)` | Fetch all rows from a table |
| `getTableColumns(pool, tableName)` | Get column names for a table |
| `syncTable(tableName)` | Sync single table: Cloud → Local |
| `syncAllTables()` | Sync all tables |
| `checkForUpdates()` | Check if cloud has newer data |
| `startPeriodicSync(minutes)` | Start auto-sync at interval |
| `closeConnections()` | Close all database connections |

---

## Error Handling

### Schema Mismatch Error
```
❌ Error syncing upsell_offers: column "card_type" of relation "upsell_offers" does not exist
```

**Cause:** Cloud database has a column that doesn't exist in local database.

**Solution:** Add the missing column to local database:
```sql
ALTER TABLE upsell_offers ADD COLUMN card_type VARCHAR(100);
```

### Connection Timeout Error
```
❌ Failed to connect to Cloud database: Connection terminated due to connection timeout
```

**Cause:** Wrong port, host, or network issue.

**Solution:** Check `.env` file for correct cloud database settings.

---

## Architecture Diagram

```
┌──────────────────────────────────────────────────────────────┐
│                        db-sync.js                            │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────┐              ┌─────────────┐               │
│  │  cloudPool  │              │  localPool  │               │
│  │  (pg.Pool)  │              │  (pg.Pool)  │               │
│  └──────┬──────┘              └──────┬──────┘               │
│         │                            │                       │
│         │ SELECT * FROM table        │ DELETE FROM table     │
│         │                            │ INSERT INTO table     │
│         ▼                            ▼                       │
│  ┌─────────────┐              ┌─────────────┐               │
│  │  CLOUD DB   │  ─────────►  │  LOCAL DB   │               │
│  │ 47.129.117  │   (data)     │  localhost  │               │
│  └─────────────┘              └─────────────┘               │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## Important Notes

1. **One-Way Sync Only**: Local changes are **overwritten** by cloud data. Local changes do NOT sync back to cloud.

2. **Full Table Replacement**: Each sync deletes ALL local data and replaces with cloud data.

3. **Transaction Safety**: Uses PostgreSQL transactions - if sync fails mid-way, changes are rolled back.

4. **Schema Must Match**: Both databases must have the same table structure (columns).

---

## Programmatic Usage

You can import and use the sync functions in your own code:

```javascript
import { 
    syncAllTables, 
    syncTable, 
    checkForUpdates,
    startPeriodicSync 
} from './db-sync.js';

// One-time sync
await syncAllTables();

// Sync specific table
await syncTable('offers');

// Check for updates
const { hasUpdates, updates } = await checkForUpdates();

// Start periodic sync (every 2 minutes)
startPeriodicSync(2);
```

---

## Changelog

| Date | Change |
|------|--------|
| Dec 15, 2025 | Initial implementation |
| Dec 16, 2025 | Changed periodic sync to 2 minutes |
