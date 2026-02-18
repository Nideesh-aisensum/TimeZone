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
        console.log('☁️  Deleting test transactions from CLOUD...');
        const res = await cloudPool.query(`
            DELETE FROM customer_transactions 
            WHERE offer_name = 'Test Transaction Script' 
               OR place = 'Margo City' AND total_cost = '0'
            RETURNING id, offer_name, transaction_timestamp
        `);
        console.log(`✅ Deleted ${res.rowCount} test transaction(s) from cloud.`);
    } catch (e) {
        console.error('❌ Cloud DB Error:', e.message);
    } finally {
        cloudPool.end();
    }
})();
