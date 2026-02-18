// Test local DB connection and check customer_transactions table
require('dotenv').config();
const { Pool } = require('pg');

const localPool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5433,
    database: process.env.DB_NAME || 'TimeZone',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
});

async function run() {
    try {
        console.log('Connecting to LOCAL DB...');
        console.log(`Host: ${process.env.DB_HOST || 'localhost'}, Port: ${process.env.DB_PORT || 5433}, DB: ${process.env.DB_NAME || 'TimeZone'}`);

        // 1. Check if table exists
        const tableCheck = await localPool.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'customer_transactions'
            ORDER BY ordinal_position
        `);
        console.log(`\n✅ customer_transactions table has ${tableCheck.rows.length} columns:`);
        tableCheck.rows.forEach(r => console.log(`   - ${r.column_name} (${r.data_type})`));

        // 2. Count rows
        const countResult = await localPool.query('SELECT COUNT(*) FROM customer_transactions');
        console.log(`\n📊 Total rows in local customer_transactions: ${countResult.rows[0].count}`);

        // 3. Show latest rows
        const rows = await localPool.query('SELECT id, session_id, offer_name, synced_to_cloud, transaction_timestamp FROM customer_transactions ORDER BY id DESC LIMIT 5');
        if (rows.rows.length > 0) {
            console.log('\nLatest transactions:');
            rows.rows.forEach(r => console.log(`   #${r.id} | ${r.session_id} | ${r.offer_name} | synced=${r.synced_to_cloud} | ${r.transaction_timestamp}`));
        } else {
            console.log('\n⚠️ No rows found in local customer_transactions table.');
        }
    } catch (err) {
        console.error('❌ Error:', err.message);
    } finally {
        await localPool.end();
    }
}

run();
