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
        console.log('☁️  Creating Notify Trigger on Cloud DB...');

        // 1. Create Function
        await cloudPool.query(`
            CREATE OR REPLACE FUNCTION notify_new_transaction()
            RETURNS trigger AS $$
            BEGIN
                PERFORM pg_notify('new_transaction', row_to_json(NEW)::text);
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
        `);

        // 2. Create Trigger
        await cloudPool.query(`
            DROP TRIGGER IF EXISTS trg_new_transaction ON customer_transactions;
            CREATE TRIGGER trg_new_transaction
            AFTER INSERT ON customer_transactions
            FOR EACH ROW EXECUTE FUNCTION notify_new_transaction();
        `);

        console.log('✅ Trigger (trg_new_transaction) and Notification Function created successfully.');
    } catch (e) {
        console.error('❌ Error creating trigger:', e.message);
    } finally {
        cloudPool.end();
    }
})();
