const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const app = express();
const PORT = 8000;

// Middleware
app.use(express.json());
app.use(express.static(__dirname)); // Serve current directory files

// Ensure assets/products exists
const uploadDir = path.join(__dirname, 'assets', 'products');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer Storage Configuration
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const productNo = req.body.productNo;
        if (!productNo) {
            return cb(new Error("Product Number is missing"));
        }

        // Find next index
        // Pattern: ProductNo_1.jpg, ProductNo_2.png, etc.
        let index = 1;
        while (true) {
            // Check broadly for extensions (jpg, png, jpeg, etc)
            // But simpler: just check if ANY file with this prefix_index exists?
            // Actually, extensions matter. Let's just find the first available index.
            const ext = path.extname(file.originalname);
            const candidateName = `${productNo}_${index}${ext}`;
            const candidatePath = path.join(uploadDir, candidateName);

            if (!fs.existsSync(candidatePath)) {
                // Also check other extensions to be safe? 
                // The prompt implies we just append, so presumably checking exact filename is enough.
                // But better logic: Count existing files starting with productNo + "_"
                // This 'while' loop does exactly that: finds the first gap or end.
                cb(null, candidateName);
                break;
            }
            index++;

            // Safety break
            if (index > 100) break;
        }
    }
});

const upload = multer({ storage: storage });

// API Endpoint
app.post('/api/upload-images', upload.array('images', 10), (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ status: 'error', message: 'No files uploaded' });
        }
        res.json({
            status: 'success',
            message: `Uploaded ${req.files.length} images successfully.`,
            files: req.files.map(f => f.filename)
        });
    } catch (e) {
        console.error("Upload error:", e);
        res.status(500).json({ status: 'error', message: e.message });
    }
});

// App Settings Endpoint (re-implementing existing logic from admin.js expectations)
// Simple mock for now as admin.js uses /api/settings
const settingsFile = path.join(__dirname, 'settings.json');
app.get('/api/settings', (req, res) => {
    if (fs.existsSync(settingsFile)) {
        res.sendFile(settingsFile);
    } else {
        res.json({});
    }
});

app.post('/api/settings', (req, res) => {
    fs.writeFileSync(settingsFile, JSON.stringify(req.body, null, 2));
    res.json({ status: 'success' });
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(`Assets directory: ${uploadDir}`);
});
