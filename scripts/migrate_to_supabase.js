require('dotenv').config();
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

const connectionString = process.env.DATABASE_URL;

if (!connectionString || connectionString.includes('[YOUR-PASSWORD]')) {
    console.error("❌ ERROR: Please set a valid DATABASE_URL in your .env file.");
    console.error("The URL in .env.example contains a placeholder [YOUR-PASSWORD] which must be replaced.");
    process.exit(1);
}

const client = new Client({
    connectionString: connectionString,
});

async function runMigration() {
    try {
        await client.connect();
        console.log("✅ Connected to Supabase PostgreSQL database.");

        // 1. Create Tables
        console.log("Creating tables if they do not exist...");
        await client.query(`
            CREATE TABLE IF NOT EXISTS products (
                id TEXT PRIMARY KEY,
                arabic_name TEXT, available TEXT, calc_val TEXT, category TEXT, collection TEXT,
                colors TEXT, description TEXT, dimensions TEXT, discount_cal TEXT, discount_percent TEXT,
                document_link TEXT, hidden TEXT, image_count TEXT, item_no TEXT, name TEXT,
                price_high_qty TEXT, price_low_qty TEXT, store_name TEXT, target_market TEXT, weight_calc TEXT
            );

            CREATE TABLE IF NOT EXISTS orders (
                id TEXT PRIMARY KEY,
                address TEXT, currency TEXT, customerName TEXT, customerPhone TEXT, date TEXT,
                items TEXT, method TEXT, paymentMethod TEXT, selectedCompany TEXT, selectedRegion TEXT,
                status TEXT, timestamp TEXT, total TEXT
            );

            CREATE TABLE IF NOT EXISTS admins (
                username TEXT PRIMARY KEY,
                password TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS gemini_keys (
                key TEXT PRIMARY KEY
            );

            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT
            );

            CREATE TABLE IF NOT EXISTS visits (
                date TEXT PRIMARY KEY,
                count INTEGER NOT NULL DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS wholesale (
                id TEXT PRIMARY KEY,
                category TEXT, item_no TEXT, special_price TEXT, updated_at TEXT
            );
        `);
        console.log("✅ Tables created.");

        // Helper function to read CSV
        const readCSV = (filePath) => {
            return new Promise((resolve, reject) => {
                const results = [];
                if (!fs.existsSync(filePath)) {
                    console.warn(`⚠️ File not found: ${filePath}, skipping...`);
                    return resolve([]);
                }
                fs.createReadStream(filePath)
                    .pipe(csv())
                    .on('data', (data) => results.push(data))
                    .on('end', () => resolve(results))
                    .on('error', (err) => reject(err));
            });
        };

        // Helper function to insert data
        const insertData = async (tableName, data, conflictColumn = 'id') => {
            if (data.length === 0) return;
            const columns = Object.keys(data[0]);
            for (const row of data) {
                const values = columns.map(c => row[c] || '');
                const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
                const updateSet = columns.map((c, i) => `"${c}" = EXCLUDED."${c}"`).join(', ');
                
                const query = `
                    INSERT INTO ${tableName} (${columns.map(c => `"${c}"`).join(', ')}) 
                    VALUES (${placeholders})
                    ON CONFLICT ("${conflictColumn}") DO UPDATE SET ${updateSet}
                `;
                try {
                    await client.query(query, values);
                } catch (e) {
                    console.error(`Error inserting into ${tableName}:`, e.message);
                }
            }
            console.log(`✅ Inserted/Updated ${data.length} rows in ${tableName}.`);
        };

        // Migrate Admins (from txt)
        const adminPath = path.join(__dirname, '..', 'public', 'adminCredentials.txt');
        if (fs.existsSync(adminPath)) {
            const adminText = fs.readFileSync(adminPath, 'utf-8');
            const lines = adminText.split(/\r?\n/);
            const admins = [];
            for (let i = 0; i < lines.length; i += 2) {
                if (lines[i] && lines[i + 1] && lines[i].startsWith('Username:') && lines[i + 1].startsWith('Password:')) {
                    admins.push({
                        username: lines[i].replace('Username:', '').trim(),
                        password: lines[i + 1].replace('Password:', '').trim()
                    });
                }
            }
            await insertData('admins', admins, 'username');
        } else {
            console.warn(`⚠️ File not found: ${adminPath}, skipping admins...`);
        }

        // Migrate Products
        const products = await readCSV(path.join(__dirname, '..', 'data', 'products.csv'));
        if(products.length > 0) {
            // Ensure ID exists for products
            const validProducts = products.map((p, index) => {
                if (!p.id) p.id = \`product_fallback_\${index}\`;
                return p;
            });
            await insertData('products', validProducts, 'id');
        }

        // Migrate Orders
        const orders = await readCSV(path.join(__dirname, '..', 'data', 'orders.csv'));
        if(orders.length > 0) {
            // Ensure ID exists
            const validOrders = orders.map((o, index) => {
                if (!o.id) o.id = \`order_fallback_\${index}\`;
                return o;
            });
            await insertData('orders', validOrders, 'id');
        }

        // Migrate Visits
        const visits = await readCSV(path.join(__dirname, '..', 'data', 'visits.csv'));
        const validVisits = visits.map(v => ({ date: v.date, count: parseInt(v.count) || 0 }));
        await insertData('visits', validVisits, 'date');

        // Migrate Settings
        let settings = await readCSV(path.join(__dirname, '..', 'data', 'settings.csv'));
        // Handle multiline string values causing extra keys to be created
        settings = settings.filter(s => s.key && s.key.trim() !== '' && !s.key.includes('#'));
        await insertData('settings', settings, 'key');

        // Migrate Gemini Keys
        const geminiKeys = await readCSV(path.join(__dirname, '..', 'data', 'gemini_keys.csv'));
        await insertData('gemini_keys', geminiKeys, 'key');

        // Migrate Wholesale
        const wholesale = await readCSV(path.join(__dirname, '..', 'data', 'wholesale.csv'));
        if(wholesale.length > 0) {
           const validWholesale = wholesale.map((w, index) => {
               if(!w.id) w.id = \`wholesale_fallback_\${index}\`;
               return w;
           });
           await insertData('wholesale', validWholesale, 'id');
        }

        console.log("🎉 Migration completed successfully.");

    } catch (err) {
        console.error("❌ Migration failed:", err);
    } finally {
        await client.end();
    }
}

runMigration();
