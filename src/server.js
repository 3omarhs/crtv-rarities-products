const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

// --- DATABASE LOGIC (JSON) ---
const DB_FILE = path.join(__dirname, 'data.json');
const ADMIN_FILE = path.join(__dirname, 'adminCredentials.txt');
const VISITS_FILE = path.join(__dirname, 'visits.json');
const UPLOAD_DIR = path.join(__dirname, '..', 'public', 'assets', 'products');

// Ensure Upload Dir
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Initialize DB (Auto-Migration)
function initDB() {
    if (!fs.existsSync(DB_FILE)) {
        console.log("Initializing database...");
        const initialData = {
            admins: [],
            visits: { total: 0, daily: {} },
            settings: {}
        };

        // Migrate Admins
        if (fs.existsSync(ADMIN_FILE)) {
            try {
                const text = fs.readFileSync(ADMIN_FILE, 'utf-8');
                const lines = text.split(/\r?\n/);
                for (let i = 0; i < lines.length; i += 2) {
                    if (lines[i] && lines[i + 1]) {
                        const userLine = lines[i].trim();
                        const passLine = lines[i + 1].trim();
                        if (userLine.startsWith('Username:') && passLine.startsWith('Password:')) {
                            initialData.admins.push({
                                username: userLine.replace('Username:', '').trim(),
                                password: passLine.replace('Password:', '').trim()
                            });
                        }
                    }
                }
                console.log(`Migrated ${initialData.admins.length} admins.`);
            } catch (e) {
                console.error("Migration Error (Admins):", e);
            }
        } else {
            // Default admin if no file
            initialData.admins.push({ username: 'admin', password: 'admin123' });
        }

        // Migrate Visits
        if (fs.existsSync(VISITS_FILE)) {
            try {
                const visitsData = JSON.parse(fs.readFileSync(VISITS_FILE, 'utf-8'));
                if (visitsData) {
                    // Normalize structure
                    initialData.visits.total = visitsData.total || 0;
                    initialData.visits.daily = visitsData.daily || {};
                    // If visitsData had 'history' instead of 'daily' (legacy check)
                    if (visitsData.history) initialData.visits.daily = { ...initialData.visits.daily, ...visitsData.history };
                }
                console.log("Migrated visits data.");
            } catch (e) {
                console.error("Migration Error (Visits):", e);
            }
        }

        fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2));
        console.log("Database initialized at " + DB_FILE);
    }
}

function readDB() {
    try {
        if (!fs.existsSync(DB_FILE)) initDB();
        return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
    } catch (e) {
        console.error("Database Read Error:", e);
        return { admins: [], visits: { total: 0, daily: {} }, settings: {} };
    }
}

function writeDB(data) {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error("Database Write Error:", e);
    }
}

initDB(); // Run on startup

// --- MIDDLEWARE ---
app.use(express.static(__dirname)); // Serve static files
app.use(express.json()); // Parse JSON bodies

// --- API ENDPOINTS ---

// 1. Admin Management
app.get('/api/admins', (req, res) => {
    const db = readDB();
    res.json(db.admins);
});

app.post('/api/admins', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: "Missing fields" });

    const db = readDB();
    if (db.admins.find(a => a.username === username)) {
        return res.status(400).json({ error: "Admin already exists" });
    }

    db.admins.push({ username, password });
    writeDB(db);
    res.json({ status: 'success' });
});

app.put('/api/admins', (req, res) => {
    const { username, newPassword } = req.body;
    const db = readDB();
    const admin = db.admins.find(a => a.username === username);
    if (!admin) return res.status(404).json({ error: "Admin not found" });

    admin.password = newPassword;
    writeDB(db);
    res.json({ status: 'success' });
});

app.delete('/api/admins', (req, res) => {
    const { username } = req.body;
    let db = readDB();
    const initialLen = db.admins.length;
    db.admins = db.admins.filter(a => a.username !== username);

    if (db.admins.length === initialLen) return res.status(404).json({ error: "Admin not found" });

    writeDB(db);
    res.json({ status: 'success' });
});

// 2. Visits Tracking
app.get('/api/visits', (req, res) => {
    const db = readDB();
    res.json(db.visits);
});

app.post('/api/visits', (req, res) => {
    const db = readDB();
    const today = new Date().toISOString().split('T')[0];
    const { deviceName } = req.body;

    db.visits.total = (db.visits.total || 0) + 1;
    if (!db.visits.daily) db.visits.daily = {};
    db.visits.daily[today] = (db.visits.daily[today] || 0) + 1;

    // Log the device if provided
    if (deviceName) {
        if (!db.visits.dailyLogs) db.visits.dailyLogs = {};
        if (!db.visits.dailyLogs[today]) db.visits.dailyLogs[today] = [];
        db.visits.dailyLogs[today].push(deviceName);
        
        // Keep only last 100 logs per day to avoid huge JSON
        if (db.visits.dailyLogs[today].length > 100) {
            db.visits.dailyLogs[today].shift();
        }
    }

    writeDB(db);
    res.json({ 
        visits: db.visits.total, 
        today: db.visits.daily[today],
        logs: db.visits.dailyLogs ? db.visits.dailyLogs[today] : []
    });
});

// 3. Settings (DB + Legacy Sync)
app.post('/api/settings', (req, res) => {
    const db = readDB();
    db.settings = { ...db.settings, ...req.body };
    writeDB(db);

    // Legacy write for compatibility if needed
    try {
        fs.writeFileSync(path.join(__dirname, 'storedetails.txt'), JSON.stringify(req.body, null, 2));
    } catch (e) { console.error("Legacy settings write failed", e); }

    res.json({ status: 'success' });
});

app.get('/api/settings', (req, res) => {
    const db = readDB();
    res.json(db.settings || {});
});

// 4. Image Upload (Binary Stream Support)
app.post('/api/upload-image', (req, res) => {
    const filename = req.headers['x-filename'];
    if (!filename) {
        return res.status(400).json({ error: "X-Filename header missing" });
    }

    const filePath = path.join(UPLOAD_DIR, filename);
    const writeStream = fs.createWriteStream(filePath);

    req.pipe(writeStream);

    writeStream.on('error', (err) => {
        console.error("Upload Error:", err);
        res.status(500).json({ error: "File upload failed" });
    });

    writeStream.on('finish', () => {
        console.log(`File uploaded: ${filename}`);
        res.json({ status: 'success', filename: filename });
    });
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(`Database File: ${DB_FILE}`);
});
