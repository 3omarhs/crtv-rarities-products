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
            
            // New: Get logs from 'visit_logs' sheet
            let dailyLogs = {};
            try {
                const logSheet = ss.getSheetByName('visit_logs');
                if (logSheet) {
                    const logData = logSheet.getDataRange().getValues();
                    logData.slice(1).forEach(row => {
                        const date = row[0] instanceof Date ? row[0].toISOString().split('T')[0] : String(row[0]);
                        const device = String(row[1]);
                        if (!dailyLogs[date]) dailyLogs[date] = [];
                        dailyLogs[date].push(device);
                    });
                }
            } catch(e) {}

            const today = params.date || new Date().toISOString().split('T')[0];
            return jsonResponse({ total: total, daily: daily, today: daily[today] || 0, dailyLogs: dailyLogs });
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
            return handleVisit(params);
        } else if (action === 'addProduct' || action === 'updateProduct') {
            return handleProductUpdate(params.product || params);
        } else if (action === 'saveSettings') {
            return handleSaveSettings(params.settings || params);
        } else if (action === 'migrateData') {
            return handleMigration(params.data || params);
        } else if (action === 'proxyGemini') {
            return handleGeminiProxy(params.payload || params);
        } else if (action === 'uploadImage') {
            return handleImageUpload(params);
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

function handleVisit(params) {
    const deviceName = params.deviceName || 'Unknown';
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName('visits');
    if (!sheet) return jsonResponse({ status: 'error', message: 'Visits sheet not found' });

    const today = params.date || new Date().toISOString().split('T')[0];
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

    // Log the device in 'visit_logs' sheet
    let logSheet = ss.getSheetByName('visit_logs');
    if (!logSheet) {
        logSheet = ss.insertSheet('visit_logs');
        logSheet.appendRow(['Date', 'Device Name', 'Timestamp']);
    }
    logSheet.appendRow([today, deviceName, new Date().toISOString()]);

    return jsonResponse({ status: 'success', message: 'Visit recorded' });
}

function handleProductUpdate(product) {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const GID = '897526080'; // The storefront sheet GID
    
    // 1. Find the correct sheet by GID
    let sheet = ss.getSheets().find(s => s.getSheetId().toString() === GID);
    if (!sheet) {
        sheet = ss.getSheetByName('products') || ss.getSheetByName('Products');
    }
    
    if (!sheet) return jsonResponse({ status: 'error', message: 'Storefront sheet not found (GID: ' + GID + ')' });

    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const noIndex = headers.findIndex(h => h.toLowerCase().trim() === 'item_no' || h.toLowerCase().trim() === 'no');
    
    if (noIndex === -1) return jsonResponse({ status: 'error', message: 'Column "item_no" or "No" not found in sheet' });

    const data = sheet.getDataRange().getValues();
    let rowIndex = -1;

    // 2. Find existing row if updating
    if (product.No || product.item_no) {
        const productNo = String(product.No || product.item_no).trim();
        for (let i = 1; i < data.length; i++) {
            if (String(data[i][noIndex]).trim() === productNo) {
                rowIndex = i + 1;
                break;
            }
        }
    }

    // --- NEW: Save Image to Google Drive for Instant Access ---
    if (product.image && (product.image.length > 1000 || product.imageName)) {
        try {
            const driveId = saveImageToDrive(product.image, product.imageName || (product.No + ".jpg"));
            if (driveId) {
                product.Image = driveId; // Store purely the ID for consistency
            }
        } catch (err) {
            console.error("Drive saving failed:", err);
        }
    }

    // 3. Prepare row data based on headers
    // Robust mapping for CSV headers (snake_case) and Frontend headers (Title Case)
    const rowData = headers.map(h => {
        const normH = h.toLowerCase().replace(/[^a-z0-9]/g, '');
        // Try exact match, then normalized match
        let val = product[h];
        if (val === undefined) {
             const key = Object.keys(product).find(k => k.toLowerCase().replace(/[^a-z0-9]/g, '') === normH);
             val = key ? product[key] : '';
        }
        return val;
    });

    // --- CRITICAL FALLBACK ---
    // --- CRITICAL FALLBACK ---
    // Prevent "No products found" bug: If 'Product Name' is empty, fall back to 'Name on Store'
    const productNameIdx = headers.findIndex(h => String(h).trim().toLowerCase() === 'product name');
    const nameOnStoreIdx = headers.findIndex(h => String(h).trim().toLowerCase() === 'name on store');
    
    if (productNameIdx !== -1 && nameOnStoreIdx !== -1) {
        if (!rowData[productNameIdx] || String(rowData[productNameIdx]).trim() === '') {
            rowData[productNameIdx] = rowData[nameOnStoreIdx] || 'Unknown Product';
        }
    }

    // 4. Update or Append
    try {
        if (rowIndex > 0) {
            sheet.getRange(rowIndex, 1, 1, rowData.length).setValues([rowData]);
        } else {
            sheet.appendRow(rowData);
        }
        
        // --- NEW: Sync Product row AGAIN to reflect 'Image' if it was just added ---
        // (handleProductUpdate already adds to sheet, but syncProductToGitHub needs the latest)
        
        // 5. Trigger GitHub Sync (CSV + Image if provided)
        const syncResult = syncProductToGitHub(sheet, product);
        
        return jsonResponse({ 
            status: rowIndex > 0 ? 'success' : 'success', 
            message: rowIndex > 0 ? 'Product updated' : 'Product added',
            github_sync: syncResult 
        });
    } catch (e) {
        return jsonResponse({ status: 'error', message: 'Spreadsheet Error: ' + e.toString() });
    }
}

function handleImageUpload(params) {
    if (!params.image || !params.imageName) {
        return jsonResponse({ status: 'error', message: 'Missing image data or imageName' });
    }

    const REPO = "3omarhs/crtv-rarities-products";
    const imagePath = "public/assets/products/" + params.imageName;

    try {
        // 1. Save to Google Drive for Instant Access First
        let driveId = null;
        try {
            driveId = saveImageToDrive(params.image, params.imageName);
        } catch (e) {
            console.error("Gallery Drive save failed:", e);
        }

        // 2. Update Spreadsheet Mapping if possible
        // Expected format: SKU_INDEX.ext (e.g. ABC-123_1.jpg)
        const nameParts = params.imageName.split('_');
        if (nameParts.length > 1 && driveId) {
            const sku = nameParts[0];
            const indexPart = nameParts[1].split('.')[0];
            const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
            const sheet = ss.getSheets().find(s => s.getSheetId().toString() === '897526080') || ss.getSheets()[0];
            const data = sheet.getDataRange().getValues();
            const headers = data[0];
            const noIdx = headers.findIndex(h => h.toLowerCase().trim() === 'item_no' || h.toLowerCase().trim() === 'no');
            const galleryIdx = headers.findIndex(h => h.toLowerCase().trim() === 'gallery');

            if (noIdx !== -1 && galleryIdx !== -1) {
                for (let i = 1; i < data.length; i++) {
                    if (String(data[i][noIdx]).trim() === sku) {
                        let galleryData = {};
                        try {
                            const raw = String(data[i][galleryIdx]).trim();
                            if (raw.startsWith('{')) galleryData = JSON.parse(raw);
                        } catch (e) {}
                        
                        galleryData[indexPart] = driveId;
                        sheet.getRange(i + 1, galleryIdx + 1).setValue(JSON.stringify(galleryData));
                        
                        // Sync the updated CSV to GitHub
                        syncProductToGitHub(sheet, { No: sku });
                        break;
                    }
                }
            }
        }

        // 3. Commit to GitHub as per standard path
        const imgRes = commitToGitHub(REPO, imagePath, params.image, "Upload extra gallery image", true);
        
        return jsonResponse({ 
            status: 'success', 
            message: 'Uploaded to Drive & GitHub',
            driveId: driveId,
            github: imgRes.status
        });
    } catch (e) {
        return jsonResponse({ status: 'error', message: e.toString() });
    }
}

/**
 * Syncs the spreadsheet to CSV and uploads image to GitHub
 */
function syncProductToGitHub(sheet, product) {
    const GITHUB_TOKEN = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
    if (!GITHUB_TOKEN) return { status: 'warning', message: 'GITHUB_TOKEN missing in script properties' };

    const REPO = "3omarhs/crtv-rarities-products";
    const CSV_PATH = "data/products.csv";
    const results = [];

    try {
        // 1. Sync CSV - ONLY export the 19 known valid columns (prevents corruption if sheet has extra columns)
        const VALID_COLUMNS = [
            'Product Name', 'No', 'category', 'collection', 'target market',
            'Calculate on Weight', 'Dimensions(mm) x y z', 'description (80 word)',
            'Price < 25 QTY', 'Price >=25 QTY', 'discount cal', 'Document Link',
            'Discount %', 'calc', 'Name on Store', 'Arabic Name', 'Available', 'Hidden', 'Colors', 'Image', 'Gallery'
        ];
        
        const data = sheet.getDataRange().getValues();
        const sheetHeaders = data[0];
        
        // Map valid column names to their indices in the sheet (case-insensitive)
        const validIndices = VALID_COLUMNS.map(col => 
            sheetHeaders.findIndex(h => String(h).trim().toLowerCase() === col.toLowerCase())
        );
        
        // Get the indexes of Product Name and Name on Store from the valid columns 
        const productNameColIdx = VALID_COLUMNS.indexOf('Product Name');
        const nameOnStoreColIdx = VALID_COLUMNS.indexOf('Name on Store');

        const csvContent = data.map((row, rowIdx) => {
            if (rowIdx === 0) {
                // Write header row using the canonical column names
                return VALID_COLUMNS.join(',');
            }
            return validIndices.map((sheetIdx, csvColIdx) => {
                let cell = sheetIdx >= 0 ? row[sheetIdx] : '';
                
                // Fallback: If this is the Product Name column and it's empty, use Name on Store
                if (csvColIdx === productNameColIdx && (!cell || String(cell).trim() === '')) {
                    const mappedNameOnStoreIdx = validIndices[nameOnStoreColIdx];
                    cell = mappedNameOnStoreIdx >= 0 ? row[mappedNameOnStoreIdx] : '';
                    if (!cell || String(cell).trim() === '') cell = 'Unknown Product';
                }

                let val = String(cell === null || cell === undefined ? '' : cell);
                if (val.includes(',') || val.includes('"') || val.includes('\n')) {
                    return '"' + val.replace(/"/g, '""') + '"';
                }
                return val;
            }).join(',');
        }).join('\n');
        
        const csvRes = commitToGitHub(REPO, CSV_PATH, csvContent, "Sync products.csv from GAS", false);
        results.push({ file: 'CSV', status: csvRes.status });

        // 2. Sync Image (if provided as base64)
        if (product.image && product.imageName) {
            const imagePath = "public/assets/products/" + product.imageName;
            const imgRes = commitToGitHub(REPO, imagePath, product.image, "Upload product image from GAS", true);
            results.push({ file: 'Image', status: imgRes.status });
        }

        return { status: 'success', details: results };
    } catch (e) {
        return { status: 'error', message: e.toString() };
    }
}

function commitToGitHub(repo, path, content, message, isBase64) {
    const GITHUB_TOKEN = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
    const url = `https://api.github.com/repos/${repo}/contents/${path}`;
    
    // 1. Check for existing file SHA
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

    // 2. Commit
    const payload = {
        'message': message,
        'content': isBase64 ? content : Utilities.base64Encode(content, Utilities.Charset.UTF_8),
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
    const code = commitRes.getResponseCode();
    
    return { 
        status: (code === 200 || code === 201) ? 'success' : 'error',
        code: code
    };
}

/**
 * Saves a base64 image to a public Google Drive folder
 */
function saveImageToDrive(base64Data, fileName) {
  const FOLDER_NAME = "Storefront Images";
  let folder;
  const folders = DriveApp.getFoldersByName(FOLDER_NAME);
  
  if (folders.hasNext()) {
    folder = folders.next();
  } else {
    folder = DriveApp.createFolder(FOLDER_NAME);
    folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  }
  
  // Remove data URL prefix if exists
  const contentType = base64Data.match(/^data:([^;]+);base64,/);
  const pureBase64 = base64Data.replace(/^data:[^;]+;base64,/, "");
  const blob = Utilities.newBlob(Utilities.base64Decode(pureBase64), contentType ? contentType[1] : "image/jpeg", fileName);
  
  // Clean up old file with same name if exists to avoid duplicates
  const existingFiles = folder.getFilesByName(fileName);
  while (existingFiles.hasNext()) {
    existingFiles.next().setTrashed(true);
  }
  
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  
  return file.getId();
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
