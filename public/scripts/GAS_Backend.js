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
        if (action === 'updateOrderDate') return handleUpdateOrderDate(params.orderId || params.id, params.date);
        if (action === 'updateProductField') return handleUpdateProductField(params.no, params.field, params.value);
        if (action === 'saveRepresentative') return handleSaveRepresentative(params.rep);
        if (action === 'deleteRepresentative') return handleDeleteRepresentative(params.repId);
        
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
    const keys = csv.split('\n').slice(1).map(k => k.trim()).filter(k => k);
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
            out.push(p.map(x => {
                const s = String(x || "");
                return (s.includes(',') || s.includes('"')) ? '"' + s.replace(/"/g,'""') + '"' : s;
            }).join(','));
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

function handleUpdateProductField(no, field, value) {
    const mutateFunc = (csvContent) => {
        const rows = csvContent.split('\n');
        if (rows.length < 2) return csvContent;
        
        const headers = rows[0].split(',');
        const idIndex = headers.indexOf('No') > -1 ? headers.indexOf('No') : headers.indexOf('no');
        let fieldIndex = headers.indexOf(field);
        
        // If the column doesn't exist yet, we add it to the header
        if (fieldIndex === -1) {
            rows[0] = rows[0].trim() + ',' + field;
            fieldIndex = headers.length; 
            headers.push(field);
        }
        
        let out = [rows[0]];
        for(let i=1; i<rows.length; i++) {
            if(!rows[i].trim()) continue;
            let p = parseCSVLine(rows[i]);
            
            // Expand row if it doesn't have the new columns yet
            while (p.length < headers.length) {
                p.push('');
            }
            
            if (p[idIndex] == no) {
                p[fieldIndex] = String(value);
            }
            out.push(p.map(x => {
                const s = String(x || "");
                return (s.includes(',') || s.includes('"') || s.includes('\n')) ? '"' + s.replace(/"/g,'""') + '"' : s;
            }).join(','));
        }
        return out.join('\n');
    };
    
    updateGitHubFile('data/products.csv', null, mutateFunc, `Auto-Commit: Updated Product ${no} Field ${field}`);
    return jsonResponse({ status: 'success' });
}

function handleProductSubmit(product) {
    // Left unchanged for now as it handles its own logic, or wrap it
    return handleProductUpdate(product);
}

function handleProductUpdate(product) {
    const no = product['No'] || product['no'];
    if (!no) return jsonResponse({ status: 'error', message: 'Product number (No) is required.' });

    const mutateFunc = (csvContent) => {
        let rows = csvContent.split('\n');
        if (rows.length < 1) return csvContent;
        
        let headers = rows[0].split(',').map(h => h.trim());
        const idIndex = headers.indexOf('No') > -1 ? headers.indexOf('No') : headers.indexOf('no');
        
        // Ensure standard headers exist if missing
        const standardHeaders = ['Product Name','No','category','collection','','target market','Calculate on Weight','Dimensions(mm) x y z','description (80 word)','Price < 25 QTY','Price >=25 QTY','discount cal','Document Link','Discount %','calc','Name on Store','Arabic Name','Available','Hidden','Colors','Image','Gallery','Pinned'];
        
        if (headers.length < 5) {
            headers = standardHeaders;
            rows[0] = headers.join(',');
        } else {
            // Add any missing standard headers to the right
            standardHeaders.forEach(sh => {
                if (!headers.includes(sh)) {
                    headers.push(sh);
                    rows[0] = rows[0].trim() + ',' + sh;
                }
            });
        }

        let rowIndex = -1;
        for(let i=1; i<rows.length; i++) {
            if(!rows[i].trim()) continue;
            let p = parseCSVLine(rows[i]);
            if (p[idIndex] == no) {
                rowIndex = i;
                break;
            }
        }

        let targetP;
        if (rowIndex > -1) {
            targetP = parseCSVLine(rows[rowIndex]);
            while(targetP.length < headers.length) targetP.push('');
        } else {
            targetP = new Array(headers.length).fill('');
            targetP[idIndex] = no;
        }

        // Map incoming product data to headers
        headers.forEach((h, idx) => {
            if (product[h] !== undefined) {
                targetP[idx] = String(product[h]);
            } else if (h === 'Product Name' && product['product name'] !== undefined) {
                targetP[idx] = String(product['product name']);
            }
        });

        const newRowStr = targetP.map(x => {
            const s = String(x || "");
            return (s.includes(',') || s.includes('"') || s.includes('\n')) ? '"' + s.replace(/"/g,'""') + '"' : s;
        }).join(',');

        if (rowIndex > -1) {
            rows[rowIndex] = newRowStr;
        } else {
            rows.push(newRowStr);
        }

        return rows.join('\n');
    };

    updateGitHubFile('data/products.csv', null, mutateFunc, `Auto-Commit: Saved Product ${no}`);
    return jsonResponse({ status: 'success', message: 'Product successfully saved' });
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
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${payload.key}`;
    const options = {
        'method': 'post',
        'contentType': 'application/json',
        'payload': JSON.stringify(payload.data),
        'muteHttpExceptions': true
    };
    const res = UrlFetchApp.fetch(geminiUrl, options);
    return ContentService.createTextOutput(res.getContentText()).setMimeType(ContentService.MimeType.JSON);
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

function handleUpdateOrderDate(orderId, newDate) {
    const mutateFunc = (csvContent) => {
        const rows = csvContent.split('\n');
        const headers = rows[0].split(',');
        const idIndex = headers.indexOf('id');
        const dateIndex = headers.indexOf('date');
        
        let out = [rows[0]];
        for(let i=1; i<rows.length; i++) {
            if(!rows[i].trim()) continue;
            let p = parseCSVLine(rows[i]);
            if (p[idIndex] == orderId) {
                p[dateIndex] = newDate;
            }
            out.push(p.map(x => {
                const s = String(x || "");
                return (s.includes(',') || s.includes('"')) ? '"' + s.replace(/"/g,'""') + '"' : s;
            }).join(','));
        }
        return out.join('\n');
    };
    updateGitHubFile('data/orders.csv', null, mutateFunc, `Auto-Commit: Updated Order Date ${orderId}`);
    return jsonResponse({ status: 'success' });
}

function handleSaveRepresentative(rep) {
    const mutateFunc = (csvContent) => {
        let rows = csvContent ? csvContent.split('\n') : [];
        let headers = [];
        if (rows.length < 2 && !rows[0]) {
             headers = ['id', 'name', 'page_name', 'price_list'];
             rows[0] = headers.join(',');
        } else {
             headers = rows[0].split(',').map(h => h.trim());
        }
        
        // Ensure price_list column exists
        if (!headers.includes('price_list')) {
             headers.push('price_list');
             rows[0] = headers.join(',');
             for(let i=1; i<rows.length; i++) {
                 if(rows[i].trim()) rows[i] += ',{}';
             }
        }
        
        const idIndex = headers.indexOf('id');
        let found = false;
        
        let out = [rows[0]];
        for(let i=1; i<rows.length; i++) {
            if(!rows[i].trim()) continue;
            let p = parseCSVLine(rows[i]);
            
            if (p[idIndex] == rep.id) {
                p = headers.map((h, idx) => {
                    let v = rep[h] !== undefined ? rep[h] : (p[idx] || '');
                    if (typeof v === 'object') v = JSON.stringify(v);
                    let s = String(v);
                    return (s.includes(',') || s.includes('"') || s.includes('\n')) ? '"' + s.replace(/"/g,'""') + '"' : s;
                });
                found = true;
            } else {
                p = p.map(x => {
                    let s = String(x || "");
                    return (s.includes(',') || s.includes('"') || s.includes('\n')) ? '"' + s.replace(/"/g,'""') + '"' : s;
                });
            }
            out.push(p.join(','));
        }
        
        if (!found) {
            let p = headers.map(h => {
                let v = rep[h] || '';
                if (h === 'price_list' && !v) v = '{}';
                if (typeof v === 'object') v = JSON.stringify(v);
                let s = String(v);
                return (s.includes(',') || s.includes('"') || s.includes('\n')) ? '"' + s.replace(/"/g,'""') + '"' : s;
            });
            out.push(p.join(','));
        }
        
        return out.join('\n');
    };
    
    updateGitHubFile('data/representatives.csv', null, mutateFunc, `Auto-Commit: Saved Representative ${rep.id}`);
    return jsonResponse({ status: 'success' });
}

function handleDeleteRepresentative(repId) {
    const mutateFunc = (csvContent) => {
        if (!csvContent) return '';
        const rows = csvContent.split('\n');
        if (rows.length < 2) return csvContent;
        const headers = rows[0].split(',').map(h => h.trim());
        const idIndex = headers.indexOf('id');
        
        let out = [rows[0]];
        for(let i=1; i<rows.length; i++) {
            if(!rows[i].trim()) continue;
            let p = parseCSVLine(rows[i]);
            if (p[idIndex] != repId) {
                out.push(rows[i]);
            }
        }
        return out.join('\n');
    };
    updateGitHubFile('data/representatives.csv', null, mutateFunc, `Auto-Commit: Deleted Representative ${repId}`);
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
