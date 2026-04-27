require('dotenv').config();
const { Client } = require('pg');

async function checkOrders() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL
    });
    try {
        await client.connect();
        const res = await client.query('SELECT id, "customerName", address FROM orders ORDER BY timestamp DESC LIMIT 15');
        console.log(JSON.stringify(res.rows, null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        await client.end();
    }
}

checkOrders();
