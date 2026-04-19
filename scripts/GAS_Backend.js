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
        if (action === 'deleteProduct') return handleProductDelete(params.no);
        if (action === 'saveWholesale') return handleSaveWholesale(params.offer || params);
        if (action === 'deleteWholesale') return handleDeleteWholesale(params.item_no || params.id);
        if (action === 'proxyGemini') return handleGeminiProxy(params.payload || params);
        if (action === 'uploadImage') return handleImageUpload(params);
        if (action === 'saveSettings') return handleSaveSettings(params.settings || params);
        if (action === 'updateOrderDeliveryToggle') return handleUpdateOrderDeliveryToggle(params.orderId || params.id, params.calculateDelivery);
        if (action === 'updateOrderDate') return handleUpdateOrderDate(params.orderId || params.id, params.date);
        
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
            // Robust Base64 decode to UTF-8
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
            // Use explicit UTF-8 charset for Base64 encoding
            content: Utilities.base64Encode(newContent, Utilities.Charset.UTF_8),
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
    if (res.getResponseCode() === 200) return res.getContentText("UTF-8");
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
        // Robust header cleaning: remove BOM, quotes, and whitespace
        const cleanHeader = (h) => h.replace(/^\ufeff/, '').replace(/"/g, '').trim();
        const headers = rows[0].split(',').map(cleanHeader);
        
        // Map the order object to the CSV's current header alignment
        const rowData = headers.map(header => {
            // Find key in order object by normalized header name
            const normalizedHeader = header.toLowerCase();
            const orderKey = Object.keys(order).find(k => k.toLowerCase() === normalizedHeader) || header;
            
            let val = order[orderKey];
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
        const allRowsData = Utilities.parseCsv(csvContent);
        if (allRowsData.length < 2) return csvContent;
        
        const headers = allRowsData[0].map(h => h.replace(/^\ufeff/, '').replace(/"/g, '').trim());
        const idIndex = headers.indexOf('id');
        const statusIndex = headers.indexOf('status');
        
        if (idIndex === -1 || statusIndex === -1) return csvContent;
        
        for (let i = 1; i < allRowsData.length; i++) {
            if (String(allRowsData[i][idIndex]) == String(orderId)) {
                allRowsData[i][statusIndex] = newStatus;
            }
        }
        
        return allRowsData.map(row => {
            return row.map(x => {
                let s = String(x || '');
                return (s.includes(',') || s.includes('"') || s.includes('\n')) ? '"' + s.replace(/"/g,'""') + '"' : s;
            }).join(',');
        }).join('\n');
    };
    
    updateGitHubFile('data/orders.csv', null, mutateFunc, `Auto-Commit: Updated Order Status ${orderId}`);
    return jsonResponse({ status: 'success' });
}

function handleDeleteOrder(orderId) {
        const allRowsData = Utilities.parseCsv(csvContent);
        if (allRowsData.length < 1) return csvContent;
        const headers = allRowsData[0].map(h => h.replace(/^\ufeff/, '').replace(/"/g, '').trim());
        const idIndex = headers.indexOf('id');
        if (idIndex === -1) return csvContent;

        const filteredRows = allRowsData.filter((row, i) => {
            if (i === 0) return true;
            return String(row[idIndex]) != String(orderId);
        });

        return filteredRows.map(row => {
            return row.map(cell => {
                let s = String(cell || '');
                return (s.includes(',') || s.includes('"') || s.includes('\n')) ? '"' + s.replace(/"/g,'""') + '"' : s;
            }).join(',');
        }).join('\n');
    updateGitHubFile('data/orders.csv', null, mutateFunc, `Auto-Commit: Deleted Order ${orderId}`);
    return jsonResponse({ status: 'success' });
}

function handleUpdateOrderDeliveryToggle(orderId, calculateDeliveryValue) {
    const mutateFunc = (csvContent) => {
        const allRowsData = Utilities.parseCsv(csvContent);
        if (allRowsData.length < 1) return csvContent;
        
        const headers = allRowsData[0].map(h => h.replace(/^\ufeff/, '').replace(/"/g, '').trim());
        const idIndex = headers.indexOf('id');
        let calcDelivIndex = headers.indexOf('calculate_delivery');
        
        // If the column doesn't exist yet, we add it to the header
        if (calcDelivIndex === -1) {
            headers.push('calculate_delivery');
            headers.push('delivery_fee');
            allRowsData[0] = headers;
            calcDelivIndex = headers.length - 2; 
        }
        
        for (let i = 1; i < allRowsData.length; i++) {
            // Expand row if it doesn't have the new columns yet
            while (allRowsData[i].length < headers.length) {
                allRowsData[i].push('');
            }
            
            if (String(allRowsData[i][idIndex]) == String(orderId)) {
                allRowsData[i][calcDelivIndex] = String(calculateDeliveryValue);
            }
        }

        return allRowsData.map(row => {
            return row.map(x => {
                let s = String(x || '');
                return (s.includes(',') || s.includes('"') || s.includes('\n')) ? '"' + s.replace(/"/g,'""') + '"' : s;
            }).join(',');
        }).join('\n');
    };
    
    updateGitHubFile('data/orders.csv', null, mutateFunc, `Auto-Commit: Updated Order Delivery Toggle ${orderId}`);
    return jsonResponse({ status: 'success' });
}

function handleUpdateOrderDate(orderId, newDate) {
    const path = 'data/orders.csv';
    const mutateFunc = (csvContent) => {
        if (!csvContent) return csvContent;
        const allRows = Utilities.parseCsv(csvContent);
        const headers = allRows[0].map(h => h.trim());
        const idIndex = headers.indexOf('id');
        const dateIndex = headers.indexOf('date');
        
        if (idIndex === -1 || dateIndex === -1) return csvContent;

        for (let i = 1; i < allRows.length; i++) {
            if (String(allRows[i][idIndex]).trim() === String(orderId).trim()) {
                allRows[i][dateIndex] = newDate;
                break;
            }
        }

        return allRows.map(row => {
            return row.map(cell => {
                let strVal = String(cell).replace(/"/g, '""');
                if (strVal.includes(',') || strVal.includes('\n') || strVal.includes('"')) return `"${strVal}"`;
                return strVal;
            }).join(',');
        }).join('\n');
    };

    updateGitHubFile(path, null, mutateFunc, `Auto-Commit: Updated Order Date ${orderId}`);
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

function saveImageToGitHub(base64Data, fileName) {
    const GITHUB_TOKEN = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
    if (!GITHUB_TOKEN) throw new Error("GITHUB_TOKEN missing in script properties.");
    
    const path = `public/assets/products/${fileName}`;
    const url = `https://api.github.com/repos/${REPO}/contents/${path}`;
    
    let sha = null;
    const getOptions = {
        'method': 'get',
        'headers': {
            'Authorization': 'token ' + GITHUB_TOKEN,
            'Accept': 'application/vnd.github.v3+json'
        },
        'muteHttpExceptions': true
    };
    
    const getRes = UrlFetchApp.fetch(url, getOptions);
    if (getRes.getResponseCode() === 200) {
        sha = JSON.parse(getRes.getContentText()).sha;
    }
    
    const pureBase64 = (typeof base64Data === 'string') ? base64Data.replace(/^data:[^;]+;base64,/, "") : base64Data;
    
    const payload = {
        message: `Auto-Commit: Upload image ${fileName}`,
        content: pureBase64
    };
    if (sha) payload.sha = sha;
    
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
    
    if (code === 200 || code === 201) {
        return fileName;
    }
    
    throw new Error(`GitHub Upload Failed (${code}): ` + putRes.getContentText());
}

function handleProductUpdate(product) {
    // Intercept image base64 and turn it into a Drive URL
    if (product.image && typeof product.image === 'string' && product.image.length > 500) {
        try {
            const fileName = product.imageName || `${product['No'] || product['no'] || 'image'}.jpg`;
            const fileUrl = saveImageToGitHub(product.image, fileName);
            product.image = fileUrl; // Replace base64 with URL
            product.Image = fileUrl; // Catch both casings
        } catch (e) {
            // Failsafe: if Drive API fails, drop the base64 instead of corrupting the CSV
            product.image = '';
            product.Image = '';
        }
    }

    const path = 'data/products.csv';
    const mutateFunc = (csvContent) => {
        if (!csvContent) return csvContent;
        
        // 1. Parse existing CSV
        const allRows = Utilities.parseCsv(csvContent);
        if (allRows.length === 0) return csvContent;
        const headers = allRows[0].map(h => h.trim());
        
        // 2. Normalize incoming product keys for case-insensitive lookup
        const pNormalized = {};
        for (let k in product) {
            // Remove ALL spaces for normalization to match headerMap logic
            pNormalized[k.toLowerCase().trim().replace(/ /g, "")] = product[k];
        }

        // 3. Build the new row based on CSV headers
        // 3. Build the new row based on CSV headers
        const rowData = headers.map(header => {
            const hLower = header.toLowerCase().trim().replace(/ /g, "");
            
            // Try 1: Exact Match (Case-Sensitive)
            let val = product[header];
            
            // Try 2: Normalized Match (Case-Insensitive, no spaces)
            if (val === undefined || val === '') {
                val = pNormalized[hLower];
            }
            
            // Try 3: Fuzzy / Inconsistency Fallback
            if (val === undefined || val === '') {
                if (hLower.includes('nameonstore')) val = pNormalized['nameonstore'] || pNormalized['store_name'];
                else if (hLower.includes('productname')) val = pNormalized['productname'] || pNormalized['product_name'];
                else if (hLower.includes('arabic')) val = pNormalized['arabicname'] || pNormalized['arabic_name'];
                else if (hLower.includes('description')) val = pNormalized['description(80word)'] || pNormalized['description'] || pNormalized['description(80words)'];
                else if (hLower.includes('price') && hLower.includes('<')) val = pNormalized['price<25qty'] || pNormalized['price'];
                else if (hLower.includes('price') && hLower.includes('>=')) val = pNormalized['price>=25qty'];
                else if (hLower.includes('category')) val = pNormalized['category'];
                else if (hLower.includes('collection')) val = pNormalized['collection'];
                else if (hLower.includes('available')) val = pNormalized['available'] || "TRUE";
                else if (hLower.includes('hidden')) val = pNormalized['hidden'] || "FALSE";
            }

            return (val === undefined || val === null) ? '' : String(val);
        });

        // 4. Update existing or Append new
        const action = product.action || 'addProduct';
        let found = false;
        const noIndex = headers.findIndex(h => h.toLowerCase() === 'no' || h.toLowerCase() === 'sku' || h.toLowerCase() === 'id');
        
        if (action === 'updateProduct' && noIndex !== -1) {
            const targetNo = String(product.No || product.no || "").trim();
            if (targetNo) {
                for (let i = 1; i < allRows.length; i++) {
                    if (String(allRows[i][noIndex]).trim() === targetNo) {
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

        // 5. Reconstruct CSV safely
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

    const res = updateGitHubFile(path, null, mutateFunc, `Auto-Commit: Product ${product.No || product.no}`);
    return jsonResponse({ status: 'success', message: 'Product synced successfully', github_sync: res });
}

function handleProductDelete(no) {
    const path = 'data/products.csv';
    const mutateFunc = (csvContent) => {
        if (!csvContent) return csvContent;
        const allRows = Utilities.parseCsv(csvContent);
        if (allRows.length === 0) return csvContent;
        const headers = allRows[0].map(h => h.trim());
        const noIndex = headers.findIndex(h => h.toLowerCase() === 'no' || h.toLowerCase() === 'sku');
        if (noIndex === -1) return csvContent;

        const filteredRows = allRows.filter((row, i) => {
            if (i === 0) return true; // Keep Header
            return String(row[noIndex]).trim() !== String(no).trim();
        });

        return filteredRows.map(row => {
            return row.map(cell => {
                let strVal = String(cell).replace(/"/g, '""');
                if (strVal.includes(',') || strVal.includes('\n') || strVal.includes('"')) return `"${strVal}"`;
                return strVal;
            }).join(',');
        }).join('\n');
    };

    updateGitHubFile(path, null, mutateFunc, `Auto-Commit: Deleted Product #${no}`);
    return jsonResponse({ status: 'success' });
}

function handleSaveWholesale(offer) {
    const path = 'data/wholesale.csv';
    const mutateFunc = (csvContent) => {
        // If file doesn't exist or is empty, start with headers
        let content = csvContent || "item_no,special_price,category";
        const allRows = Utilities.parseCsv(content);
        const headers = allRows[0].map(h => h.trim());
        const noIndex = headers.indexOf('item_no');
        
        const rowData = headers.map(h => {
            if (h === 'item_no') return String(offer.item_no);
            if (h === 'special_price') return String(offer.special_price);
            if (h === 'category') return String(offer.category || '');
            return '';
        });

        let found = false;
        if (noIndex !== -1) {
            for (let i = 1; i < allRows.length; i++) {
                if (String(allRows[i][noIndex]).trim() === String(offer.item_no).trim()) {
                    allRows[i] = rowData;
                    found = true;
                    break;
                }
            }
        }

        if (!found) allRows.push(rowData);

        return allRows.map(row => {
            return row.map(cell => {
                let strVal = String(cell).replace(/"/g, '""');
                if (strVal.includes(',') || strVal.includes('\n') || strVal.includes('"')) return `"${strVal}"`;
                return strVal;
            }).join(',');
        }).join('\n');
    };

    updateGitHubFile(path, null, mutateFunc, `Auto-Commit: Wholesale Item #${offer.item_no}`);
    return jsonResponse({ status: 'success' });
}

function handleDeleteWholesale(itemNo) {
    const path = 'data/wholesale.csv';
    const mutateFunc = (csvContent) => {
        if (!csvContent) return csvContent;
        const allRows = Utilities.parseCsv(csvContent);
        const headers = allRows[0].map(h => h.trim());
        const noIndex = headers.indexOf('item_no');
        
        if (noIndex === -1) return csvContent;

        const outRows = [allRows[0]];
        for (let i = 1; i < allRows.length; i++) {
            if (String(allRows[i][noIndex]).trim() !== String(itemNo).trim()) {
                outRows.push(allRows[i]);
            }
        }

        return outRows.map(row => {
            return row.map(cell => {
                let strVal = String(cell).replace(/"/g, '""');
                if (strVal.includes(',') || strVal.includes('\n') || strVal.includes('"')) return `"${strVal}"`;
                return strVal;
            }).join(',');
        }).join('\n');
    };

    updateGitHubFile(path, null, mutateFunc, `Auto-Commit: Removed Wholesale Item #${itemNo}`);
    return jsonResponse({ status: 'success' });
}

function handleImageUpload(params) {
    try {
        const fileName = params.imageName || params.filename || `extra_${Date.now()}.jpg`;
        const imageData = params.image || params.data;
        
        if (!imageData) throw new Error("No image data provided");
        
        const fileUrl = saveImageToGitHub(imageData, fileName);
        return jsonResponse({ status: 'success', id: fileName, url: fileName });
    } catch(e) {
        return jsonResponse({ status: 'error', message: 'GitHub upload failed. ' + e.toString() });
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
