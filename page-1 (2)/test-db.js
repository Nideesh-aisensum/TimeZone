const { Pool } = require('pg');
require('dotenv').config();

const cloudPool = new Pool({
    user: process.env.CLOUD_DB_USER,
    host: process.env.CLOUD_DB_HOST,
    database: process.env.CLOUD_DB_NAME,
    password: process.env.CLOUD_DB_PASSWORD,
    port: process.env.CLOUD_DB_PORT,
    ssl: { rejectUnauthorized: false }
});

console.log('Testing Cloud DB Connection & Transactions...');

cloudPool.query('SELECT * FROM customer_transactions ORDER BY id DESC LIMIT 5', (err, res) => {
    if (err) {
        console.error('❌ Query Failed:', err);
    } else {
        console.log(`✅ Connection Successful. Found ${res.rows.length} transactions.`);
        if (res.rows.length > 0) {
            console.log('Latest Transaction:', res.rows[0]);
        } else {
            console.log('⚠️ No transactions found in Cloud DB.');
        }
    }
    cloudPool.end();
});
