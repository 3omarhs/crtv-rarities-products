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
    let sheet = ss.getSheetByName('product_updates');
    if (!sheet) {
        sheet = ss.insertSheet('product_updates');
        sheet.appendRow(['Timestamp', 'Action', 'No', 'Data']);
    }
    sheet.appendRow([new Date(), 'update', product.No || 'N/A', JSON.stringify(product)]);
    return jsonResponse({ status: 'success', message: 'Product change logged to spreadsheet' });
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

function doOptions(e) {
    return ContentService.createTextOutput("")
        .setMimeType(ContentService.MimeType.TEXT);
}
