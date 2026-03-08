const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Initialize PostgreSQL pool
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

class SupabaseDAO {
    constructor(pool) {
        this.pool = pool;
    }

    getTableName(fileName) {
        let base = fileName.replace('.csv', '');
        if (base === 'gemini_keys') return 'keys';
        return base;
    }

    async getCsv(fileName) {
        const table = this.getTableName(fileName);
        try {
            const res = await this.pool.query(`SELECT * FROM ${table}`);
            return res.rows.map(row => {
                const mapped = {};
                for (const [k, v] of Object.entries(row)) {
                    if (v === null) mapped[k] = "";
                    else if (typeof v === 'object') mapped[k] = JSON.stringify(v);
                    else mapped[k] = String(v);
                }
                return mapped;
            });
        } catch (error) {
            console.error(`DB Read Error ${table}:`, error.message);
            return [];
        }
    }

    async updateCsv(fileName, list_of_dicts) {
        const table = this.getTableName(fileName);
        try {
            await this.pool.query(`TRUNCATE ${table}`);
            if (!list_of_dicts || list_of_dicts.length === 0) return;

            const columns = Object.keys(list_of_dicts[0]);
            const paramIndexes = columns.map((_, i) => `$${i + 1}`).join(', ');
            const queryText = `INSERT INTO ${table} (${columns.map(c => `"${c}"`).join(', ')}) VALUES (${paramIndexes})`;

            for (const row of list_of_dicts) {
                const values = columns.map(col => {
                    let val = row[col];
                    if (table === 'orders' && (col === 'items' || col === 'customer') && typeof val !== 'string') {
                        try { val = JSON.stringify(val); } catch (e) { }
                    }
                    return val;
                });
                await this.pool.query(queryText, values);
            }
        } catch (error) {
            console.error(`DB Write Error ${table}:`, error.message);
        }
    }
}

class GitHubDAO {
    constructor(repo, token) {
        this.repo = repo;
        this.token = token;
        this.baseUrl = `https://api.github.com/repos/${repo}/contents`;
    }

    async request(method, reqPath, data = null) {
        const url = `${this.baseUrl}/${reqPath}`;
        const headers = {
            'Authorization': `Bearer ${this.token}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
            'User-Agent': 'NodeJS-App'
        };

        const options = { method, headers };
        if (data) {
            options.body = JSON.stringify(data);
        }

        const response = await fetch(url, options);
        if (!response.ok) {
            if (response.status === 404) return null;
            throw new Error(`GitHub API Error ${response.status}: ${await response.text()}`);
        }
        return response.json();
    }

    async getCsv(reqPath) {
        const ghPath = reqPath.startsWith('data/') ? reqPath : `data/${reqPath}`;
        try {
            const resp = await this.request('GET', ghPath);
            if (!resp || !resp.content) return { data: [], sha: null };

            const contentStr = Buffer.from(resp.content, 'base64').toString('utf-8');
            if (!contentStr.trim()) return { data: [], sha: resp.sha };

            return new Promise((resolve, reject) => {
                const results = [];
                const stream = require('stream');
                const bufferStream = new stream.PassThrough();
                bufferStream.end(Buffer.from(contentStr));

                bufferStream
                    .pipe(csv())
                    .on('data', (data) => results.push(data))
                    .on('end', () => resolve({ data: results, sha: resp.sha }))
                    .on('error', reject);
            });
        } catch (e) {
            console.error(`Error decoding CSV file ${ghPath}:`, e.message);
            return { data: [], sha: null };
        }
    }

    async updateCsv(reqPath, list_of_dicts, message = "Update from server") {
        const ghPath = reqPath.startsWith('data/') ? reqPath : `data/${reqPath}`;
        const { sha } = await this.getCsv(reqPath);

        let contentStr = "";
        if (list_of_dicts && list_of_dicts.length > 0) {
            const { stringify } = require('csv-stringify/sync');
            contentStr = stringify(list_of_dicts, { header: true });
        }

        const contentB64 = Buffer.from(contentStr).toString('base64');
        const data = { message, content: contentB64 };
        if (sha) data.sha = sha;

        return this.request('PUT', ghPath, data);
    }
}

class MultiDAO {
    constructor(primary, secondary) {
        this.primary = primary;
        this.secondary = secondary;
    }

    async getCsv(path) {
        let res = await this.primary.getCsv(path);
        // Fallback to secondary if primary returned nothing or errored out (prevent empty storefronts on unconfigured DBs)
        if (!res || res.length === 0) {
            const fallback = await this.secondary.getCsv(path);
            res = fallback.data ? fallback.data : fallback;
        }
        return res;
    }

    async updateCsv(path, list_of_dicts, message = "Update from server") {
        try {
            await this.primary.updateCsv(path, list_of_dicts, message);
            console.log(`Successfully wrote ${path} to Primary DAO (Supabase)`);
        } catch (e) {
            console.error(`Primary DAO write failed:`, e.message);
        }

        try {
            await this.secondary.updateCsv(path, list_of_dicts, message);
            console.log(`Successfully wrote ${path} to Secondary DAO (GitHub)`);
        } catch (e) {
            console.error(`Secondary DAO write failed:`, e.message);
        }
    }
}

const GITHUB_REPO = "3omarhs/crtv-rarities-products";
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || "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";

const supabaseDb = new SupabaseDAO(pool);
const githubDb = new GitHubDAO(GITHUB_REPO, GITHUB_TOKEN);
const localDb = new MultiDAO(supabaseDb, githubDb);

async function loadProducts() {
    return await localDb.getCsv("products.csv");
}

function getAmmanToday() {
    const d = new Date();
    const utc = d.getTime() + (d.getTimezoneOffset() * 60000);
    const amman = new Date(utc + (3600000 * 3)); // +3 hours
    return amman.toISOString().substring(0, 10);
}

app.get('/api/products', async (req, res) => {
    try {
        const products = await loadProducts();

        const visibleProducts = products.filter(p => {
            const isHidden = String(p['hidden'] || p['Hidden'] || '').trim().toUpperCase();
            if (isHidden === 'TRUE' || isHidden === '1' || isHidden === 'YES') return false;

            const isActive = String(p['available'] || p['Active'] || 'TRUE').trim().toUpperCase();
            if (isActive === 'FALSE' || isActive === '0' || isActive === 'NO') return false;

            return true;
        });

        res.json(visibleProducts);
    } catch (e) {
        res.status(500).json({ error: e.message, stack: e.stack });
    }
});

app.get('/api/settings', async (req, res) => {
    try {
        const settingsList = await localDb.getCsv("settings.csv");
        const settingsDict = {};
        settingsList.forEach(row => {
            if (row.key) settingsDict[row.key] = row.value;
        });
        res.json(settingsDict);
    } catch (e) {
        res.json({});
    }
});

app.get('/api/admins', async (req, res) => {
    try {
        const adminsList = await localDb.getCsv("admins.csv");
        res.json(adminsList);
    } catch (e) {
        res.json([]);
    }
});

app.get('/api/gemini-keys', async (req, res) => {
    try {
        let keysList = await localDb.getCsv("gemini_keys.csv");
        if (!keysList || keysList.length === 0) {
            keysList = await localDb.getCsv("keys.csv");
        }
        const keys = keysList.filter(k => k.key && k.key.trim()).map(k => k.key);
        res.json({ keys });
    } catch (e) {
        res.json({ keys: [] });
    }
});

app.get('/api/visits', async (req, res) => {
    try {
        const visits = await localDb.getCsv("visits.csv");
        const total = visits.reduce((acc, v) => acc + (parseInt(v.count) || 0), 0);
        const daily = {};
        visits.forEach(v => {
            if (v.date) daily[v.date] = parseInt(v.count) || 0;
        });

        const today = getAmmanToday();
        const todayObj = visits.find(v => v.date === today);
        const todayCount = todayObj ? (parseInt(todayObj.count) || 0) : 0;

        res.json({ total, daily, today: todayCount, visits: total });
    } catch (e) {
        res.json({ total: 0, daily: {}, today: 0 });
    }
});

// Migration helper endpoint to verify JS is running
app.get('/api/index.py', (req, res) => {
    res.json({ message: "Running inside Node.js now", url: req.url });
});



app.get('/api/orders', async (req, res) => {
    try {
        const orders = await localDb.getCsv("orders.csv");
        orders.forEach(o => {
            try { if (typeof o.items === 'string' && o.items.startsWith('[')) o.items = JSON.parse(o.items); } catch (e) { }
            try { if (typeof o.customer === 'string' && o.customer.startsWith('{')) o.customer = JSON.parse(o.customer); } catch (e) { }
        });
        res.json(orders);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});
app.post('/api/admins', async (req, res) => {
    try {
        const { username, password } = req.body;
        const admins = await localDb.getCsv("admins.csv");
        if (admins.some(a => a.username === username)) {
            return res.status(400).json({ error: "Username exists" });
        }
        admins.push({ username, password, created_at: new Date().toISOString() });
        await localDb.updateCsv("admins.csv", admins);
        res.json({ status: "success" });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.put('/api/admins', async (req, res) => {
    try {
        const { username, newPassword } = req.body;
        const admins = await localDb.getCsv("admins.csv");
        const admin = admins.find(a => a.username === username);
        if (admin) {
            admin.password = newPassword;
            await localDb.updateCsv("admins.csv", admins);
            res.json({ status: "success" });
        } else {
            res.status(404).json({ error: "Admin not found" });
        }
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/admins', async (req, res) => {
    try {
        const { username } = req.body;
        const admins = await localDb.getCsv("admins.csv");
        const newAdmins = admins.filter(a => a.username !== username);
        if (newAdmins.length < admins.length) {
            await localDb.updateCsv("admins.csv", newAdmins);
        }
        res.json({ status: "success" });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/settings', async (req, res) => {
    try {
        const settings = await localDb.getCsv("settings.csv");
        const updates = req.body.key ? { [req.body.key]: req.body.value } : req.body;

        for (const [key, value] of Object.entries(updates)) {
            const existing = settings.find(s => s.key === key);
            if (existing) existing.value = value;
            else settings.push({ key, value });
        }
        await localDb.updateCsv("settings.csv", settings);
        res.json({ status: "success" });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/visits', async (req, res) => {
    try {
        const today = getAmmanToday();
        const visits = await localDb.getCsv("visits.csv");
        const todayVisit = visits.find(v => v.date === today);
        if (todayVisit) {
            todayVisit.count = (parseInt(todayVisit.count) || 0) + 1;
        } else {
            visits.push({ date: today, count: 1 });
        }
        await localDb.updateCsv("visits.csv", visits);
        res.json({ status: "success" });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/place-order', async (req, res) => {
    try {
        const orders = await localDb.getCsv("orders.csv");
        const orderData = { ...req.body };
        if (orderData.items) orderData.items = JSON.stringify(orderData.items);
        if (orderData.customer) orderData.customer = JSON.stringify(orderData.customer);
        orders.push(orderData);
        await localDb.updateCsv("orders.csv", orders);
        res.json({ status: "success" });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/orders', async (req, res) => {
    try {
        const orders = await localDb.getCsv("orders.csv");
        const orderData = { ...req.body };
        if (orderData.items) orderData.items = JSON.stringify(orderData.items);
        if (orderData.customer) orderData.customer = JSON.stringify(orderData.customer);
        orders.push(orderData);
        await localDb.updateCsv("orders.csv", orders);
        res.json({ status: "success" });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/update-order-status', async (req, res) => {
    try {
        const { orderId, status } = req.body;
        if (!orderId || !status) return res.status(400).json({ error: "Missing orderId or status" });
        const orders = await localDb.getCsv("orders.csv");
        const order = orders.find(o => String(o.id) === String(orderId));
        if (order) {
            order.status = status;
            await localDb.updateCsv("orders.csv", orders);
            res.json({ status: "success" });
        } else {
            res.status(404).json({ error: "Order not found" });
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/orders', async (req, res) => {
    try {
        const { orderId } = req.body;
        const orders = await localDb.getCsv("orders.csv");
        const newOrders = orders.filter(o => String(o.id) !== String(orderId));
        if (newOrders.length < orders.length) {
            await localDb.updateCsv("orders.csv", newOrders);
        }
        res.json({ status: "success" });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/special-offers', async (req, res) => {
    try {
        const { item_no, special_price, category } = req.body;
        const offers = await localDb.getCsv("wholesale.csv");
        const existing = offers.find(o => String(o.item_no) === String(item_no));
        if (existing) {
            existing.special_price = special_price;
            existing.category = category;
            existing.updated_at = new Date().toISOString();
        } else {
            offers.push({
                id: Date.now().toString(),
                item_no, special_price, category,
                updated_at: new Date().toISOString()
            });
        }
        await localDb.updateCsv("wholesale.csv", offers);
        res.json({ status: "success" });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/special-offers', async (req, res) => {
    try {
        const { item_no, special_price, category } = req.body;
        const offers = await localDb.getCsv("wholesale.csv");
        const existing = offers.find(o => String(o.item_no) === String(item_no));
        if (existing) {
            existing.special_price = special_price;
            existing.category = category;
            existing.updated_at = new Date().toISOString();
            await localDb.updateCsv("wholesale.csv", offers);
            res.json({ status: "success" });
        } else {
            res.status(404).json({ error: "Wholesale item not found" });
        }
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/special-offers', async (req, res) => {
    try {
        const { item_no } = req.body;
        const offers = await localDb.getCsv("wholesale.csv");
        const newOffers = offers.filter(o => String(o.item_no) !== String(item_no));
        if (newOffers.length < offers.length) {
            await localDb.updateCsv("wholesale.csv", newOffers);
        }
        res.json({ status: "success" });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/special-offers', async (req, res) => {
    try {
        const offers = await localDb.getCsv("wholesale.csv");
        const products = await loadProducts();

        const enrichedOffers = offers.map(offer => {
            const product = products.find(p => String(p.item_no) === String(offer.item_no));
            let price = 0;
            if (product) {
                const rawPrice = product.price_low_qty || product.price || 0;
                price = parseFloat(rawPrice) || 0;
            }
            return {
                id: offer.id,
                item_no: offer.item_no,
                special_price: offer.special_price,
                category: offer.category,
                name: product ? product.name : "Unknown",
                price,
                description: product ? product.description : "",
                images: []
            };
        });
        res.json(enrichedOffers);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/migrate-db', async (req, res) => {
    try {
        // No manual static creation here, we will drop and recreate dynamically
        console.log("Fetching CSVs from GitHub for migration...");
        const settings = await githubDb.getCsv("settings.csv");
        const admins = await githubDb.getCsv("admins.csv");
        const visits = await githubDb.getCsv("visits.csv");
        const orders = await githubDb.getCsv("orders.csv");
        const offers = await githubDb.getCsv("wholesale.csv");
        const productsRaw = await loadProducts();

        console.log("Recreating tables to perfectly match CSV headers...");
        const datasets = [
            { name: 'settings', data: settings },
            { name: 'admins', data: admins },
            { name: 'visits', data: visits },
            { name: 'orders', data: orders },
            { name: 'wholesale', data: offers },
            { name: 'products', data: productsRaw }
        ];

        for (const ds of datasets) {
            const table = ds.name;
            await pool.query(`DROP TABLE IF EXISTS "${table}"`);

            if (ds.data && ds.data.length > 0) {
                const columns = Object.keys(ds.data[0]);
                const colDefs = columns.map(c => `"${c}" TEXT`).join(', ');
                await pool.query(`CREATE TABLE "${table}" (${colDefs})`);
            } else {
                await pool.query(`CREATE TABLE "${table}" (id TEXT)`);
            }
        }


        console.log("Writing to Supabase...");

        if (settings && settings.length) await supabaseDb.updateCsv("settings.csv", settings);
        if (admins && admins.length) await supabaseDb.updateCsv("admins.csv", admins);
        if (visits && visits.length) await supabaseDb.updateCsv("visits.csv", visits);
        if (orders && orders.length) await supabaseDb.updateCsv("orders.csv", orders);
        if (offers && offers.length) await supabaseDb.updateCsv("wholesale.csv", offers);
        if (productsRaw && productsRaw.length) await supabaseDb.updateCsv("products.csv", productsRaw);

        res.json({ status: "success", message: "Database tables created and data migrated from GitHub to Supabase." });
    } catch (e) {
        console.error("Migration error:", e);
        res.status(500).json({ status: "error", error: e.message });
    }
});

module.exports = app;

if (require.main === module) {
    const PORT = process.env.PORT || 8000;
    app.listen(PORT, () => console.log(`Node server listening on port ${PORT}`));
}
