/**
 * CREATIVE RARITIES - GOOGLE APPS SCRIPT BACKEND V4.1
 * 
 * INSTRUCTIONS:
 * 1. Go to your Google Sheet.
 * 2. Click Extensions > Apps Script.
 * 3. Delete any code there and paste ALL hereof this code.
 * 4. Ensure you have sheets named: 'orders', 'visits', 'settings', 'gemini_keys'.
 * 5. Click Deploy > New deployment (Web app, Me, Anyone).
 * 6. Copy the URL and paste into Admin Settings.
 */

const SPREADSHEET_ID = '1x3ExLPeQwSJtewUXQhYwdXO_I3Owhs6fenFc4UlbwPU';

// Handles GET requests (Standard, but can have CORS issues in some browsers)
function doGet(e) {
    const action = e.parameter.action;
    return handleAllActions(action, e.parameter);
}

// Handles POST requests (Bypasses some CORS issues for data retrieval if action in body)
function doPost(e) {
    try {
        const data = JSON.parse(e.postData.contents);
        const action = data.action;
        return handleAllActions(action, data);
    } catch (error) {
        return jsonResponse({ status: 'error', message: error.toString() });
    }
}

function handleAllActions(action, params) {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    
    try {
        // --- DATA RETRIEVAL (GET-STYLE via POST/GET) ---
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

        // --- DATA UPDATE (POST-STYLE) ---
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
        
        return jsonResponse({ error: 'Invalid action: ' + action });
    } catch (err) {
        return jsonResponse({ error: err.toString() });
    }
}

function handleNewOrder(order) {
    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('orders');
    if (!sheet) return jsonResponse({ status: 'error', message: 'Orders sheet not found' });

    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const rowData = headers.map(header => {
        let val = order[header];
        if (header === 'items' && Array.isArray(val)) return val.join(' | ');
        if (header === 'date' && !val) return new Date().toISOString();
        return val || '';
    });

    sheet.appendRow(rowData);
    return jsonResponse({ status: 'success', message: 'Order recorded' });
}

function handleVisit() {
    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('visits');
    if (!sheet) return jsonResponse({ status: 'error', message: 'Visits sheet not found' });

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
    return jsonResponse({ status: 'success', message: 'Visit recorded' });
}

function handleProductUpdate(product) {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const GID = '897526080'; // The storefront sheet GID from app.js
    
    // 1. Find the correct sheet by GID
    let sheet = ss.getSheets().find(s => s.getSheetId().toString() === GID);
    
    // Fallback: search by name common variations if GID not found
    if (!sheet) {
        sheet = ss.getSheetByName('products') || 
                ss.getSheetByName('Products') || 
                ss.getSheetByName('Storefront');
    }
    
    if (!sheet) return jsonResponse({ status: 'error', message: 'Storefront sheet not found (GID: ' + GID + ')' });

    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const noIndex = headers.indexOf('No');
    if (noIndex === -1) return jsonResponse({ status: 'error', message: 'Column "No" not found in sheet' });

    const data = sheet.getDataRange().getValues();
    let rowIndex = -1;

    // 2. Find existing row if updating
    if (product.No) {
        for (let i = 1; i < data.length; i++) {
            if (String(data[i][noIndex]) === String(product.No)) {
                rowIndex = i + 1;
                break;
            }
        }
    }

    // 3. Prepare row data based on headers
    const rowData = headers.map(h => {
        // Robust mapping: try exact match, then case-insensitive
        let val = product[h];
        if (val === undefined) {
             const lowerH = h.toLowerCase().trim();
             const key = Object.keys(product).find(k => k.toLowerCase().trim() === lowerH);
             val = key ? product[key] : '';
        }
        return val;
    });

    // 4. Update or Append
    if (rowIndex > 0) {
        sheet.getRange(rowIndex, 1, 1, rowData.length).setValues([rowData]);
        syncSpreadsheetToGitHub(); // Async-ish (GAS will wait, but we return success)
        return jsonResponse({ status: 'success', message: 'Product updated in spreadsheet and GitHub sync triggered' });
    } else {
        sheet.appendRow(rowData);
        syncSpreadsheetToGitHub();
        return jsonResponse({ status: 'success', message: 'Product added to spreadsheet and GitHub sync triggered' });
    }
}

/**
 * TRIGGER: Syncs the entire storefront sheet to GitHub data/products.csv
 */
function syncSpreadsheetToGitHub() {
    const GITHUB_TOKEN = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
    if (!GITHUB_TOKEN) {
        Logger.log("GITHUB_TOKEN not found in Script Properties. Skipping GitHub sync.");
        return;
    }

    const REPO = "3omarhs/crtv-rarities-products";
    const FILE_PATH = "data/products.csv";
    const GID = '897526080';

    try {
        const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
        let sheet = ss.getSheets().find(s => s.getSheetId().toString() === GID);
        if (!sheet) return;

        const data = sheet.getDataRange().getValues();
        const csvContent = data.map(row => {
            return row.map(cell => {
                let val = String(cell);
                if (val.includes(',') || val.includes('"') || val.includes('\n')) {
                    return '"' + val.replace(/"/g, '""') + '"';
                }
                return val;
            }).join(',');
        }).join('\n');

        commitToGitHub(REPO, FILE_PATH, csvContent, "Sync products.csv from Google Sheet [Live Update]");
    } catch (e) {
        Logger.log("GitHub Sync Error: " + e.toString());
    }
}

function commitToGitHub(repo, path, content, message) {
    const GITHUB_TOKEN = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
    const url = `https://api.github.com/repos/${repo}/contents/${path}`;
    
    // 1. Get current file info (for SHA)
    const options = {
        'method': 'get',
        'headers': {
            'Authorization': 'token ' + GITHUB_TOKEN,
            'Accept': 'application/vnd.github.v3+json'
        },
        'muteHttpExceptions': true
    };

    const res = UrlFetchApp.fetch(url, options);
    let sha = null;
    if (res.getResponseCode() === 200) {
        sha = JSON.parse(res.getContentText()).sha;
    }

    // 2. Commit changes
    const payload = {
        'message': message,
        'content': Utilities.base64Encode(content, Utilities.Charset.UTF_8),
        'branch': 'main'
    };
    if (sha) payload.sha = sha;

    const commitOptions = {
        'method': 'put',
        'contentType': 'application/json',
        'headers': {
            'Authorization': 'token ' + GITHUB_TOKEN,
            'Accept': 'application/vnd.github.v3+json'
        },
        'payload': JSON.stringify(payload),
        'muteHttpExceptions': true
    };

    const commitRes = UrlFetchApp.fetch(url, commitOptions);
    Logger.log("GitHub Commit Response: " + commitRes.getContentText());
}

function handleSaveSettings(settings) {
    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('settings');
    if (!sheet) return jsonResponse({ status: 'error', message: 'Settings sheet not found' });
    
    // Simple key-value update
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
    return jsonResponse({ status: 'success' });
}

function jsonResponse(data) {
    return ContentService.createTextOutput(JSON.stringify(data))
        .setMimeType(ContentService.MimeType.JSON);
}

function handleMigration(payload) {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const results = {};

    if (payload.visits) {
        const sheet = ss.getSheetByName('visits');
        if (sheet) {
            sheet.clearContents();
            sheet.appendRow(['date', 'count']);
            payload.visits.forEach(v => {
                if (v.date && v.count) sheet.appendRow([v.date, v.count]);
            });
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

    return jsonResponse({ status: 'success', results: results });
}

function doOptions(e) {
    return ContentService.createTextOutput("")
        .setMimeType(ContentService.MimeType.TEXT);
}

function handleGeminiProxy(payload) {
    const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
    if (!apiKey) {
        return jsonResponse({ error: 'GEMINI_API_KEY not found in Script Properties. Please add it in project settings.' });
    }

    // Support both direct payload and wrapped payload
    let finalPayload = payload.contents ? payload : (payload.payload || payload);
    
    // Ensure contents exists
    if (!finalPayload.contents) {
        return jsonResponse({ error: 'Invalid payload: missing contents' });
    }

    // Comprehensive tier fallback using VERIFIED models from your listModels diagnostic
    const tiers = [
        { url: 'https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent', model: 'gemini-2.5-flash' },
        { url: 'https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent', model: 'gemini-2.0-flash' },
        { url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent', model: 'gemini-2.5-pro' },
        { url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent', model: 'gemini-1.5-flash' }
    ];

    let errors = [];

    for (let tier of tiers) {
        const url = tier.url + '?key=' + apiKey;
        const options = {
            'method': 'post',
            'contentType': 'application/json',
            'payload': JSON.stringify(finalPayload),
            'muteHttpExceptions': true
        };

        try {
            const response = UrlFetchApp.fetch(url, options);
            const responseCode = response.getResponseCode();
            const responseText = response.getContentText();
            
            if (responseCode === 200) {
                const result = JSON.parse(responseText);
                result.debug_model = tier.model; // Tag which one worked
                return jsonResponse(result);
            } else {
                let msg = responseText;
                try {
                    const errJson = JSON.parse(responseText);
                    msg = errJson.error ? errJson.error.message : responseText;
                } catch(e) {}
                errors.push(`${tier.model} (${responseCode}): ${msg}`);
            }
        } catch (err) {
            errors.push(`${tier.model} (GAS Error): ${err.toString()}`);
        }
    }

    return jsonResponse({ 
        error: 'Gemini API Error: All model tiers failed.',
        details: errors,
        note: 'Check if Generative Language API is enabled in Google Cloud Console for your API Key.'
    });
}

function listModels() {
    const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
    if (!apiKey) {
        Logger.log("ERROR: No API Key found in Script Properties!");
        return "No API Key found";
    }
    
    const url = 'https://generativelanguage.googleapis.com/v1beta/models?key=' + apiKey;
    try {
        const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
        const text = response.getContentText();
        Logger.log("Available Models: " + text);
        return text;
    } catch (e) {
        Logger.log("GAS Error: " + e.toString());
        return e.toString();
    }
}
