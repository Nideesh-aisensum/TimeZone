const { Pool } = require('pg');
require('dotenv').config();

const cloudPool = new Pool({
    user: process.env.CLOUD_DB_USER || 'postgres',
    host: process.env.CLOUD_DB_HOST || '34.142.198.255',
    database: process.env.CLOUD_DB_NAME || 'TimeZone',
    password: process.env.CLOUD_DB_PASSWORD || 'tizo123',
    port: process.env.CLOUD_DB_PORT || 5433,
    ssl: { rejectUnauthorized: false }
});

(async () => {
    try {
        console.log('☁️  Checking for MARGO CITY transactions...');
        const res = await cloudPool.query(`
            SELECT id, transaction_timestamp, place, total_cost 
            FROM customer_transactions 
            WHERE place ILIKE '%Margo%'
            ORDER BY id DESC 
            LIMIT 20
        `);
        console.log(`☁️  Cloud DB has ${res.rowCount} recent transactions (showing last 20):`);
        console.table(res.rows);
    } catch (e) {
        console.error('❌ Cloud DB Error:', e.message);
    } finally {
        cloudPool.end();
    }
})();
