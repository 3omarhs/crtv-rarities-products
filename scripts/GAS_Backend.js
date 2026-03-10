/**
 * CREATIVE RARITIES - GOOGLE APPS SCRIPT BACKEND V4.0
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

function doGet(e) {
    const action = e.parameter.action;
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    
    try {
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
                const date = row[0] instanceof Date ? row[0].toISOString().split('T')[0] : row[0];
                const count = Number(row[1]);
                total += count;
                daily[date] = count;
            });
            return jsonResponse({ total: total, daily: daily, today: daily[new Date().toISOString().split('T')[0]] || 0 });
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
        
        return jsonResponse({ error: 'Invalid GET action' });
    } catch (err) {
        return jsonResponse({ error: err.toString() });
    }
}

function doPost(e) {
    try {
        const data = JSON.parse(e.postData.contents);
        const action = data.action;

        if (action === 'placeOrder' || action === 'addOrder') {
            return handleNewOrder(data.order || data);
        } else if (action === 'recordVisit') {
            return handleVisit();
        } else if (action === 'addProduct' || action === 'updateProduct') {
            return handleProductUpdate(data.product || data);
        } else if (action === 'saveSettings') {
            return handleSaveSettings(data.settings || data);
        }

        return jsonResponse({ status: 'error', message: 'Unknown action: ' + action });
    } catch (error) {
        return jsonResponse({ status: 'error', message: error.toString() });
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
        const date = data[i][0] instanceof Date ? data[i][0].toISOString().split('T')[0] : data[i][0];
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
    // Note: 'products' data is usually read-only via CSV_URL in this app, 
    // but we can record changes to a 'product_updates' sheet or similar.
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
    
    // Clear and Rewrite or Update? Let's Simple update.
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
