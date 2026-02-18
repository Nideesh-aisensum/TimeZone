const { Pool } = require('pg');
require('dotenv').config(); // Load from current dir

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'TimeZone',
    password: '123456',
    port: 5433, // Docker port
});

(async () => {
    try {
        const res = await pool.query(`
            SELECT id, transaction_timestamp, place, total_cost, 
                   upsell_accepted, upsell_cost, upsell_tizo,
                   scratch_card_revealed, scratch_prize_type, scratch_prize_value,
                   feedback_comment
            FROM customer_transactions 
            ORDER BY id DESC 
            LIMIT 5
        `);
        console.table(res.rows);
    } catch (e) {
        console.error(e);
    } finally {
        pool.end();
    }
})();
