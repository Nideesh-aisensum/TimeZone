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
        console.log('🗑️  Deleting test transactions...');
        const res = await pool.query(`
            DELETE FROM customer_transactions 
            WHERE offer_name = 'Test Transaction Script'
            RETURNING id, offer_name, transaction_timestamp
        `);
        console.log(`✅ Deleted ${res.rowCount} test transaction(s):`);
        console.table(res.rows);
    } catch (e) {
        console.error(e);
    } finally {
        pool.end();
    }
})();
