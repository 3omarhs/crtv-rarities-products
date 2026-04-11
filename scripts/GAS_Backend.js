/**
 * CREATIVE RARITIES - GOOGLE APPS SCRIPT BACKEND V5.0 (All-CSV Git Architecture)
 * 
 * INSTRUCTIONS:
 * 1. Go to your Google Apps Script.
 * 2. Delete ALL existing code and paste this.
 * 3. Ensure 'GITHUB_TOKEN' is set in Project Settings > Script Properties.
 * 4. Click Deploy > New deployment (Web app).
 */

const REPO = '3omarhs/crtv-rarities-products';

function doGet(e) { return handleAllActions(e.parameter.action, e.parameter); }
function doPost(e) {
    try {
        const data = JSON.parse(e.postData.contents);
        return handleAllActions(data.action, data);
    } catch (err) { return jsonResponse({ status: 'error', message: err.toString() }); }
}

function handleAllActions(action, params) {
    try {
        if (action === 'getGeminiKeys') return handleGetGeminiKeys();
        
        if (action === 'placeOrder' || action === 'addOrder') return handleNewOrder(params.order || params);
        if (action === 'deleteOrder') return handleDeleteOrder(params.orderId || params.id);
        if (action === 'updateOrderStatus') return handleUpdateOrderStatus(params.orderId || params.id, params.status);
        if (action === 'recordVisit') return handleVisit(params);
        if (action === 'addProduct' || action === 'updateProduct') return handleProductUpdate(params.product || params);
        if (action === 'proxyGemini') return handleGeminiProxy(params.payload || params);
        if (action === 'uploadImage') return handleImageUpload(params);
        if (action === 'saveSettings') return handleSaveSettings(params.settings || params);
        if (action === 'updateOrderDeliveryToggle') return handleUpdateOrderDeliveryToggle(params.orderId || params.id, params.calculateDelivery);
        
        return jsonResponse({ error: 'Invalid action: ' + action });
    } catch (err) {
        return jsonResponse({ error: err.toString() });
    }
}

// ==============================================
// GITHUB API WRAPPER
// ==============================================

function updateGitHubFile(path, appendContentStr, mutateFunc, message) {
    const GITHUB_TOKEN = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
    if (!GITHUB_TOKEN) throw new Error("GITHUB_TOKEN missing in script properties.");
    
    const url = `https://api.github.com/repos/${REPO}/contents/${path}`;
    const getOptions = {
        'method': 'get',
        'headers': {
            'Authorization': 'token ' + GITHUB_TOKEN,
            'Accept': 'application/vnd.github.v3+json'
        },
        'muteHttpExceptions': true
    };
    
    let maxRetries = 3;
    let attempt = 0;
    let lastError = null;

    while (attempt < maxRetries) {
        attempt++;
        const res = UrlFetchApp.fetch(url, getOptions);
        let sha = null;
        let originalContent = '';
        
        if (res.getResponseCode() === 200) {
            const json = JSON.parse(res.getContentText());
            sha = json.sha;
            const decodedBytes = Utilities.base64Decode(json.content);
            originalContent = Utilities.newBlob(decodedBytes).getDataAsString("UTF-8");
        } else if (res.getResponseCode() !== 404) {
            throw new Error(`Failed to fetch ${path}: ` + res.getContentText());
        }
        
        let newContent = originalContent;
        if (appendContentStr) {
            if (newContent && !newContent.endsWith('\n')) newContent += '\n';
            newContent += appendContentStr;
        } else if (mutateFunc) {
            newContent = mutateFunc(originalContent);
        }
        
        const payload = {
            message: message,
            content: Utilities.base64Encode(Utilities.newBlob(newContent, "UTF-8").getBytes()),
            sha: sha
        };
        
        const putOptions = {
            'method': 'put',
            'headers': {
                'Authorization': 'token ' + GITHUB_TOKEN,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json'
            },
            'payload': JSON.stringify(payload),
            'muteHttpExceptions': true
        };
        
        const putRes = UrlFetchApp.fetch(url, putOptions);
        const code = putRes.getResponseCode();
        
        if (code === 200 || code === 201) return JSON.parse(putRes.getContentText());
        
        if (code === 409) {
            // Conflict - someone else updated the file first. Wait briefly and retry.
            lastError = `Conflict (409) on attempt ${attempt}`;
            Utilities.sleep(Math.random() * 500 + 200); 
            continue;
        }
        
        throw new Error(`GitHub Commit Failed (${code}): ` + putRes.getContentText());
    }
    
    throw new Error(`Exceeded max retries for ${path}. Last Error: ${lastError}`);
}

function fetchRawGitHubCSV(path) {
    const GITHUB_TOKEN = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
    const url = `https://raw.githubusercontent.com/${REPO}/main/${path}?v=${Date.now()}`;
    const headers = GITHUB_TOKEN ? { 'Authorization': 'token ' + GITHUB_TOKEN } : {};
    const res = UrlFetchApp.fetch(url, { headers: headers, muteHttpExceptions: true });
    if (res.getResponseCode() === 200) return res.getContentText();
    return "";
}

// ==============================================
// HANDLERS
// ==============================================

function handleGetGeminiKeys(filePath) {
    const csv = fetchRawGitHubCSV(filePath || 'data/gemini_keys.csv');
    if (!csv || csv.includes('404')) return jsonResponse({ keys: [] });
    const rows = csv.split('\n').slice(1); // Skip header row
    const keys = rows
        .map(row => row.trim())
        .filter(row => row.length > 0)
        .map(row => {
            // CSV row format is: name,key  — extract only the key part
            const parts = row.split(',');
            return parts.length >= 2 ? parts.slice(1).join(',').trim() : parts[0].trim();
        })
        .filter(key => key.length > 0);
    return jsonResponse({ keys: keys });
}

function handleNewOrder(order) {
    const mutateFunc = (csvContent) => {
        const rows = csvContent.split('\n');
        const headers = rows[0].split(',').map(h => h.trim());
        
        // Map the order object to the CSV's current header alignment
        const rowData = headers.map(header => {
            let val = order[header];
            if (header === 'items' && Array.isArray(val)) val = val.join(' | ');
            if (header === 'date' && !val) val = new Date().toISOString();
            if (header === 'timestamp' && !val) val = Date.now().toString();
            if (header === 'status' && !val) val = "Open";
            if (val === undefined || val === null) val = "";
            
            let strVal = String(val).replace(/"/g, '""');
            if (strVal.includes(',') || strVal.includes('\n') || strVal.includes('"')) {
                strVal = `"${strVal}"`;
            }
            return strVal;
        }).join(',');
        
        // Append the new row to the end
        return csvContent.trim() + '\n' + rowData;
    };

    const res = updateGitHubFile('data/orders.csv', null, mutateFunc, `Auto-Commit: New Order ${order.id}`);
    return jsonResponse({ status: 'success', message: 'Order recorded securely to GitHub CSV', github_sync: res });
}

function handleUpdateOrderStatus(orderId, newStatus) {
    const mutateFunc = (csvContent) => {
        const rows = csvContent.split('\n');
        if (rows.length < 2) return csvContent; // Empty or just headers
        
        const headers = rows[0].split(',');
        const idIndex = headers.indexOf('id');
        const statusIndex = headers.indexOf('status');
        
        if (idIndex === -1 || statusIndex === -1) return csvContent;
        
        for (let i = 1; i < rows.length; i++) {
            if (!rows[i]) continue;
            // Simple split (not aware of quotes, but IDs and Status shouldn't have quotes)
            const cols = rows[i].match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || [];
            // Use split safely by mapping
            let parts = rows[i].split(',');
            // Realistically we can just replace the string. 
            // Since id is first or explicitly defined, we can isolate the row.
            if (rows[i].includes(orderId)) {
                // To safely update status: Wait, we should use a proper CSV replacer but simple hack:
                // Find index of status column and rebuild the row if safely split
            }
        }
        
        // Safer mutate for simple CSV: Use regex to replace exact row based on ID matching start
        const idEscaped = orderId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const rowRegex = new RegExp(`^([^,]*,)*?(${idEscaped})(,.*)$`, 'm');
        // Actually this is brittle if ID appears elsewhere. We will use proper parsing.
        
        let out = [rows[0]];
        for(let i=1; i<rows.length; i++) {
            if(!rows[i].trim()) continue;
            let p = parseCSVLine(rows[i]);
            if (p[idIndex] == orderId) {
                p[statusIndex] = newStatus;
            }
            out.push(p.map(x => (x.includes(',') || x.includes('"')) ? '"' + x.replace(/"/g,'""') + '"' : x).join(','));
        }
        return out.join('\n');
    };
    
    updateGitHubFile('data/orders.csv', null, mutateFunc, `Auto-Commit: Updated Order Status ${orderId}`);
    return jsonResponse({ status: 'success' });
}

function handleDeleteOrder(orderId) {
    const mutateFunc = (csvContent) => {
        const rows = csvContent.split('\n');
        const headers = rows[0].split(',');
        const idIndex = headers.indexOf('id');
        let out = [rows[0]];
        for(let i=1; i<rows.length; i++) {
            if(!rows[i].trim()) continue;
            let p = parseCSVLine(rows[i]);
            if (p[idIndex] != orderId) {
                out.push(rows[i]); // Keep original formatting
            }
        }
        return out.join('\n');
    };
    updateGitHubFile('data/orders.csv', null, mutateFunc, `Auto-Commit: Deleted Order ${orderId}`);
    return jsonResponse({ status: 'success' });
}

function handleUpdateOrderDeliveryToggle(orderId, calculateDeliveryValue) {
    const mutateFunc = (csvContent) => {
        const rows = csvContent.split('\n');
        if (rows.length < 2) return csvContent;
        
        const headers = rows[0].split(',');
        const idIndex = headers.indexOf('id');
        let calcDelivIndex = headers.indexOf('calculate_delivery');
        
        // If the column doesn't exist yet, we add it to the header
        if (calcDelivIndex === -1) {
            rows[0] = rows[0].trim() + ',calculate_delivery,delivery_fee';
            calcDelivIndex = headers.length; 
            headers.push('calculate_delivery');
            headers.push('delivery_fee');
        }
        
        let out = [rows[0]];
        for(let i=1; i<rows.length; i++) {
            if(!rows[i].trim()) continue;
            let p = parseCSVLine(rows[i]);
            
            // Expand row if it doesn't have the new columns yet
            while (p.length < headers.length) {
                p.push('');
            }
            
            if (p[idIndex] == orderId) {
                p[calcDelivIndex] = String(calculateDeliveryValue);
            }
            out.push(p.map(x => (String(x).includes(',') || String(x).includes('"')) ? '"' + String(x).replace(/"/g,'""') + '"' : x).join(','));
        }
        return out.join('\n');
    };
    
    updateGitHubFile('data/orders.csv', null, mutateFunc, `Auto-Commit: Updated Order Delivery Toggle ${orderId}`);
    return jsonResponse({ status: 'success' });
}

function handleVisit(params) {
    const todayStr = params.date || new Date().toISOString().split('T')[0];
    const device = params.deviceName || params.device;
    
    if (device) {
        const row = `${todayStr},${String(device).replace(/,/g, '')},${Date.now()}`;
        updateGitHubFile('data/visit_logs.csv', row, null, `Tracking: New Visit`);
    }
    
    // Increment daily count in visits.csv safely
    const mutateVisits = (csvContent) => {
        const rows = csvContent.split('\n');
        let found = false;
        let out = [rows[0]];
        for(let i=1; i<rows.length; i++) {
            if(!rows[i].trim()) continue;
            let p = rows[i].split(',');
            if (p[0] === todayStr) {
                p[1] = String(Number(p[1] || 0) + 1);
                found = true;
            }
            out.push(p.join(','));
        }
        if (!found) out.push(`${todayStr},1`);
        return out.join('\n');
    };
    
    updateGitHubFile('data/visits.csv', null, mutateVisits, `Tracking: Increment Visit Metric`);
    return jsonResponse({ status: 'success' });
}

function handleProductUpdate(product) {
    const path = 'data/products.csv';
    const mutateFunc = (csvContent) => {
        if (!csvContent) return csvContent;
        
        // Use Google's native CSV parser
        const allRows = Utilities.parseCsv(csvContent);
        if (allRows.length === 0) return csvContent;
        
        const headers = allRows[0].map(h => h.trim());
        
        const rowData = headers.map(header => {
            const hLower = header.toLowerCase();
            
            // Match Priority: Exact > Lowercase > Fuzzy/Inconsistency
            let val = product[header];
            if (val === undefined || val === '') val = product[hLower];
            
            if (val === undefined || val === '') {
                if (hLower.includes('name on store')) val = product['Name on Store'] || product['store_name'];
                else if (hLower.includes('product name')) val = product['Product Name'] || product['product name'];
                else if (hLower.includes('arabic')) val = product['Arabic Name'] || product['arabic_name'];
                else if (hLower.includes('description')) val = product['description (80 word)'] || product['Description'] || product['description'];
                else if (hLower.includes('price') && hLower.includes('<')) val = product['Price < 25 QTY'] || product['price_low_qty'];
                else if (hLower.includes('price') && hLower.includes('>=')) val = product['Price >=25 QTY'] || product['price_high_qty'];
                else if (hLower.includes('colors')) val = product['Colors'] || product['color'];
                else if (hLower.includes('dimensions')) val = product['Dimensions(mm) x y z'] || product['dimensions'];
                else if (hLower.includes('target market')) val = product['target market'] || product['target_market'];
                else if (hLower.includes('available')) val = product['Available'] || "TRUE";
                else if (hLower.includes('hidden')) val = product['Hidden'] || "FALSE";
            }

            return val === undefined || val === null ? '' : String(val);
        });

        const action = product.action || 'addProduct';
        let found = false;
        const noIndex = headers.findIndex(h => h.toLowerCase() === 'no');
        
        if (action === 'updateProduct' && noIndex !== -1) {
            const targetNo = String(product.No || product.no || "");
            if (targetNo) {
                for (let i = 1; i < allRows.length; i++) {
                    if (String(allRows[i][noIndex]) === targetNo) {
                        allRows[i] = rowData;
                        found = true;
                        break;
                    }
                }
            }
        }

        if (!found) {
            allRows.push(rowData);
        }

        return allRows.map(row => {
            return row.map(cell => {
                let strVal = String(cell).replace(/"/g, '""');
                if (strVal.includes(',') || strVal.includes('\n') || strVal.includes('"')) {
                    return `"${strVal}"`;
                }
                return strVal;
            }).join(',');
        }).join('\n');
    };

    const res = updateGitHubFile(path, null, mutateFunc, `Auto-Commit: Product ${product.action || 'update'} ${product.No || product.no}`);
    return jsonResponse({ status: 'success', message: 'Product updated and synced to GitHub', github_sync: res });
}

function handleImageUpload(params) {
    // If you need direct GitHub upload, Utilities.base64Decode and commitToGitHub equivalent
    // The previous implementation used DriveApp. That is the ONLY non-GitHub feature left.
    // If the user uploads images, they MUST be stored in Drive because GitHub is bad for massive image hosting.
    // NOTE: Keep DriveApp ONLY for images, it does not touch Spreadsheet.
    const folderId = "1O3f31835A1OQd1wQd66_I3Owhs6fenFc4UlbwPU"; // Placeholder
    try {
        const folder = DriveApp.getFolderById(folderId);
        const blob = Utilities.newBlob(Utilities.base64Decode(params.data), params.mimeType, params.filename);
        const file = folder.createFile(blob);
        file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        
        // Ensure products_extra_images.json is updated?
        // Wait, app.js logic does this.
        return jsonResponse({ status: 'success', id: file.getId(), url: file.getUrl() });
    } catch(e) {
        return jsonResponse({ status: 'error', message: 'Drive Folder unavailable or not set. ' + e.toString() });
    }
}

function handleGeminiProxy(payload) {
    if (!payload) return ContentService.createTextOutput(JSON.stringify({ error: "Missing payload" })).setMimeType(ContentService.MimeType.JSON);
    
    // Prefer the key stored securely in Script Properties over the client-provided one
    const storedKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
    const rawApiKey = storedKey || payload.key;
    
    if (!rawApiKey) {
        return ContentService.createTextOutput(JSON.stringify({ error: 'No Gemini API key available.' })).setMimeType(ContentService.MimeType.JSON);
    }
    
    const apiKey = rawApiKey.trim();
    const modelInput = (payload.model || 'gemini-1.5-flash').trim();
    // Normalize model name: remove 'models/' prefix if it's already there to avoid 'models/models/'
    const modelBase = modelInput.replace(/^models\//, '');
    
    const versions = ['v1beta', 'v1'];
    let lastError = "";

    for (const version of versions) {
        // Try multiple model identifier variations to bypass regional/version naming inconsistencies
        const modelVariants = [
            `models/${modelBase}`, 
            `models/${modelBase}-latest`,
            `models/${modelBase}-001`,
            `models/${modelBase}-002`,
            modelBase
        ];
        
        for (const modelName of modelVariants) {
            try {
                const geminiUrl = `https://generativelanguage.googleapis.com/${version}/${modelName}:generateContent?key=${apiKey}`;
                const options = {
                    'method': 'post',
                    'contentType': 'application/json',
                    'payload': JSON.stringify(payload.data),
                    'muteHttpExceptions': true
                };
                
                const res = UrlFetchApp.fetch(geminiUrl, options);
                const status = res.getResponseCode();
                const text = res.getContentText();
                
                if (status === 200) {
                    const parsed = JSON.parse(text);
                    parsed.gasVersion = '5.2.0'; // Track backend version
                    return ContentService.createTextOutput(JSON.stringify(parsed)).setMimeType(ContentService.MimeType.JSON);
                } else {
                    lastError = text;
                    // If it's a 404, try the next variant/version
                    if (status === 404) continue;
                    // For 429 (Quota) or 400 (Invalid Key), return immediately as it's not a model/version issue
                    // Wrap error in a JSON object so gasVersion can be added if needed, though usually just returns the error
                    return ContentService.createTextOutput(text).setMimeType(ContentService.MimeType.JSON);
                }
            } catch (e) {
                lastError = e.toString();
            }
        }
    }

    // If we're here, everything failed (likely all 404s or network errors)
    return ContentService.createTextOutput(lastError || JSON.stringify({ error: "All proxy combinations failed" })).setMimeType(ContentService.MimeType.JSON);
}

function handleSaveSettings(settings) {
    const mutateFunc = (csv) => {
        let rows = csv.split('\n');
        let dict = {};
        for(let i=1; i<rows.length; i++) {
            if(!rows[i].trim()) continue;
            let parts = rows[i].split(',');
            dict[parts[0]] = parts.slice(1).join(',');
        }
        for(let k in settings) dict[k] = settings[k];
        
        let out = [rows[0] || 'key,value'];
        for(let k in dict) out.push(`${k},${dict[k]}`);
        return out.join('\n');
    };
    updateGitHubFile('data/settings.csv', null, mutateFunc, "Auto-Commit: Settings Update");
    return jsonResponse({ status: 'success' });
}

// ------------------------------------
// UTILS
// ------------------------------------
function jsonResponse(data) {
    return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

function parseCSVLine(text) {
    let ret = [], val = '', inQuote = false;
    for (let c of text) {
        if (c === '"') {
            inQuote = !inQuote;
        } else if (c === ',' && !inQuote) {
            ret.push(val); val = '';
        } else {
            val += c;
        }
    }
    ret.push(val);
    return ret;
}
