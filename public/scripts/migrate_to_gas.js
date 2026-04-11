const fs = require('fs');
const path = require('path');

// Configuration
const GAS_URL = 'https://script.google.com/macros/s/AKfycbzngGEzqTHfo3iH-ZJILiPgintKFP1ZPOxNfIh8sCD6AzLSJ6dvdO7XbBNyX_auVkn99w/exec';
const DATA_DIR = path.join(__dirname, '..', 'data');

async function migrate() {
    console.log("Starting migration to GAS...");

    try {
        // 1. Read Visits
        const visitsPath = path.join(DATA_DIR, 'visits.csv');
        const visitsRaw = fs.readFileSync(visitsPath, 'utf8').split('\n');
        const visitsHeaders = visitsRaw[0].split(',');
        const visits = visitsRaw.slice(1).filter(line => line.trim()).map(line => {
            const values = line.split(',');
            return {
                count: parseInt(values[0]),
                date: values[1].trim()
            };
        });
        console.log(`Read ${visits.length} visit records.`);

        // 2. Read Orders
        const ordersPath = path.join(DATA_DIR, 'orders.csv');
        const ordersRaw = fs.readFileSync(ordersPath, 'utf8').split('\n');
        const ordersHeaders = ordersRaw[0].split(',');
        const orders = ordersRaw.slice(1).filter(line => line.trim()).map(line => {
            const values = line.split(',');
            const obj = {};
            ordersHeaders.forEach((h, i) => {
                let val = values[i] || '';
                // Handle quoted items array if necessary (basic)
                if (h === 'items' && val.startsWith('"')) {
                    // This is a naive CSV parse, but enough for this controlled format
                    val = line.match(/"\[.*\]"/)?.[0] || val;
                    val = val.replace(/^"|"$/g, '');
                    try { val = JSON.parse(val); } catch(e) {}
                }
                obj[h.trim()] = val;
            });
            return obj;
        });
        console.log(`Read ${orders.length} order records.`);

        // 3. Send to GAS
        console.log("Sending data to GAS...");
        const response = await fetch(GAS_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'migrateData',
                data: {
                    visits: visits,
                    orders: orders
                }
            })
        });

        const result = await response.json();
        console.log("Migration Result:", result);

        if (result.status === 'success') {
            console.log("MIGRATION SUCCESSFUL!");
        } else {
            console.error("MIGRATION FAILED:", result.message || result.error);
        }

    } catch (e) {
        console.error("Migration error:", e);
    }
}

migrate();
