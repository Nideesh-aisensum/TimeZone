const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'TimeZone',
    password: '123456',
    port: 5433,
});

(async () => {
    try {
        console.log('🔄 Resetting sync status for Margo City transactions...');
        const res = await pool.query(`
            UPDATE customer_transactions 
            SET synced_to_cloud = false 
            WHERE place ILIKE '%Margo%' AND total_cost > '0'
            RETURNING id, place, total_cost
        `);
        console.log(`✅ Marked ${res.rowCount} transactions for re-sync:`);
        console.table(res.rows);
    } catch (e) {
        console.error(e);
    } finally {
        pool.end();
    }
})();
