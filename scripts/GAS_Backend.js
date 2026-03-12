/**
 * CREATIVE RARITIES - GOOGLE APPS SCRIPT BACKEND V4.4 (ULTIMATE CORS STABLE)
 * 
 * INSTRUCTIONS:
 * 1. Go to your Google Sheet.
 * 2. Click Extensions > Apps Script.
 * 3. Delete ANY code there and paste ALL of this code.
 * 4. Ensure you have sheets named: 'orders', 'visits', 'settings', 'gemini_keys'.
 * 5. Click Deploy > New deployment (Web app, Me, Anyone).
 * 6. Copy the URL and paste into Admin Settings.
 */

const SPREADSHEET_ID = '1x3ExLPeQwSJtewUXQhYwdXO_I3Owhs6fenFc4UlbwPU';

// Handles GET requests (Definitively bypasses CORS for small payloads)
function doGet(e) {
    if (e.parameter.action === 'proxyGemini') {
        return handleGeminiProxy(JSON.parse(e.parameter.data));
    }
    if (e.parameter.action) {
        return handleAllActions(e.parameter.action, e.parameter);
    }
    return ContentService.createTextOutput(JSON.stringify({ status: "active", version: "4.4" }))
        .setMimeType(ContentService.MimeType.JSON);
}

// Handles POST requests (Supports JSON and Form-Encoded)
function doPost(e) {
    try {
        let action, data;
        
        // Handle application/x-www-form-urlencoded or text/plain
        if (e.parameter && e.parameter.action) {
            action = e.parameter.action;
            data = e.parameter.data ? JSON.parse(e.parameter.data) : e.parameter;
        } else {
            // Handle raw JSON
            const contents = JSON.parse(e.postData.contents);
            action = contents.action;
            data = contents;
        }
        
        return handleAllActions(action, data);
    } catch (error) {
        return jsonResponse({ result: "error", error: "doPost Error: " + error.toString() });
    }
}

function handleAllActions(action, params) {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    
    try {
        // --- DATA RETRIEVAL ---
        if (action === 'getOrders') {
            const sheet = ss.getSheetByName('orders');
            const data = sheet.getDataRange().getValues();
            const headers = data[0];
            const orders = data.slice(1).map(row => {
                let obj = {};
                headers.forEach((h, i) => obj[h] = row[i]);
                return obj;
            });
            return jsonResponse(orders);
        } else if (action === 'getVisits') {
            const sheet = ss.getSheetByName('visits');
            const data = sheet.getDataRange().getValues();
            let total = 0;
            let daily = {};
            data.slice(1).forEach(row => {
                const date = row[0] instanceof Date ? row[0].toISOString().split('T')[0] : String(row[0]);
                const count = Number(row[1]);
                total += count;
                daily[date] = count;
            });
            const today = new Date().toISOString().split('T')[0];
            return jsonResponse({ total: total, daily: daily, today: daily[today] || 0 });
        } else if (action === 'getGeminiKeys') {
            const sheet = ss.getSheetByName('gemini_keys');
            if (!sheet) return jsonResponse({ keys: [] });
            const data = sheet.getDataRange().getValues();
            const keys = data.slice(1).map(row => row[0]).filter(k => k);
            return jsonResponse({ keys: keys });
        } else if (action === 'getSettings') {
            const sheet = ss.getSheetByName('settings');
            if (!sheet) return jsonResponse({});
            const data = sheet.getDataRange().getValues();
            let settings = {};
            data.slice(1).forEach(row => { if(row[0]) settings[row[0]] = row[1]; });
            return jsonResponse(settings);
        }

        // --- DATA UPDATE ---
        if (action === 'placeOrder' || action === 'addOrder') {
            return handleNewOrder(params.order || params);
        } else if (action === 'recordVisit') {
            return handleVisit();
        } else if (action === 'addProduct' || action === 'updateProduct') {
            return handleProductUpdate(params.product || params);
        } else if (action === 'saveSettings') {
            return handleSaveSettings(params.settings || params);
        } else if (action === 'migrateData') {
            return handleMigration(params.data || params);
        } else if (action === 'proxyGemini') {
            return handleGeminiProxy(params.payload || params);
        }
        
        return jsonResponse({ result: "error", error: 'Invalid action: ' + action });
    } catch (err) {
        return jsonResponse({ result: "error", error: err.toString() });
    }
}

function handleNewOrder(order) {
    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('orders');
    if (!sheet) return jsonResponse({ result: 'error', message: 'Orders sheet not found' });
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const rowData = headers.map(header => {
        let val = order[header];
        if (header === 'items' && Array.isArray(val)) return val.join(' | ');
        if (header === 'date' && !val) return new Date().toISOString();
        return val || '';
    });
    sheet.appendRow(rowData);
    return jsonResponse({ result: 'success', message: 'Order recorded' });
}

function handleVisit() {
    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('visits');
    if (!sheet) return jsonResponse({ result: 'error', message: 'Visits sheet not found' });
    const today = new Date().toISOString().split('T')[0];
    const data = sheet.getDataRange().getValues();
    let found = false;
    for (let i = 1; i < data.length; i++) {
        const date = data[i][0] instanceof Date ? data[i][0].toISOString().split('T')[0] : String(data[i][0]);
        if (date === today) {
            sheet.getRange(i + 1, 2).setValue(Number(data[i][1]) + 1);
            found = true;
            break;
        }
    }
    if (!found) sheet.appendRow([today, 1]);
    return jsonResponse({ result: 'success', message: 'Visit recorded' });
}

function handleProductUpdate(product) {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    let sheet = ss.getSheetByName('product_updates');
    if (!sheet) {
        sheet = ss.insertSheet('product_updates');
        sheet.appendRow(['Timestamp', 'Action', 'No', 'Data']);
    }
    sheet.appendRow([new Date(), 'update', product.No || 'N/A', JSON.stringify(product)]);
    return jsonResponse({ result: 'success', message: 'Product change logged' });
}

function handleSaveSettings(settings) {
    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('settings');
    if (!sheet) return jsonResponse({ result: 'error', message: 'Settings sheet not found' });
    const data = sheet.getDataRange().getValues();
    for (let key in settings) {
        let found = false;
        for (let i = 1; i < data.length; i++) {
            if (data[i][0] === key) {
                sheet.getRange(i + 1, 2).setValue(settings[key]);
                found = true;
                break;
            }
        }
        if (!found) sheet.appendRow([key, settings[key]]);
    }
    return jsonResponse({ result: 'success' });
}

function handleMigration(payload) {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const results = {};
    if (payload.visits) {
        const sheet = ss.getSheetByName('visits');
        if (sheet) {
            sheet.clearContents();
            sheet.appendRow(['date', 'count']);
            payload.visits.forEach(v => {if (v.date && v.count) sheet.appendRow([v.date, v.count]);});
            results.visits = 'imported ' + payload.visits.length;
        }
    }
    if (payload.orders) {
        const sheet = ss.getSheetByName('orders');
        if (sheet) {
            sheet.clearContents();
            const headers = ['address','currency','customerName','customerPhone','date','id','items','method','paymentMethod','selectedCompany','selectedRegion','status','timestamp','total'];
            sheet.appendRow(headers);
            payload.orders.forEach(o => {
                const row = headers.map(h => {
                    let val = o[h];
                    if (h === 'items' && Array.isArray(val)) return val.join(' | ');
                    return val || '';
                });
                sheet.appendRow(row);
            });
            results.orders = 'imported ' + payload.orders.length;
        }
    }
    return jsonResponse({ result: 'success', results: results });
}

function handleGeminiProxy(payload) {
    const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
    if (!apiKey) return jsonResponse({ result: "error", error: 'GEMINI_API_KEY not found in Script Properties.' });
    let finalPayload = payload.contents ? payload : (payload.payload || payload);
    if (!finalPayload.contents) return jsonResponse({ result: "error", error: 'Invalid payload' });

    const tiers = [
        { url: 'https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent', model: 'gemini-2.0-flash' },
        { url: 'https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent', model: 'gemini-1.5-flash' },
        { url: 'https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash-8b:generateContent', model: 'gemini-1.5-flash-8b' }
    ];

    let errors = [];
    for (let tier of tiers) {
        const url = tier.url + '?key=' + apiKey;
        try {
            const response = UrlFetchApp.fetch(url, {
                'method': 'post',
                'contentType': 'application/json',
                'payload': JSON.stringify(finalPayload),
                'muteHttpExceptions': true
            });
            const code = response.getResponseCode();
            const text = response.getContentText();
            if (code === 200) return jsonResponse(JSON.parse(text));
            errors.push(`${tier.model} (${code}): ${text}`);
        } catch (err) { errors.push(`${tier.model} Error: ${err.toString()}`); }
    }
    return jsonResponse({ result: "error", error: 'All AI tiers failed', details: errors });
}

function jsonResponse(data) {
    return ContentService.createTextOutput(JSON.stringify(data))
        .setMimeType(ContentService.MimeType.JSON);
}
