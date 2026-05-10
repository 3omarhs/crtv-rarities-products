const APP_VERSION = '5.3.5';
console.log(`!!! ADMIN JS V${APP_VERSION} LOADED (DYNAMIC) !!!`);
document.title = `Admin Portal (v${APP_VERSION})`;

function updateDynamicVersion() {
    console.log(`Admin: Syncing dynamic version v${APP_VERSION} to UI...`);
    const elements = document.querySelectorAll('.dynamic-version-val');
    elements.forEach(el => {
        el.textContent = `v${APP_VERSION}`;
    });

    const footerDisplay = document.getElementById('footer-version-display');
    if (footerDisplay) {
        footerDisplay.innerHTML = `v${APP_VERSION} (DYNAMIC) | <span style="color:var(--accent); cursor:pointer;" onclick="location.reload(true)">Force Hard Refresh</span>`;
    }
}

// Global handler for item clicks to avoid inline JS issues


let ADMIN_USERS = [];
let GEMINI_API_KEYS = []; // Array for rotation

// --- CENTRAL CONFIG ---
const DEFAULT_GAS_URL = 'https://script.google.com/macros/s/AKfycby-F1rqwiv6aneRtEL0ZV3lB8tOUQ64ckECuZDM7tXbzp85xxz6vyNvvvc718SNVjdVyQ/exec';
function getGasUrl() {
    return (document.getElementById('settings-google-script-url')?.value ||
        document.getElementById('google-script-url')?.value ||
        window.GAS_URL ||
        DEFAULT_GAS_URL).trim();
}

// Decode Function for API Keys
function decodeApiKey(encoded) {
    const cleaned = encoded ? String(encoded).trim() : '';
    if (!cleaned || cleaned.length < 20) return cleaned;

    // IF THE KEY STARTS WITH 'AIza', IT IS A RAW KEY. DO NOT ATTEMPT TO DECODE.
    if (cleaned.startsWith('AIza')) {
        console.log("Admin: Key check - raw key detected, skipping decode.");
        return cleaned;
    }

    try {
        const pwd = 'crtv_secure_2026';

        // Robustness: Strip CSV labels if present (e.g., "Main_Key,BASE64_STRING")
        let keyToDecode = cleaned;
        if (cleaned.includes(',')) {
            keyToDecode = cleaned.split(',')[1].trim();
        }

        let raw = atob(keyToDecode);
        let decoded = '';
        for (let i = 0; i < raw.length; i++) {
            decoded += String.fromCharCode(raw.charCodeAt(i) ^ pwd.charCodeAt(i % pwd.length));
        }
        if (decoded.startsWith('AIza')) {
            console.log(`Admin: Key decoded successfully (starts with ${decoded.substring(0, 4)})`);
        } else {
            console.warn(`Admin: Key decoded but prefix mismatch (starts with ${decoded.substring(0, 4)})`);
        }
        return decoded;
    } catch (e) {
        console.warn("Failed to decode key", e);
        return encoded;
    }
}

async function loadGeminiCredentials() {
    GEMINI_API_KEYS = [];

    // 1. Fetch from SQL Server via API (Primary Source)
    try {
        console.log("Admin: Fetching Gemini keys from database...");
        const response = await fetch('/api/gemini-keys');
        if (response.ok) {
            const data = await response.json();
            if (data.keys && Array.isArray(data.keys)) {
                GEMINI_API_KEYS = data.keys.map(decodeApiKey);
                console.log(`Admin: Loaded ${GEMINI_API_KEYS.length} Gemini keys from DB.`);
            }
        } else {
            // Fallback to GAS if local API fails (e.g. GitHub Pages)
            throw new Error("Local API unavailable");
        }
    } catch (e) {
        console.warn("Admin: Failed to load Gemini keys from local API, trying GAS...", e);
        try {
            const gasUrl = window.GAS_URL || 'https://script.google.com/macros/s/AKfycbyboPJ2chc70YohVOA5Q94oQUp8uxwbk293KK56Ru7sKIKrfIkUktM1VyXfnTSBTpsDoA/exec';

            // --- TRY SUPABASE FIRST (Reliable CORS) ---
            if (window.supabaseClient) {
                console.log("Admin: Trying to fetch Gemini keys from Supabase...");
                const { data: supaKeys, error } = await window.supabaseClient.from('gemini_keys').select('key');
                if (!error && supaKeys && supaKeys.length > 0) {
                    GEMINI_API_KEYS = supaKeys.map(item => item.key).filter(k => k);
                    console.log(`Admin: Loaded ${GEMINI_API_KEYS.length} keys (Raw/Encoded) from Supabase.`);
                    return;
                }
            }

            // --- GAS FALLBACK ---
            console.log("Admin: Trying GAS for keys...");
            let response = await fetch(gasUrl, {
                method: 'POST',
                mode: 'cors',
                redirect: 'follow',
                headers: { 'Content-Type': 'text/plain' },
                body: JSON.stringify({ action: 'getGeminiKeys' })
            });

            if (!response.ok) {
                response = await fetch(`${gasUrl}?action=getGeminiKeys`);
            }

            if (response.ok) {
                const data = await response.json();
                if (data.keys && Array.isArray(data.keys)) {
                    GEMINI_API_KEYS = data.keys.filter(k => k && k.trim().length > 0);
                    console.log(`Admin: Loaded ${GEMINI_API_KEYS.length} Gemini keys (Raw/Encoded) from GAS.`);
                }
            }

            // --- DEEP REDUNDANCY 1: Check 'keys.csv' if 'gemini_keys.csv' was empty ---
            if (GEMINI_API_KEYS.length === 0) {
                console.log("Admin: Key check fallback to keys.csv...");
                let altResponse = await fetch(gasUrl, {
                    method: 'POST',
                    mode: 'cors',
                    headers: { 'Content-Type': 'text/plain' },
                    body: JSON.stringify({ action: 'getGeminiKeys', file: 'data/keys.csv' })
                });
                if (altResponse.ok) {
                    const altData = await altResponse.json();
                    if (altData.keys && altData.keys.length > 0) {
                        GEMINI_API_KEYS = altData.keys.filter(k => k && k.trim().length > 0);
                        console.log(`Admin: Loaded ${GEMINI_API_KEYS.length} Gemini keys from alternate keys.csv.`);
                    }
                }
            }

            // --- THE ULTIMATE FALLBACK: DIRECT FETCH FROM GITHUB (BYPASS PROXY) ---
            if (GEMINI_API_KEYS.length === 0) {
                console.log("Admin: ALL proxies failed. Attempting DIRECT GitHub fetch for keys...");
                try {
                    const githubRawUrl = 'https://raw.githubusercontent.com/3omarhs/crtv-rarities-products/main/data/gemini_keys.csv?v=' + Date.now();
                    const ghResponse = await fetch(githubRawUrl);
                    if (ghResponse.ok) {
                        const csvText = await ghResponse.text();
                        // Parse simple CSV: Skip header, get second column
                        const rows = csvText.split('\n').slice(1);
                        const extractedKeys = rows
                            .map(r => r.trim())
                            .filter(r => r.length > 0)
                            .map(r => {
                                const parts = r.split(',');
                                return parts.length >= 2 ? parts.slice(1).join(',').trim() : parts[0].trim();
                            })
                            .filter(k => k.length > 5); // Ignore very short/empty keys

                        if (extractedKeys.length > 0) {
                            GEMINI_API_KEYS = extractedKeys;
                            console.log(`Admin: ðŸš€ ULTIMATE SUCCESS! Loaded ${GEMINI_API_KEYS.length} keys directly from GitHub.`);
                        }
                    }
                } catch (ghErr) {
                    console.error("Admin: Direct GitHub fetch failed as well.", ghErr);
                }
            }
        } catch (gasErr) {
            console.error("Admin: All Gemini key sources failed", gasErr);
        }
    }



    // 2. LocalStorage Override (Optional for dev)
    const localKey = localStorage.getItem('gemini_api_key');
    if (localKey) {
        const cleanedKey = localKey.trim();
        const decodedKey = decodeApiKey(cleanedKey);
        const isDummy = /DUMMY|YOUR_KEY|ABC|PASTE|12345/i.test(decodedKey) || decodedKey.length < 20;

        if (isDummy) {
            console.warn("Admin: Removing invalid dummy key from localStorage");
            localStorage.removeItem('gemini_api_key');
        } else if (!GEMINI_API_KEYS.includes(decodedKey)) {
            GEMINI_API_KEYS.unshift(decodedKey); // Add to front
            console.log("Admin: Added user-provided key from localStorage.");
        }
    }
}

// Initialize version display immediately and on every possible trigger
// (Handles both static HTML and dynamic SPA rendering)
updateDynamicVersion(); // Run immediately since script is at end of body
document.addEventListener('DOMContentLoaded', updateDynamicVersion);
window.addEventListener('load', updateDynamicVersion);
// Also run after a short delay in case the SPA overwrites the footer
setTimeout(updateDynamicVersion, 500);
setTimeout(updateDynamicVersion, 2000);

// --- AI Product Analysis ---
async function analyzeImageWithGemini(file) {
    console.log("Debug: analyzeImageWithGemini started");
    console.log("Admin: analyzeImageWithGemini called");

    // Retry loading keys if missing
    if (GEMINI_API_KEYS.length === 0) {
        console.warn("Gemini Keys missing, reloading...");
        await loadGeminiCredentials();
    }

    const isStatic = window.location.hostname.includes('github.io');

    if (!isStatic && GEMINI_API_KEYS.length === 0) {
        alert("System Error: No Gemini API Keys found locally. Please add your key in the Settings tab.");
        return;
    }

    const label = document.querySelector('label[for="product-image-upload"]');
    const originalText = "Product Image";

    // UI Loading State
    if (label) {
        label.innerHTML = 'Product Image <div class="ai-spinner"></div> <span style="margin-left:10px; color:var(--accent); font-size:0.9em;">Analyzing with Gemini AI...</span>';
    }

    const loadingText = "Generated by AI... â³";
    const inputsToReset = [
        'input[name="product name"]',
        'input[name="Arabic Name"]',
        'textarea[name="description (80 word)"]',
        'input[name="category"]',
        'input[name="collection"]',
        'input[name="target market"]'
    ];

    inputsToReset.forEach(selector => {
        const el = document.querySelector(selector);
        if (el) el.value = loadingText;
    });

    try {
        console.log("Admin: Reading image...");
        const reader = new FileReader();
        reader.readAsDataURL(file);

        reader.onloadend = async () => {
            const base64Data = reader.result.split(',')[1];
            const mimeType = file.type;
            let success = false;
            let lastError = null;

            const prompt = `You are a product management assistant. Analyze the image and provide the product details in a strictly structured format.

OUTPUT STRUCTURE:
1. Selling Name: A promotional name that indicates the function of the product (e.g., "Space-Saving Desk Organizer").
2. Description: A concise description of the product (approx. 80 words).
3. Category: The most appropriate category (e.g., "Home Decor & Organization - Desk Accessories").
Selling Name: A promotional name that indicates the function of the product (e.g., "Space-Saving Desk Organizer").
Description: A concise description of the product (approx. 80 words).
Category: The most appropriate category (e.g., "Home Decor & Organization - Desk Accessories").
Collection: The theme or collection this product belongs to.
Arabic Name: The name of the product in Arabic.
Target Market: The primary audience for this product.

CRITICAL OUTPUT FORMAT:
Return ONLY the values separated by "|||".
Order MUST be: Selling Name ||| Description ||| Category ||| Collection ||| Arabic Name ||| Target Market
DO NOT include labels like "1." or "Name:".
Example:
Super Desk Organizer ||| Keep your desk tidy... ||| Home Decor & Organization - Desk Accessories ||| Office Zen ||| Ù…Ù†Ø¸Ù… Ù…ÙƒØªØ¨ ||| Professionals

CRITICAL: NO mention of the product being "3D printed" or "3D printing" in the description or names. Focus on the product's function, design, and benefits.`;

            // --- STRATEGY: Universal Rotation (Keys x Models x Endpoints) ---
            try {
                const isStatic = window.location.hostname.includes('github.io');
                let response;

                // 1. Try Direct Gemini Call with rotation (Bypasses GAS CORS)
                if (GEMINI_API_KEYS.length > 0) {
                    // Final resilient rotation: Verified Flash-Latest first -> 2.0 -> 1.5 -> 8b -> 1.0 Pro
                    const models = ['gemini-flash-latest', 'gemini-1.5-flash-latest', 'gemini-2.0-flash', 'gemini-1.5-flash-8b-latest', 'gemini-1.0-pro'];
                    const endpoint = 'v1beta';

                    console.log(`Admin: Definitive rotation through ${GEMINI_API_KEYS.length} keys...`);

                    outerLoop:
                    for (const modelName of models) {
                        for (const apiVer of ['v1beta', 'v1']) {
                            for (let k = 0; k < GEMINI_API_KEYS.length; k++) {
                                let rawKey = GEMINI_API_KEYS[k];
                                try {
                                    const apiKey = typeof decodeApiKey === 'function' ? decodeApiKey(rawKey) : rawKey;
                                    const directUrl = `https://generativelanguage.googleapis.com/${apiVer}/models/${modelName}:generateContent?key=${apiKey}`;

                                    console.log(`Attempting Direct AI: ${modelName} (${apiVer}) with Key ${k + 1}...`);

                                    const directRes = await fetch(directUrl, {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({
                                            contents: [{
                                                parts: [
                                                    { text: prompt },
                                                    { inlineData: { mimeType: mimeType, data: base64Data } }
                                                ]
                                            }]
                                        })
                                    });

                                    if (directRes.ok) {
                                        response = directRes;
                                        success = true;
                                        break outerLoop;
                                    } else {
                                        const errText = await directRes.text();
                                        console.warn(`Direct AI (${modelName}) failed with status ${directRes.status}: ${errText.substring(0, 100)}`);
                                        if (directRes.status === 429) {
                                            await new Promise(r => setTimeout(r, 1000));
                                        }
                                    }
                                } catch (e) {
                                    console.warn(`Direct AI Attempt Error:`, e.name === 'AbortError' ? 'Timeout' : e.message);
                                }
                            }
                        }
                    }
                }

                // 2. Fallback to GAS Proxy if everything else failed
                if (!success) {
                    const gasUrl = window.GAS_URL || document.getElementById('google-script-url')?.value.trim() || 'https://script.google.com/macros/s/AKfycbyaM9NNHAXKXg-6ECi_Hx6Qn7tyoOyNd7YgfLGXfSNtkWUZXD1m5XChvXC2vL0oJ8Wdkw/exec';
                    console.log(`Universal Direct AI failed, extreme fallback to GAS with ${GEMINI_API_KEYS.length} keys...`);

                    for (let k = 0; k < GEMINI_API_KEYS.length; k++) {
                        let rawKey = GEMINI_API_KEYS[k];
                        const gasKey = typeof decodeApiKey === 'function' ? decodeApiKey(rawKey) : rawKey;

                        // Try models in GAS too
                        for (const modelName of models) {
                            try {
                                const controller = new AbortController();
                                const timeoutId = setTimeout(() => controller.abort(), 50000);

                                const gasRes = await fetch(gasUrl, {
                                    method: 'POST',
                                    mode: 'cors',
                                    redirect: 'follow',
                                    signal: controller.signal,
                                    headers: { 'Content-Type': 'text/plain' },
                                    body: JSON.stringify({
                                        action: 'proxyGemini',
                                        payload: {
                                            key: gasKey,
                                            model: modelName,
                                            data: {
                                                contents: [{
                                                    parts: [
                                                        { text: prompt },
                                                        { inlineData: { mimeType: mimeType, data: base64Data } }
                                                    ]
                                                }]
                                            }
                                        }
                                    })
                                });
                                clearTimeout(timeoutId);

                                if (gasRes.ok) {
                                    const rawRes = await gasRes.text();
                                    let jsonRes;
                                    try { jsonRes = JSON.parse(rawRes); } catch (e) { }

                                    if (jsonRes && jsonRes.candidates && jsonRes.candidates[0].content) {
                                        // Wrap jsonRes to match fetch response interface expected later
                                        response = {
                                            ok: true,
                                            json: async () => jsonRes,
                                            text: async () => JSON.stringify(jsonRes)
                                        };
                                        success = true;
                                        break;
                                    }
                                }
                            } catch (e) {
                                console.warn(`GAS Fallback Error (${modelName}):`, e.message);
                            }
                        }
                        if (success) break;
                    }
                }

                if (!response.ok) {
                    const errText = await response.text();
                    throw new Error(`HTTP ${response.status}: ${errText}`);
                }

                const data = await response.json();
                if (data.error || (data.result === 'error')) {
                    const errMsg = data.error || data.message || "Proxy error";
                    throw new Error(`API: ${errMsg}`);
                }

                // Handle response parsing
                let text = "";
                if (data.candidates && data.candidates[0].content) {
                    text = data.candidates[0].content.parts[0].text;
                } else if (data.text) {
                    text = data.text;
                } else {
                    throw new Error("Invalid response structure");
                }

                if (text) {
                    console.log("AI Response:", text);
                    const parts = text.split('|||').map(p => p.trim());

                    if (parts[0]) { const pn = document.querySelector('input[name="product name"]'); if (pn) pn.value = parts[0]; }
                    if (parts[1]) document.querySelector('textarea[name="description (80 word)"]').value = parts[1];
                    if (parts[2]) document.querySelector('input[name="category"]').value = parts[2];
                    if (parts[3]) document.querySelector('input[name="collection"]').value = parts[3];
                    if (parts[4]) document.querySelector('input[name="Arabic Name"]').value = parts[4];
                    if (parts[5]) document.querySelector('input[name="target market"]').value = parts[5];

                    if (label) {
                        label.innerHTML = 'Product Image <span style="margin-left:5px; color:#10b981;">Analysis Complete! âœ¨</span>';
                        setTimeout(() => {
                            label.textContent = originalText;
                            label.style.color = "inherit";
                        }, 5000);
                    }
                    success = true;
                }
            } catch (err) {
                lastError = err.message || err.toString();
                console.error(`AI Attempt failed:`, err);
            }


            // --- Reset UI on failure ---
            if (!success) {
                console.error("All AI attempts failed.");
                let userFriendlyErr = lastError;

                // If we got a complex error object from GAS, format it
                if (typeof lastError === 'object' && lastError.error) {
                    userFriendlyErr = lastError.error;
                    if (lastError.details && Array.isArray(lastError.details)) {
                        userFriendlyErr += "<br><small style='display:block; margin-top:5px; font-size:0.8em; opacity:0.8;'>" +
                            lastError.details.join("<br>") + "</small>";
                    }
                } else {
                    // Final safe stringification to avoid [object Object]
                    if (typeof lastError === 'object') {
                        userFriendlyErr = lastError.message || JSON.stringify(lastError);
                    } else {
                        userFriendlyErr = String(lastError);
                    }

                    // Keep simplified messages for common issues
                    if (userFriendlyErr.includes('429')) userFriendlyErr = "Gemini Quota Exceeded (429). Try again shortly.";
                    if (userFriendlyErr.includes('403')) userFriendlyErr = "Access Denied (403). Check API keys.";
                }

                if (label) label.innerHTML = `Product Image <span style="color:var(--danger);">${userFriendlyErr}</span>`;

                // Broad reset: find any input/textarea containing "Generated by AI" and clear it
                document.querySelectorAll('input, textarea').forEach(el => {
                    if (el.value && el.value.includes('Generated by AI')) {
                        el.value = "";
                    }
                });
            }
        };

    } catch (e) {
        console.error("AI Analysis Critical Error:", e);
        if (label) label.textContent = "Product Image (Error)";
        alert("Error: " + e.message);
    }
}
async function loadCredentials() {
    ADMIN_USERS = [];
    console.log("Admin: Starting loadCredentials...");

    let apiSuccess = false;
    let fileSuccess = false;

    console.log("Admin: /api/admins removed for static hosting. Falling back to adminCredentials.txt.");

    // Fallback: Legacy Text File
    try {
        console.log("Admin: Fetching adminCredentials.txt...");
        const response = await fetch('adminCredentials.txt?v=' + Date.now());
        if (!response.ok) throw new Error("Failed to load credentials file");
        const text = await response.text();
        console.log("Admin: File Content Preview:", text.substring(0, 50));

        const lines = text.split(/\r?\n/);
        let currentUser = {};
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) {
                if (currentUser.email && currentUser.pass) {
                    ADMIN_USERS.push(currentUser);
                    currentUser = {};
                }
                continue;
            }

            const firstColon = line.indexOf(':');
            if (firstColon === -1) continue;

            const key = line.substring(0, firstColon).trim().toLowerCase();
            const value = line.substring(firstColon + 1).trim();

            if (key === 'username') {
                if (currentUser.email && currentUser.pass) {
                    ADMIN_USERS.push(currentUser);
                    currentUser = {};
                }
                currentUser.email = value.toLowerCase();
            } else if (key === 'password') {
                currentUser.pass = value;
            }
        }
        if (currentUser.email && currentUser.pass) {
            ADMIN_USERS.push(currentUser);
        }
        console.log(`Admin: Loaded ${ADMIN_USERS.length} users from file.`);
        fileSuccess = true;

    } catch (e) {
        console.warn("Admin: Failed to load adminCredentials.txt", e);
    }

    // FINAL FALLBACK: If everything failed (no API, no file), use default
    if (ADMIN_USERS.length === 0) {
        console.warn("Admin: No credentials source found. Using DEFAULT emergency credentials.");
        ADMIN_USERS.push({ email: 'admin', pass: 'admin123' });
        ADMIN_USERS.push({ email: 'omar', pass: 'omar123' });
    }

    // Emergency Default
    if (ADMIN_USERS.length === 0) {
        console.warn("Admin: using fallback credentials.");
        // If both failed, it's likely a server/file access issue.
        if (!apiSuccess && !fileSuccess) {
            // Check if protocols match expectations
            if (window.location.protocol === 'file:') {
                alert("CRITICAL: You are opening this file directly. Please START THE SERVER (node server.js) and open http://localhost:3000/admin.html to log in.");
            }
        }

        // Still add default so logic doesn't crash, but it won't match user's custom creds
        ADMIN_USERS.push({ email: 'admin', pass: 'admin123' });
    }

    console.log("Admin: Final User List:", ADMIN_USERS);
}

// Ensure handleLogin logs as well
const handleLogin = (e) => {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }

    console.log("Admin: handleLogin called. Users loaded:", ADMIN_USERS.length);
    if (ADMIN_USERS.length === 0) {
        alert("System initializing... please wait.");
        return;
    }

    const emailInput = document.getElementById('admin-email');
    const passInput = document.getElementById('admin-password');
    if (!emailInput || !passInput) return;

    const email = emailInput.value.trim().toLowerCase();
    const pass = passInput.value.trim();
    const err = document.getElementById('login-error');

    console.log(`Admin: Attempting login for '${email}' with password length ${pass.length}`);

    const validUser = ADMIN_USERS.find(u => {
        const match = u.email === email && u.pass === pass;
        if (!match && u.email === email) console.log("Admin: User found but password mismatch.");
        return match;
    });

    if (validUser) {
        console.log("Admin: Login Success!");
        sessionStorage.setItem('admin_logged_in', 'true');
        if (err) err.classList.add('hidden');
        showDashboard();
    } else {
        console.warn("Admin: Login Failed for", email);
        console.log("Admin: Available Users:", ADMIN_USERS.map(u => u.email));
        if (err) err.classList.remove('hidden');
    }
};


// Main Initialization Logic
async function initAdmin() {
    console.log("Admin: Initializing...");

    // 1. Navigation Handler (Event Delegation) - Attach FIRST
    const sidebarNav = document.querySelector('.sidebar-nav');
    if (sidebarNav) {
        // Clone sidebar nav to clear old listeners if any (clean slate)
        const newSidebarNav = sidebarNav.cloneNode(true);
        sidebarNav.parentNode.replaceChild(newSidebarNav, sidebarNav);

        newSidebarNav.addEventListener('click', (e) => {
            const navItem = e.target.closest('.nav-item[data-view]');
            if (!navItem) return;

            console.log("Navigating to:", navItem.dataset.view);

            // Update Active State
            // Note: We need to query from the newSidebarNav now since we replaced it
            newSidebarNav.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
            navItem.classList.add('active');

            // Show View
            const viewId = `view-${navItem.dataset.view}`;

            // Force hide all sections
            document.querySelectorAll('.view-section').forEach(v => {
                v.classList.add('hidden');
                v.style.display = 'none';
            });

            const targetView = document.getElementById(viewId);
            if (targetView) {
                targetView.classList.remove('hidden');
                targetView.style.display = 'block';

                // Update header title
                const titleEl = document.getElementById('page-title');
                if (titleEl) {
                    // Handle text content carefully to ignore icon text if any
                    // Actually navItem.textContent is fine usually
                    titleEl.textContent = navItem.innerText.trim();
                }

                // View specific init
                const viewName = navItem.dataset.view;
                if (viewName === 'products') {
                    if (window.loadProducts) window.loadProducts();
                } else if (viewName === 'add-product') {
                    if (window.prepareAddProductForm) window.prepareAddProductForm();
                } else if (viewName === 'create-order') {
                    if (window.initCreateOrder) window.initCreateOrder();
                } else if (viewName === 'settings') {
                    if (window.loadSettings) window.loadSettings();
                } else if (viewName === 'social-generator') {
                    if (window.initSocialGenerator) window.initSocialGenerator();
                } else if (viewName === 'wholesale') {
                    if (window.loadWholesale) window.loadWholesale();
                } else if (viewName === 'upload-images') {
                    if (window.initUploadImages) window.initUploadImages();
                }
            } else {
                console.error("Target view not found:", viewId);
            }
        });
        console.log("Admin: Navigation listeners attached.");
    }

    // 2. Attach Login Listener immediately
    const loginForm = document.getElementById('login-form');
    const loginBtn = document.querySelector('.btn-primary');

    const handleLogin = (e) => {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }

        if (ADMIN_USERS.length === 0) {
            alert("System initializing... please wait.");
            return;
        }

        const emailInput = document.getElementById('admin-email');
        const passInput = document.getElementById('admin-password');
        if (!emailInput || !passInput) return;

        const email = emailInput.value;
        const pass = passInput.value;
        const err = document.getElementById('login-error');

        const validUser = ADMIN_USERS.find(u =>
            u.email === email.trim().toLowerCase() && u.pass === pass.trim()
        );

        if (validUser) {
            sessionStorage.setItem('admin_logged_in', 'true');
            const remember = document.getElementById('remember-me');
            if (remember && remember.checked) {
                localStorage.setItem('admin_logged_in', 'true');
            }
            if (err) err.classList.add('hidden');
            showDashboard();
        } else {
            console.warn("Admin: Login Failed");
            if (err) err.classList.remove('hidden');
        }
    };

    if (loginForm) {
        // Remove existing listeners to avoid duplicates if re-init
        const newForm = loginForm.cloneNode(true);
        loginForm.parentNode.replaceChild(newForm, loginForm);
        newForm.addEventListener('submit', handleLogin);
    }

    // Manual bind for button just in case
    if (loginBtn && loginForm) {
        const newBtn = loginBtn.cloneNode(true);
        loginBtn.parentNode.replaceChild(newBtn, loginBtn);
        newBtn.addEventListener('click', (e) => {
            if (newBtn.type !== 'submit') handleLogin(e);
        });
    }

    // 3. Initialize Icons & Image Upload (Non-blocking)
    if (window.lucide) lucide.createIcons();

    const imgInput = document.getElementById('product-image-upload');
    if (imgInput) {
        const newInput = imgInput.cloneNode(true);
        imgInput.parentNode.replaceChild(newInput, imgInput);
        newInput.addEventListener('change', async (e) => {
            alert("Debug: File Selected"); // Visible confirmation
            console.log("Admin: Image file selected/changed");
            if (e.target.files && e.target.files[0]) {
                await analyzeImageWithGemini(e.target.files[0]);
            }
        });
    }

    // 4. Delegated Event Listener for Order Item Tiles
    const ordersBody = document.getElementById('orders-table-body');
    if (ordersBody) {
        const newBody = ordersBody.cloneNode(true);
        ordersBody.parentNode.replaceChild(newBody, ordersBody);

        newBody.addEventListener('click', (e) => {
            const tile = e.target.closest('.item-tile');
            if (tile) {
                e.preventDefault();
                e.stopPropagation();
                const sku = tile.dataset.sku;
                if (sku) {
                    window.toggleItemExpansion(tile, sku);
                }
            }
        });
    }

    // 5. Other Handlers (Logout, Refresh, Add Product, Settings)
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        const newLogout = logoutBtn.cloneNode(true);
        logoutBtn.parentNode.replaceChild(newLogout, logoutBtn);
        newLogout.addEventListener('click', () => {
            sessionStorage.removeItem('admin_logged_in');
            localStorage.removeItem('admin_logged_in');
            window.location.reload();
        });
    }

    const refreshBtn = document.getElementById('refresh-products-btn');
    if (refreshBtn) {
        const newRefresh = refreshBtn.cloneNode(true);
        refreshBtn.parentNode.replaceChild(newRefresh, refreshBtn);
        newRefresh.addEventListener('click', loadProducts);
    }

    const addProductForm = document.getElementById('add-product-form');
    if (addProductForm) {
        const newForm = addProductForm.cloneNode(true);
        addProductForm.parentNode.replaceChild(newForm, addProductForm);
        newForm.addEventListener('submit', async (e) => {
            handleProductSubmit(e);
        });

        // AI Image Analysis Hook (Manual)
        const aiBtn = newForm.querySelector('#btn-ai-generate');
        const aiFileInput = newForm.querySelector('#product-image-upload');
        if (aiBtn && aiFileInput) {
            aiBtn.addEventListener('click', () => {
                if (aiFileInput.files.length > 0) {
                    analyzeImageWithGemini(aiFileInput.files[0]);
                } else {
                    alert("Please select an image first.");
                }
            });
        }


        const weightInput = newForm.querySelector('input[name="Calculate on Weight"]');
        if (weightInput) {
            weightInput.addEventListener('blur', handleWeightCalculation);
        }
    }

    const saveSettingsBtn = document.getElementById('save-settings-btn');
    if (saveSettingsBtn) {
        loadSettings();
        const newBtn = saveSettingsBtn.cloneNode(true);
        saveSettingsBtn.parentNode.replaceChild(newBtn, saveSettingsBtn);

        newBtn.addEventListener('click', async () => {
            const enabled = document.getElementById('email-enabled').checked;
            const receiver = document.getElementById('receiver-email').value.trim();
            const sender = document.getElementById('sender-email').value.trim();
            const pass = document.getElementById('sender-pass').value.trim();
            const msg = document.getElementById('settings-msg');

            // Save Gemini Key to LocalStorage
            const keyInput = document.getElementById('gemini-api-key-input');
            let keyToSave = '';
            if (keyInput) {
                const key = keyInput.value.trim();
                keyToSave = key;
                if (key) {
                    localStorage.setItem('gemini_api_key', key);
                    await loadGeminiCredentials(); // Reload immediately
                } else {
                    localStorage.removeItem('gemini_api_key');
                }
            }

                // Save GitHub Token to LocalStorage
                const ghTokenInput = document.getElementById('github-token');
                if (ghTokenInput) {
                    const token = ghTokenInput.value.trim();
                    if (token) {
                        localStorage.setItem('github_token', token);
                    } else {
                        localStorage.removeItem('github_token');
                    }
                }

                const gasUrlInput = document.getElementById('settings-google-script-url');
                const gasUrl = gasUrlInput ? gasUrlInput.value.trim() : '';

                if (!gasUrl) {
                    alert("Error: No Google Script URL defined. Cannot save settings to CSV.");
                    return;
                }

                try {
                    console.log("Saving settings to GitHub CSV via GAS...");
                    const res = await fetch(gasUrl, {
                        method: 'POST',
                        mode: 'cors',
                        headers: { 'Content-Type': 'text/plain' },
                        body: JSON.stringify({
                            action: 'saveSettings',
                            settings: {
                                email_enabled: enabled,
                                receiver_email: receiver,
                                sender_email: sender,
                                sender_pass: pass,
                                google_script_url: gasUrl
                            }
                        })
                    });

                if (res.ok) {
                    msg.textContent = "Settings saved to GitHub CSV!";
                    msg.classList.remove('hidden');
                    setTimeout(() => {
                        msg.classList.add('hidden');
                        location.reload(); // Reload to sync all views
                    }, 2000);
                } else {
                    throw new Error("Failed to save via GAS");
                }
            } catch (e) {
                console.error("Settings save error", e);
                alert("Failed to save settings: " + e.message);
            }
        });
    }

    // Theme Toggle Listener (Settings Checkbox)
    const themeCheckbox = document.getElementById('theme-toggle-checkbox');
    if (themeCheckbox) {
        const newToggle = themeCheckbox.cloneNode(true);
        themeCheckbox.parentNode.replaceChild(newToggle, themeCheckbox);
        newToggle.addEventListener('change', window.toggleTheme);
        // State is matched in initTheme
    }

    // 6. Load Data (Blocking stuff LAST)
    await loadCredentials();
    await loadGeminiCredentials();

    // Check Session
    const session = sessionStorage.getItem('admin_logged_in');
    const local = localStorage.getItem('admin_logged_in');
    console.log("Admin: checking persistent login. Session:", session, "Local:", local);

    if (session === 'true' || local === 'true') {
        if (local === 'true') sessionStorage.setItem('admin_logged_in', 'true');
        showDashboard();
    } else {
        // Only show login if NOT logged in
        const loginScreen = document.getElementById('login-screen');
        if (loginScreen) loginScreen.classList.remove('hidden');
        showLogin();
    }
}

// Separate handlers to keep init clean
// Separate handlers to keep init clean
async function handleProductSubmit(e) {
    e.preventDefault();
    const msg = document.getElementById('add-product-msg');
    const err = document.getElementById('add-product-err'); // Standardized ID
    if (msg) msg.classList.add('hidden');
    if (err) err.classList.add('hidden');

    const form = e.target;
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());

    const no = data['No'].trim();
    if (!no) {
        if (err) {
            err.textContent = "Item Number is required";
            err.classList.remove('hidden');
        }
        return;
    }

    // 1. Validate GAS URL
    const gasUrl = document.getElementById('google-script-url').value.trim();
    if (!gasUrl) {
        if (err) {
            err.textContent = "Please provide the Google Apps Script URL.";
            err.classList.remove('hidden');
        }
        return;
    }

    const submitBtn = form.querySelector('button[type="submit"]');
    const originalBtnText = submitBtn.innerText;

    // Show loading
    showLoading("Saving Product", "Please wait while we sync product data to GitHub...");
    submitBtn.disabled = true;
    submitBtn.innerText = "Processing...";

    try {

    // 2. Prepare Data for GAS
    // Defensive action check to prevent price corruption
    const actionVal = document.getElementById('product-action')?.value;
    const action = actionVal === 'updateProduct' ? 'updateProduct' : 'addProduct';

    const gasData = {
        'action': action,
        'No': no,
        'Name on Store': data['Name on Store'],
        'Product Name': data['product name'],
        'Arabic Name': data['Arabic Name'] || data['Name on Store'],
        'category': data['category'],
        'collection': data['collection'],
        'description (80 word)': String(data['description (80 word)']).replace(/\n/g, ' ').replace(/\r/g, ''),
        'Dimensions(mm) x y z': data['Dimensions(mm) x y z'],
        'Colors': data['Colors'],
        'Price < 25 QTY': data['Price < 25 QTY'],
        'Price >=25 QTY': data['Price >=25 QTY'],
        'target market': data['target market'],
        'Document Link': data['Document Link'],
        'Calculate on Weight': data['Calculate on Weight'],
        'Available': form.querySelector('[name="Available"]').checked ? "TRUE" : "FALSE",
        'Hidden': form.querySelector('[name="Hidden"]').checked ? "TRUE" : "FALSE",
        'Active': form.querySelector('[name="Active"]').checked ? "TRUE" : "FALSE",
    };

    // Handle Image & Sync
    const doSync = async (finalPayload) => {
        await submitToSupabase(finalPayload);
        await submitToGas(gasUrl, finalPayload);
        await submitToLocal(finalPayload);
    };

    // 3. Handle Image (Convert to Base64)
    const fileInput = document.getElementById('product-image-upload');
    if (fileInput && fileInput.files.length > 0) {
        const file = fileInput.files[0];
        const reader = new FileReader();

        reader.onerror = function () {
            console.error("FileReader error");
            if (loading) loading.classList.add('hidden');
            submitBtn.disabled = false;
            submitBtn.innerText = originalBtnText;
            if (err) {
                err.textContent = "Failed to read file";
                err.classList.remove('hidden');
            }
        };

        reader.onload = async function (e) {
            const base64 = e.target.result.split(',')[1];
            gasData.image = base64;
            const ext = file.name.split('.').pop();
            const newFileName = `${no}.${ext}`;
            gasData.imageName = newFileName;
            gasData.mimeType = file.type;

            await doSync(gasData);
        };
        reader.readAsDataURL(file);
    } else {
        doSync(gasData);
    }
    } catch (err) {
        console.error("Add Product Error:", err);
        const errorEl = document.getElementById('add-product-error');
        if (errorEl) {
            errorEl.innerText = "Error: " + err.message;
            errorEl.classList.remove('hidden');
        }
    } finally {
        hideLoading();
        submitBtn.disabled = false;
        submitBtn.innerText = originalBtnText;
    }

    async function submitToSupabase(payload) {
        try {
            console.log("Syncing to Supabase...");

            // Map payload keys to exact Supabase schema (snake_case)
            const dbPayload = {
                id: payload.id || Date.now().toString(),
                item_no: payload['No'],
                name: payload['Product Name'],
                store_name: payload['Name on Store'],
                arabic_name: payload['Arabic Name'] || payload['Name on Store'],
                category: payload['category'],
                collection: payload['collection'],
                description: payload['description (80 word)'],
                colors: payload['Colors'],
                dimensions: payload['Dimensions(mm) x y z'],
                price_low_qty: payload['Price < 25 QTY'],
                price_high_qty: payload['Price >=25 QTY'],
                target_market: payload['target market'],
                document_link: payload['Document Link'],
                weight_calc: payload['Calculate on Weight'],
                available: String(payload['Available']), // Ensure string
                hidden: String(payload['Hidden'])         // Ensure string
                // Note: 'active' column removed as it's missing in DB schema
            };

            const { data, error } = await window.supabaseClient.from('products').upsert(dbPayload, { onConflict: 'id' });
            if (error) throw error;
            console.log("Supabase sync complete.");
        } catch (e) {
            console.error("Supabase sync failed:", e);
        }
    }

    async function submitToLocal(payload) {
        // This function is effectively disabled for static GitHub Pages
        console.warn("Local sync is disabled on static GitHub Pages. Relying on Supabase and GAS.");
        return;
        // try {
        //     console.log("Syncing to local DB...");
        //     // Remove large image data to save bandwidth if not needed by DB logic yet
        //     const cleanPayload = { ...payload };
        //     delete cleanPayload.image;

        //     await fetch('/api/add-product', {
        //         method: 'POST',
        //         headers: { 'Content-Type': 'application/json' },
        //         body: JSON.stringify(cleanPayload)
        //     });
        //     console.log("Local sync requested.");
        // } catch (e) {
        //     console.error("Local sync failed", e);
        // }
    }

    async function submitToGas(url, payload) {
        try {
            console.log("[DEBUG] Submitting to GAS:", url);
            const res = await fetch(url, {
                method: 'POST',
                mode: 'cors',
                redirect: 'follow',
                body: JSON.stringify(payload),
                headers: { "Content-Type": "text/plain" },
            });

            const text = await res.text();
            console.log("[DEBUG] Raw GAS Response:", text);
            let json = {};
            try {
                json = JSON.parse(text);
            } catch (e) {
                if (text && text.trim().toLowerCase().includes('success')) {
                    json = { result: 'success' };
                }
            }

            if (json.result === 'success' || json.status === 'success') {
                let successMsg = "Product saved to Spreadsheet!";
                let isWarning = false;

                // Handle detailed GitHub sync status
                if (json.github_sync) {
                    if (json.github_sync.status === 'success') {
                        successMsg += " âœ¨ GitHub sync complete.";
                    } else if (json.github_sync.status === 'warning') {
                        successMsg += " âš ï¸ Sheet updated, but GitHub Sync skipped (Check Token).";
                        isWarning = true;
                    } else if (json.github_sync.status === 'error') {
                        successMsg += " âŒ Sheet updated, but GitHub Sync FAILED.";
                        isWarning = true;
                    }
                }

                if (msg) {
                    msg.innerHTML = successMsg;
                    msg.style.color = isWarning ? "orange" : "#10b981";
                    msg.classList.remove('hidden');
                }

                setTimeout(async () => {
                    if (msg) msg.classList.add('hidden');
                    if (loading) loading.classList.add('hidden');
                    submitBtn.disabled = false;
                    submitBtn.innerText = originalBtnText;

                    // Switch View to Social Generator
                    const socialView = document.getElementById('view-social-generator');
                    if (socialView) {
                        document.querySelectorAll('.view-section').forEach(v => {
                            v.classList.add('hidden');
                            v.style.display = 'none';
                        });
                        socialView.classList.remove('hidden');
                        socialView.style.display = 'block';

                        document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
                        document.querySelector('.nav-item[data-view="social-generator"]')?.classList.add('active');

                        // Populate Social Generator
                        if (window.initSocialGenerator) await window.initSocialGenerator();
                        const select = document.getElementById('social-product-select');
                        if (select) {
                            const exists = [...select.options].some(o => o.value === payload.No);
                            if (!exists) {
                                const opt = document.createElement('option');
                                opt.value = payload.No;
                                opt.textContent = `${payload.No} - ${payload['product name'] || payload['Name on Store'] || ''}`;
                                select.appendChild(opt);
                            }
                            select.value = payload.No;
                        }
                        if (typeof generateSocialPost === 'function') {
                            await generateSocialPost(payload);
                        }
                    }

                    form.reset();
                    // Reset hidden fields
                    const actionInput = document.getElementById('product-action');
                    if (actionInput) actionInput.value = 'addProduct';
                    const editNoInput = document.getElementById('edit-product-no');
                    if (editNoInput) editNoInput.value = '';

                    // Keep the GAS URL pre-populated for next submission
                    const gasUrlInput = document.getElementById('google-script-url');
                    if (gasUrlInput && !gasUrlInput.value) {
                        const knownGasUrl = window.GAS_URL || 'https://script.google.com/macros/s/AKfycby-F1rqwiv6aneRtEL0ZV3lB8tOUQ64ckECuZDM7tXbzp85xxz6vyNvvvc718SNVjdVyQ/exec';
                        gasUrlInput.value = knownGasUrl;
                    }

                    // Clear product cache to force re-fetch
                    window.allProducts = [];
                    window.manualProducts = [];

                    if (typeof loadProducts === 'function') await loadProducts();
                    if (typeof initProductData === 'function') await initProductData();
                }, 1000);
            } else {
                let errDetail = json.error || json.message || res.status;
                if (!json.result && text.length > 0) {
                    errDetail += " (Response: " + text.substring(0, 100).replace(/[<>]/g, '') + ")";
                }
                throw new Error("GAS Error: " + errDetail);
            }
        } catch (ex) {
            console.error("GAS Sync Error Details:", ex);
            if (err) {
                let displayErr = ex.message || "Unknown error";
                if (displayErr.includes("Failed to fetch")) {
                    displayErr = "Failed to fetch (CORS or Network Error). Please ensure the Script URL is correct and deployed as 'Anyone'.";
                }
                err.textContent = "Sync Failed: " + displayErr;
                err.classList.remove('hidden');
            }
        } finally {
            if (loading) loading.classList.add('hidden');
            submitBtn.disabled = false;
            submitBtn.innerText = originalBtnText;
        }
    }
}

function handleWeightCalculation(e) {
    const form = document.getElementById('add-product-form');
    if (!form) return;

    const weight = parseFloat(e.target.value);
    if (isNaN(weight)) return;

    let priceSmall = 0;
    if (weight < 35) priceSmall = weight * 0.075;
    else if (weight < 60) priceSmall = weight * 0.06;
    else if (weight < 150) priceSmall = weight * 0.05;
    else priceSmall = weight * 0.04;

    let priceWholesale = 0;
    if (weight < 35) priceWholesale = weight * 0.06;
    else if (weight < 150) priceWholesale = weight * 0.05;
    else priceWholesale = weight * 0.04;

    const priceSmallInput = form.querySelector('input[name="Price < 25 QTY"]');
    const priceWholesaleInput = form.querySelector('input[name="Price >=25 QTY"]');

    if (priceSmallInput) priceSmallInput.value = priceSmall.toFixed(3);
    if (priceWholesaleInput) priceWholesaleInput.value = priceWholesale.toFixed(3);
    console.log(`Calculated Prices: <25=${priceSmall.toFixed(3)}, >=25=${priceWholesale.toFixed(3)}`);
}

async function loadSettings() {
    console.log("Admin: Refreshing settings UI...");

    // Sync Version Display
    const versionDisplay = document.getElementById('app-version-display');
    if (versionDisplay) versionDisplay.textContent = "v5.2.0";

    // Initial fallback URL (will be overwritten by CSV load)
    const fallbackGasUrl = 'https://script.google.com/macros/s/AKfycbxP6nQvYQK3RvS7fYRM3KNdQrqapdBPVX0IE4pG51XpkE1CxUgA7oyAJOocfwS1xsrtmA/exec';

    // Update all URL inputs initially
    const urlInputs = ['google-script-url', 'settings-google-script-url'];
    urlInputs.forEach(id => {
        const el = document.getElementById(id);
        if (el && !el.value) el.value = fallbackGasUrl;
    });

    const keyInput = document.getElementById('gemini-api-key-input');
    if (keyInput) {
        keyInput.value = localStorage.getItem('gemini_api_key') || '';
    }

    const ghTokenInput = document.getElementById('github-token');
    if (ghTokenInput) {
        ghTokenInput.value = localStorage.getItem('github_token') || '';
    }

    try {
        const res = await fetch('https://raw.githubusercontent.com/3omarhs/crtv-rarities-products/main/data/settings.csv?v=' + Date.now());
        if (!res.ok) throw new Error("Failed to fetch settings");
        const csvText = await res.text();
        const data = {};
        Papa.parse(csvText, {
            header: true, skipEmptyLines: true,
            complete: function (results) {
                results.data.forEach(row => {
                    if (row.key) data[row.key] = row.value;
                });

                // Populate GAS URL from CSV if present
                if (data.google_script_url) {
                    urlInputs.forEach(id => {
                        const el = document.getElementById(id);
                        if (el) el.value = data.google_script_url;
                    });
                    console.log("Admin: Loaded GAS_URL from CSV settings.");
                }
            }
        });

        const enabled = document.getElementById('email-enabled');
        const receiver = document.getElementById('receiver-email');
        const sender = document.getElementById('sender-email');
        const pass = document.getElementById('sender-pass');

        if (enabled) enabled.checked = !!data.enabled;
        if (receiver) receiver.value = data.receiver_email || '';
        if (sender) sender.value = data.sender_email || '';
        if (pass) pass.value = data.sender_pass || '';

        const versionDisp = document.getElementById('app-version-display');
        const footerVersionDisp = document.getElementById('footer-version-display');

        if (data.version) {
            if (versionDisp) versionDisp.textContent = data.version;
            if (footerVersionDisp) footerVersionDisp.textContent = data.version;
            console.log("Admin: Set version to", data.version);
        } else {
            if (versionDisplay) versionDisplay.textContent = "v5.2.0"; // Fallback
            if (footerVersionDisp) footerVersionDisp.textContent = "v5.2.0";
        }

        const settingsScriptUrl = document.getElementById('settings-google-script-url');
        if (settingsScriptUrl) settingsScriptUrl.value = data.google_script_url || '';

        const formScriptUrl = document.getElementById('google-script-url');
        // Only populate form URL if it's currently empty and we have a setting
        if (formScriptUrl && (!formScriptUrl.value || formScriptUrl.value.trim() === '') && data.google_script_url) {
            formScriptUrl.value = data.google_script_url;
        }

        // Load Admin List
        if (window.loadAdminsForManagement) window.loadAdminsForManagement();
        if (window.initWholesale) window.initWholesale();

    } catch (e) {
        console.error("Error loading settings (API might be down on Vercel):", e);
    }
}

// Execute Init
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAdmin);
} else {
    // Already ready, run immediately
    initAdmin();
}


// --- Social Media Generator ---
window.initSocialGenerator = async function () {
    console.log("Initializing Social Generator...");
    const searchInput = document.getElementById('social-product-search');
    const select = document.getElementById('social-product-select');
    const btn = document.getElementById('generate-social-btn');
    const output = document.getElementById('social-post-output');

    if (!searchInput || !select || !btn) return;

    // Load products if not loaded
    if (!window.allProducts || window.allProducts.length === 0) {
        try {
            await initProductData();
        } catch (e) { console.error("Error loading products for social", e); return; }
    }

    // Setup Custom Dropdown
    window.setupCustomProductDropdown({
        inputId: 'social-product-search',
        dropdownId: 'social-product-dropdown',
        onSelect: (id) => {
            select.value = id; // Update hidden input
        }
    });

    // Remove old listeners
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);

    newBtn.addEventListener('click', async () => {
        const productNo = select.value;
        if (!productNo) { alert("Please select a product."); return; }

        const product = window.allProducts.find(p => p['No'] == productNo);
        if (!product) return;

        newBtn.disabled = true;
        const originalText = newBtn.innerHTML;
        newBtn.innerHTML = '<span>Generating... â³</span>';
        output.value = "Creating magic... âœ¨";

        try {
            if (GEMINI_API_KEYS.length === 0) await loadGeminiCredentials();

            if (GEMINI_API_KEYS.length === 0) {
                const msg = "âš ï¸ Missing API Key!\n\nPlease go to the 'Settings' tab -> 'API Configuration' and enter your Gemini API Key there.";
                alert(msg);
                output.value = msg;
                throw new Error("No Gemini API Keys found. Please configure in Settings.");
            }

            const name = product['Product Name'] || product['product name'] || product['Name on Store'];
            const description = product['description (80 word)'] || '';
            const price = parseFloat(String(product['Price < 25 QTY'] || product['Price'] || 0).replace(/[^\d.]/g, '')).toFixed(3);
            const bulkPrice = product['Price >= 25 QTY'] || product['Wholesale Price'];
            const hasBulk = bulkPrice && parseFloat(String(bulkPrice).replace(/[^\d.]/g, '')) > 0;
            const prompt = `Act as a social media manager for "Creative Rarities". Write a highly engaging post caption for this product in Modern Arabic (catchy, professional Standard Arabic for social media).
            
Product Info:
- Name: ${name}
- Description: ${description}
- Retail Price: ${price} JOD
- Has Bulk Discount: ${hasBulk ? 'Yes' : 'No'}

Instructions for the AI:
1. Tone: Catchy, prestigious, and extremely inviting. 
2. Pricing: You MUST mention the retail price using the specific Arabic term "Ø³Ø¹Ø± Ø§Ù„Ù…ÙØ±Ù‚" followed by "${price} JOD".
3. Bulk: ${hasBulk ? "Mention that a special discount is available for bulk orders (over 25 pieces)." : "Do not mention bulk discounts unless specifically asked."}
4. Hook: Start with a powerful attention-grabbing hook and relevant emojis.
5. Unique Selling Point: Highlight why this item is a rare find and perfect for the customer.
6. Viral Boost: Include top 5 viral and trending hashtags specifically chosen to INCREASE WATCHES and reach the EXPLORE page always use the #CreativeRarities as one of the 5 hashtags (e.g., #TrendingNow, #Explore, #MustHave, #CreativeRarities, #Gifts, #UniqueDesign).
7. Call to Action: Direct customers to order via the link in bio or by searching for the product name on the website.
8. Restrictions: DO NOT mention "3D printing" or "additive manufacturing". Return ONLY the caption text. No meta-talk.
9. Use Arabic argot Ù„Ù‡Ø¬Ø© Ø¹Ø§Ù…ÙŠØ© Ø§Ø±Ø¯Ù†ÙŠØ© in the generated text`;

            let success = false;
            // Expanded rotation: Verified Flash-Latest first -> 2.0 (High quality) -> 1.5 (Standard) -> 8b (Fast/Extra Quota) -> 1.0 Pro (Massive Quota)
            const modelsToTry = ['gemini-flash-latest', 'gemini-1.5-flash-latest', 'gemini-2.0-flash', 'gemini-1.5-flash-8b-latest', 'gemini-1.0-pro'];
            const endpoint = 'v1beta';
            const allKeys = GEMINI_API_KEYS;
            const GAS_FALLBACK_URL = window.GAS_URL || document.getElementById('google-script-url')?.value.trim() || 'https://script.google.com/macros/s/AKfycbyboPJ2chc70YohVOA5Q94oQUp8uxwbk293KK56Ru7sKIKrfIkUktM1VyXfnTSBTpsDoA/exec';

            const logContainer = document.getElementById('social-ai-log-container');
            const logElement = document.getElementById('social-ai-log');
            if (logContainer) logContainer.style.display = 'block';
            if (logElement) logElement.innerHTML = '';

            function addSocialLog(msg, type = 'info') {
                if (!logElement) return;
                const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                const color = type === 'error' ? '#f87171' : (type === 'success' ? '#34d399' : '#94a3b8');
                logElement.innerHTML += `<div style="margin-bottom:4px; font-size:0.85rem; color:${color}">[${time}] ${msg}</div>`;
                logElement.scrollTop = logElement.scrollHeight;
            }

            const quotaBlockedProjects = new Set();

            outerLoopSocial:
            for (let i = 0; i < allKeys.length; i++) {
                const rawKey = allKeys[i];
                const keyLabel = `Key ${i + 1}`;
                const projectID = rawKey.substring(0, 12); // Identify unique projects by key prefix

                if (quotaBlockedProjects.has(projectID)) {
                    addSocialLog(`Skipping ${keyLabel} (Project already at quota)...`);
                    continue;
                }

                const decodedKey = typeof decodeApiKey === 'function' ? decodeApiKey(rawKey) : rawKey;
                const keyType = rawKey.startsWith('AIza') ? 'Raw' : 'Decoded';

                // Debug logging (Developer console only)
                console.log(`AI: ${keyLabel} length: ${decodedKey.length}, starts with: ${decodedKey.substring(0, 4)}`);

                for (const model of modelsToTry) {
                    for (const apiVer of ['v1beta', 'v1']) {
                        addSocialLog(`Attempting ${model} (${apiVer}) with ${keyLabel} (${keyType})...`);

                        try {
                            const controller = new AbortController();
                            const timeoutId = setTimeout(() => controller.abort(), 45000);

                            const response = await fetch(`https://generativelanguage.googleapis.com/${apiVer}/models/${model}:generateContent?key=${decodedKey}`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                signal: controller.signal,
                                body: JSON.stringify({
                                    contents: [{ parts: [{ text: prompt }] }]
                                })
                            });
                            clearTimeout(timeoutId);

                            if (response.ok) {
                                const data = await response.json();
                                if (data.candidates && data.candidates[0].content) {
                                    output.value = data.candidates[0].content.parts[0].text.trim();
                                    addSocialLog(`âœ… Success with ${keyLabel}!`, 'success');
                                    success = true;
                                    break outerLoopSocial;
                                }
                            } else {
                                const errText = await response.text();
                                let errData = {};
                                try { errData = JSON.parse(errText); } catch (e) { }

                                const errMsg = errData.error?.message || errText.substring(0, 50) || 'Unknown';
                                addSocialLog(`âŒ ${keyLabel}: ${response.status} - ${errMsg}`, 'error');
                            }
                        } catch (e) {
                            addSocialLog(`âŒ ${keyLabel}: ${e.name === 'AbortError' ? 'Timeout' : e.message}`, 'error');
                        }
                    }
                }
            }

            if (!success) {
                addSocialLog(`âš ï¸ Direct attempts failed. Trying GAS Fallback with ${allKeys.length} keys...`);

                for (let k = 0; k < allKeys.length; k++) {
                    const rawKey = allKeys[k];
                    const keyLabel = `Key ${k + 1}`;
                    const projectID = rawKey.substring(0, 12);

                    if (quotaBlockedProjects.has(projectID)) {
                        addSocialLog(`Skipping GAS Fallback for ${keyLabel} (Project already at quota)...`);
                        continue;
                    }

                    const gasKey = typeof decodeApiKey === 'function' ? decodeApiKey(rawKey) : rawKey;

                    for (const model of modelsToTry) {
                        addSocialLog(`Attempting GAS Fallback with ${keyLabel} (${model})...`);

                        try {
                            const gasController = new AbortController();
                            const gasTimeout = setTimeout(() => gasController.abort(), 50000);
                            const response = await fetch(GAS_FALLBACK_URL, {
                                method: 'POST',
                                mode: 'cors',
                                redirect: 'follow',
                                signal: gasController.signal,
                                headers: { 'Content-Type': 'text/plain' },
                                body: JSON.stringify({
                                    action: 'proxyGemini',
                                    payload: {
                                        key: gasKey,
                                        model: model,
                                        data: { contents: [{ parts: [{ text: prompt }] }] }
                                    }
                                })
                            });
                            clearTimeout(gasTimeout);

                            if (response.ok) {
                                const rawText = await response.text();
                                let data;
                                try { data = JSON.parse(rawText); } catch (pe) {
                                    addSocialLog(`âŒ GAS Fallback (${keyLabel}): Bad JSON.`, 'error');
                                    continue;
                                }

                                if (!data.gasVersion || data.gasVersion !== '5.2.0') {
                                    addSocialLog(`ðŸ›‘ CRITICAL: Your Google Script (GAS) is OUTDATED. Please update to version 5.2.0.`, 'error');
                                }

                                if (data && data.candidates && data.candidates[0].content) {
                                    output.value = data.candidates[0].content.parts[0].text.trim();
                                    addSocialLog(`âœ… GAS Fallback Success with ${keyLabel}!`, 'success');
                                    success = true;
                                    return; // Successfully finished
                                } else if (data && data.error) {
                                    const gasErrMsg = data.error.message || 'Unknown';
                                    const isQuota = gasErrMsg.toLowerCase().includes('quota') || data.error.code === 429;

                                    if (isQuota) {
                                        addSocialLog(`âŒ GAS Fallback (${keyLabel}): Quota reached for this project.`, 'error');
                                        quotaBlockedProjects.add(projectID);
                                        await new Promise(r => setTimeout(r, 1000));
                                    } else {
                                        addSocialLog(`âŒ GAS Fallback (${keyLabel}): ${gasErrMsg}`, 'error');
                                    }
                                }
                            } else {
                                const errBody = await response.text().catch(() => '');
                                addSocialLog(`âŒ GAS Fallback (${keyLabel}): ${response.status} ${errBody.substring(0, 30)}`, 'error');
                            }
                        } catch (e) {
                            addSocialLog(`âŒ GAS Fallback (${keyLabel}): ${e.message}`, 'error');
                        }
                    }
                }
            }

            if (!success) throw new Error("All optimized AI attempts failed/timed out.");

        } catch (e) {
            output.value = "Error: " + e.message;
        } finally {
            newBtn.disabled = false;
            newBtn.innerHTML = originalText;
            if (window.lucide) lucide.createIcons();
        }
    });
};

// --- Upload Extra Images ---
window.initUploadImages = async function () {
    console.log("Initializing Upload Images...");
    const select = document.getElementById('upload-product-select');
    const btn = document.getElementById('upload-images-btn');
    const input = document.getElementById('extra-images-input');
    const status = document.getElementById('upload-status');

    if (!select || !btn) return;

    // Load products if not loaded
    let products = window.allProducts;
    if (!products || products.length === 0) {
        try {
            await initProductData();
            products = window.allProducts;
        } catch (e) { console.error("Error loading products for upload", e); return; }
    }

    // Setup Custom Dropdown
    window.setupCustomProductDropdown({
        inputId: 'upload-product-search',
        dropdownId: 'upload-product-dropdown',
        onSelect: (id) => {
            select.value = id; // Update hidden input
        }
    });

    // Remove old listeners
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);

    newBtn.addEventListener('click', async () => {
        const productNo = select.value;
        const files = input.files;

        if (!productNo) { alert("Please select a product."); return; }
        if (files.length === 0) { alert("Please select at least one image."); return; }

        newBtn.disabled = true;
        newBtn.innerHTML = '<span>Uploading... â³</span>';
        status.textContent = "Starting upload...";
        status.style.color = "var(--text-secondary)";

        let successCount = 0;
        let errors = [];

        try {
            const gasUrl = window.GAS_URL || document.getElementById('google-script-url')?.value.trim() || 'https://script.google.com/macros/s/AKfycby-F1rqwiv6aneRtEL0ZV3lB8tOUQ64ckECuZDM7tXbzp85xxz6vyNvvvc718SNVjdVyQ/exec';

            // Get existing image count from data if available
            const product = window.allProducts.find(p => String(p['No'] || p['item_no']) === productNo);
            const startOffset = (product && product.image_count) ? parseInt(product.image_count) : 0;

            const toBase64 = file => new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.readAsDataURL(file);
                reader.onload = () => resolve(reader.result.split(',')[1]);
                reader.onerror = error => reject(error);
            });

            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const ext = file.name.split('.').pop() || 'jpg';
                const nextIndex = startOffset + i + (startOffset === 0 ? 1 : 0);
                const newFileName = `${productNo}_${nextIndex}.${ext}`;

                status.textContent = `Uploading ${i + 1}/${files.length}...`;

                const base64Image = await toBase64(file);

                // Send to GAS
                const res = await fetch(gasUrl, {
                    method: 'POST',
                    mode: 'cors',
                    redirect: 'follow', // Important for GAS
                    headers: { 'Content-Type': 'text/plain' }, // Avoid preflight issues
                    body: JSON.stringify({
                        action: 'uploadImage',
                        imageName: newFileName,
                        image: base64Image,
                        mimeType: file.type,
                        productNo: productNo
                    })
                });

                if (res.ok) {
                    const json = await res.json().catch(() => ({}));
                    if (json.status === 'success' || json.status === 'warning') {
                        successCount++;
                    } else {
                        errors.push(json.error || json.message || "Failed");
                    }
                } else {
                    errors.push(res.statusText);
                }
            }

            if (successCount === files.length) {
                status.textContent = `âœ… All ${files.length} images uploaded!`;
                status.style.color = "#34d399";
                input.value = ""; // Clear selection
            } else if (successCount > 0) {
                status.textContent = `âš ï¸ Uploaded ${successCount}/${files.length}. Errors: ${errors.join(', ')}`;
                status.style.color = "#f59e0b";
            } else {
                throw new Error(errors.join(', ') || "All uploads failed");
            }

        } catch (e) {
            console.error("Upload failed", e);
            status.textContent = "âŒ Error: " + e.message;
            status.style.color = "#f87171";
        } finally {
            newBtn.disabled = false;
            newBtn.innerHTML = '<span>Upload Images</span><i data-lucide="upload-cloud"></i>';
            if (window.lucide) lucide.createIcons();
        }
    });

};

// --- End Init ---

// --- Loading Helpers ---
function loadPendingChanges() {
    try {
        const stored = localStorage.getItem('admin_pending_changes');
        if (stored) {
            window.pendingChanges = JSON.parse(stored);
            // Cleanup expired (older than 10 mins)
            const now = Date.now();
            Object.keys(window.pendingChanges).forEach(id => {
                if (now - window.pendingChanges[id].timestamp > 600000) {
                    delete window.pendingChanges[id];
                }
            });
        } else {
            window.pendingChanges = {};
        }
    } catch (e) {
        window.pendingChanges = {};
    }
}

function savePendingChanges() {
    localStorage.setItem('admin_pending_changes', JSON.stringify(window.pendingChanges));
}

loadPendingChanges();

window.commitOrderToGithub = async function(order) {
    const token = localStorage.getItem('github_token');
    if (!token) return { success: false, error: "No GitHub token found in settings." };

    const repo = "3omarhs/crtv-rarities-products";
    const path = "data/orders.csv";
    const apiUrl = `https://api.github.com/repos/${repo}/contents/${path}`;

    try {
        console.log("Direct GitHub Commit: Fetching current orders.csv...");
        const res = await fetch(apiUrl, {
            headers: { 'Authorization': `token ${token}` }
        });
        if (!res.ok) throw new Error("Could not fetch file metadata from GitHub.");
        const fileData = await res.json();
        const content = atob(fileData.content);
        const sha = fileData.sha;

        // Append order to content
        const itemsStr = JSON.stringify(order.items).replace(/"/g, '""');
        const newRow = `"${order.address || ''}","${order.currency || ''}","${order.customerName || ''}","${order.customerPhone || ''}","${order.date || ''}","${order.id || ''}","${itemsStr}","${order.method || ''}","${order.paymentMethod || ''}","${order.selectedCompany || ''}","${order.selectedRegion || ''}","${order.status || ''}","${Math.floor(order.timestamp)}","${order.total || ''}","${order.calculate_delivery}","${order.delivery_fee || 0}"\n`;
        
        const updatedContent = content.endsWith('\n') ? content + newRow : content + '\n' + newRow;

        console.log("Direct GitHub Commit: Pushing update...");
        const putRes = await fetch(apiUrl, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: `Add order ${order.id} [Direct Admin Commit]`,
                content: btoa(unescape(encodeURIComponent(updatedContent))),
                sha: sha
            })
        });

        if (putRes.ok) {
            console.log("Direct GitHub Commit: SUCCESS.");
            return { success: true };
        } else {
            const errJson = await putRes.json();
            throw new Error(errJson.message || "GitHub API error");
        }
    } catch (e) {
        console.error("Direct GitHub Commit FAILED:", e);
        return { success: false, error: e.message };
    }
};

function showLoading(title = "Processing...", msg = "Please wait while we sync changes...") {
    let modal = document.getElementById('loading-modal');
    if (!modal) {
        console.log("Admin: Loading modal missing from HTML, creating dynamically...");
        modal = document.createElement('div');
        modal.id = 'loading-modal';
        modal.className = 'modal-overlay hidden';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="spinner"></div>
                <h3 id="loading-title" style="color:white; margin-bottom:0.5rem;"></h3>
                <p id="loading-msg" style="color:var(--text-secondary); margin:0;"></p>
            </div>
        `;
        document.body.appendChild(modal);
    }

    const titleEl = document.getElementById('loading-title');
    const msgEl = document.getElementById('loading-msg');
    if (titleEl) titleEl.innerText = title;
    if (msgEl) msgEl.innerText = msg;
    
    modal.classList.remove('hidden');
    modal.classList.add('open');
    modal.style.display = 'flex'; // Force visibility
}

function hideLoading() {
    const modal = document.getElementById('loading-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('open');
        modal.style.display = 'none';
    }
}

// --- End Loading Helpers ---

function showDashboard() {
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('admin-dashboard').classList.remove('hidden');
    loadData();
    initProductData();

    // Auto-refresh stats every 60 seconds while on dashboard
    if (window.dashboardInterval) clearInterval(window.dashboardInterval);
    window.dashboardInterval = setInterval(() => {
        const stats = document.getElementById('dashboard-stats');
        // Check if the dashboard is still visible before refreshing
        if (stats && stats.style.display !== 'none' && !document.getElementById('loading-modal').classList.contains('open')) {
            console.log("Auto-refreshing dashboard stats...");
            loadData();
        }
    }, 60000);
}


window.currentOrders = [];
window.currentVisits = { total: 0, daily: {} };

async function loadData() {
    console.log("Admin: loadData called");

    try {
        const gasUrl = window.GAS_URL || 'https://script.google.com/macros/s/AKfycby-F1rqwiv6aneRtEL0ZV3lB8tOUQ64ckECuZDM7tXbzp85xxz6vyNvvvc718SNVjdVyQ/exec';

        // 1. Fetch Orders from GAS or Fallback API
        let ordersData = await fetchOrders(gasUrl);
        let orders = ordersData.data || ordersData || [];
        if (!Array.isArray(orders)) orders = [];

        // --- UNIFIED ORDER ITEM PARSING (v5.1.3.1) ---
        orders.forEach(o => {
            if (typeof o.items === 'string') {
                try {
                    // Try parsing as JSON first (Supabase JSONB sometimes returns as stringified array)
                    if (o.items.trim().startsWith('[') || o.items.trim().startsWith('{')) {
                        o.items = JSON.parse(o.items);
                    }
                } catch (e) {
                    // Not JSON, fallback to split string (legacy CSV format)
                    if (typeof o.items === 'string') {
                        o.items = o.items.split('|').map(s => s.trim()).filter(Boolean);
                    }
                }

                // If it successfully parsed or didn't throw, but is still a string (e.g. didn't start with [ or {)
                if (typeof o.items === 'string') {
                    o.items = o.items.split('|').map(s => s.trim()).filter(Boolean);
                }
            }

            // Ensure o.items is an array for consistent consumption
            if (o.items && !Array.isArray(o.items)) {
                o.items = [o.items];
            }

            // Pre-parse the members of the array into objects if they are strings
            if (Array.isArray(o.items)) {
                o.items = o.items.map(item => {
                    if (typeof item === 'string') return parseItemString(item);
                    return item; // Already an object
                });
            } else {
                o.items = []; // Fallback
            }
        });

        window.currentOrders = orders;

        // 2. Fetch Visits from GAS or Fallback API
        let visitsData = await fetchVisits(gasUrl);
        window.currentVisits = visitsData || { total: 0, daily: {}, today: 0 };

        renderDashboardStats(window.currentOrders, window.currentVisits);

        if (window.Chart) initDashboard(window.currentOrders, window.currentVisits);

    } catch (e) {
        console.error("Admin: Global fetch error", e);
    }
}

async function fetchOrders(GAS_URL) {
    let allOrders = [];
    try {
        console.log("Admin: Fetching orders from GitHub CSV...");
        const res = await fetch('https://raw.githubusercontent.com/3omarhs/crtv-rarities-products/main/data/orders.csv?v=' + Date.now());
        if (res.ok) {
            const csvText = await res.text();
            Papa.parse(csvText, {
                header: true,
                skipEmptyLines: true,
                complete: function (results) {
                    // Re-apply any pending changes that might not be in the CSV yet (GitHub Pages delay)
                loadPendingChanges(); // Refresh from storage
                
                results.data.forEach(o => {
                    const id = String(o.id || o.ID || o.No || "");
                    if (window.pendingChanges[id]) {
                        const pc = window.pendingChanges[id];
                        if (Date.now() - pc.timestamp < 300000) { // 5 minute grace period for GH Pages
                            Object.assign(o, pc.data);
                        } else {
                            delete window.pendingChanges[id];
                        }
                    }
                });

                // Add completely new orders that haven't synced to CSV yet
                Object.values(window.pendingChanges).forEach(pc => {
                    if (pc.isNew && (Date.now() - pc.timestamp < 300000)) {
                        // Only add if not already in the CSV
                        if (!results.data.find(o => String(o.id) === String(pc.data.id))) {
                            results.data.push(pc.data);
                        }
                    }
                });

                // Merge Supabase orders to ensure newly created orders are never lost on refresh
                if (window.supabaseClient) {
                    try {
                        const { data: supabaseOrders, error } = await window.supabaseClient
                            .from('orders')
                            .select('*')
                            .order('timestamp', { ascending: false })
                            .limit(100);
                            
                        if (supabaseOrders && !error) {
                            supabaseOrders.forEach(so => {
                                const exists = results.data.find(o => String(o.id) === String(so.id));
                                if (!exists) {
                                    // Make sure items is a string if it's an array, to match CSV format
                                    if (Array.isArray(so.items)) so.items = JSON.stringify(so.items);
                                    results.data.push(so);
                                }
                            });
                        }
                    } catch (e) {
                        console.warn("Admin: Supabase merge failed", e);
                    }
                }

                savePendingChanges();

                allOrders = results.data;
                }
            });
        }
    } catch (e) {
        console.warn("Admin: CSV orders fetch failed", e);
    }
    allOrders.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
    return allOrders;
}



function getLocalDateStr() {
    const today = new Date();
    const offset = today.getTimezoneOffset() * 60000;
    return new Date(today.getTime() - offset).toISOString().split('T')[0];
}

async function fetchVisits(GAS_URL) {
    let total = 0, daily = {}, dailyLogs = {}, todayCount = 0;
    const localDate = getLocalDateStr();
    try {
        const res = await fetch('https://raw.githubusercontent.com/3omarhs/crtv-rarities-products/main/data/visits.csv?v=' + Date.now());
        if (res.ok) {
            const csvText = await res.text();
            Papa.parse(csvText, {
                header: true, skipEmptyLines: true,
                complete: function (results) {
                    results.data.forEach(row => {
                        const count = parseInt(row.count, 10) || 0;
                        total += count; daily[row.date] = count;
                        if (row.date === localDate) todayCount = count;
                    });
                }
            });
        }
        const logsRes = await fetch('https://raw.githubusercontent.com/3omarhs/crtv-rarities-products/main/data/visit_logs.csv?v=' + Date.now());
        if (logsRes.ok) {
            const logsText = await logsRes.text();
            Papa.parse(logsText, {
                header: true, skipEmptyLines: true,
                complete: function (results) {
                    results.data.forEach(row => {
                        if (!dailyLogs[row.date]) dailyLogs[row.date] = [];
                        dailyLogs[row.date].push(row.deviceName);
                    });
                }
            });
        }
    } catch (e) { console.warn("Admin: Visits fetch failed", e); }
    return { total, daily, today: todayCount, dailyLogs };
}

function getTodayStr() {
    return getLocalDateStr();
}

window.renderDeviceLogs = function (visitsData) {
    const today = getTodayStr();
    const logs = (visitsData && visitsData.dailyLogs) ? visitsData.dailyLogs[today] : [];

    const body = document.getElementById('device-list-body');
    if (!body) return;

    body.innerHTML = '';

    if (!logs || logs.length === 0) {
        body.innerHTML = '<tr><td colspan="3" style="text-align:center; color:var(--text-secondary)">No device data for today yet.</td></tr>';
    } else {
        const counts = {};
        logs.forEach(d => counts[d] = (counts[d] || 0) + 1);

        Object.keys(counts).sort((a, b) => counts[b] - counts[a]).forEach(device => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${device}</td>
                <td>${counts[device]}</td>
                <td><button class="btn-icon" onclick="copyToClipboard('${device}')"><i data-lucide="copy"></i></button></td>
            `;
            body.appendChild(tr);
        });
    }
    if (window.lucide) lucide.createIcons();
};

function openModal(id) {
    const m = document.getElementById(id);
    if (m) {
        m.classList.add('open');
        m.classList.remove('hidden');
    }
}

window.closeModal = function (id) {
    const m = document.getElementById(id);
    if (m) {
        m.classList.remove('open');
        m.classList.add('hidden');
    }
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        alert("Copied to clipboard: " + text);
    });
}



function renderDashboardStats(orders, visitsData) {
    if (!orders) orders = [];
    if (!visitsData) visitsData = { total: 0, daily: {}, today: 0, dailyLogs: {} };

    // 1. Visits
    document.getElementById('stat-visits').textContent = visitsData.total || 0;

    // Calculate Today's Visits
    let todayVisits = visitsData.today || 0;

    document.getElementById('stat-visits-today').textContent = todayVisits;

    // 2. Orders Count
    document.getElementById('stat-orders').textContent = orders.length;

    // 3. Revenue
    let revenue = 0;
    orders.forEach(o => {
        if (o.status === 'Closed') {
            // Calculate items subtotal from the parsed items array (robust calculation)
            let itemsSubtotal = 0;
            if (Array.isArray(o.items)) {
                o.items.forEach(item => {
                    const priceVal = parseFloat(String(item.price || '0').replace(/[^\d.]/g, '')) || 0;
                    const qtyVal = parseInt(item.qty || item.quantity) || 0;
                    itemsSubtotal += priceVal * qtyVal;
                });
            }

            let thisRevenue = itemsSubtotal;

            // Only add delivery fee to revenue if "Fee" is explicitly checked (true)
            if (String(o.calculate_delivery || '').toLowerCase() === 'true') {
                const totalAmt = parseFloat(String(o.total || '0').replace(/[^\d.]/g, '')) || 0;
                // If total is greater than items, the difference is the delivery fee
                const inferredDelFee = Math.max(0, totalAmt - itemsSubtotal);
                thisRevenue += inferredDelFee;
            }

            revenue += thisRevenue;
        }
    });
    document.getElementById('stat-revenue').textContent = revenue.toFixed(3) + ' JOD';

    // 4. Render Activity Log, List & Analytics
    renderActivityLog(orders);
    renderOrdersTable(orders);
    renderAnalytics(orders);

    // 5. Render Visitor Devices
    renderDeviceLogs(visitsData);
}

function renderActivityLog(orders) {
    const logBody = document.getElementById('activity-log');
    if (!logBody) return;
    logBody.innerHTML = '';
    const recentOrders = [...orders].reverse().slice(0, 5);
    recentOrders.forEach(o => {
        const tr = document.createElement('tr');
        const customerName = o.customerName || o.customername || 'Anonymous';
        const total = o.total || '0';
        tr.innerHTML = `
            <td><span style="color:var(--success)">New Order</span></td>
            <td>${customerName} - ${total}</td>
            <td style="color:var(--text-secondary); font-size:0.85rem">${new Date(o.date || o.timestamp).toLocaleTimeString()}</td>
        `;
        logBody.appendChild(tr);
    });
}

function renderOrdersTable(orders) {
    const ordersBody = document.getElementById('orders-table-body');
    if (!ordersBody) return;
    ordersBody.innerHTML = '';
    [...orders].reverse().forEach(o => {
        const tr = document.createElement('tr');
        tr.className = 'order-row';
        const idStr = String(o.id);
        const detailsId = `details-${o.id}`;

        // Handle case-sensitivity from Supabase/SQL
        const customerName = o.customerName || o.customername || o.customerName || 'Anonymous';
        const customerPhone = o.customerPhone || o.customerphone || o.customerPhone || '-';

        tr.onclick = (e) => {
            if (e.target.tagName === 'SELECT') return;
            toggleDetails(detailsId);
        };

        tr.innerHTML = `
            <td style="font-family:monospace">#${idStr}</td>
            <td>${customerName}<br><span style="font-size:0.8em;color:grey">${customerPhone}</span></td>

            <td>${o.items ? o.items.length : 0} Items</td>
            <td>${o.total}</td>
            <td onclick="event.stopPropagation()">
                <input type="date" value="${o.date ? new Date(o.date).toISOString().split('T')[0] : ''}" 
                    onchange="window.updateOrderDate('${idStr}', this.value)"
                    style="background: transparent; border: 1px solid var(--border); color: var(--text-main); font-family: inherit; font-size: 0.85rem; padding: 2px 4px; border-radius: 4px; cursor: pointer; width: 125px;">
            </td>
            <td>
                <div style="display:flex; align-items:center;">
                    <div title="Delivery Fee Toggled">
                        <label style="display: flex; align-items: center; gap: 4px; font-size: 0.85rem; cursor: pointer; color: var(--text-muted);">
                            <input type="checkbox" onclick="event.stopPropagation(); window.toggleDeliveryCalc(event, '${idStr}')" 
                                ${String(o.calculate_delivery).toLowerCase() === 'true' ? 'checked' : ''} 
                                style="accent-color: var(--primary); width: 14px; height: 14px; cursor: pointer;">
                            <span>Fee</span>
                        </label>
                    </div>
                    ${renderStatusSelect(o.id, o.status || 'Placed')}
                    <button class="btn-icon" onclick="event.stopPropagation(); window.deleteOrder('${idStr}')" title="Delete Order" style="color:var(--danger); padding:4px; margin-left:8px; border-radius:50%; width:28px; height:28px; display:flex; align-items:center; justify-content:center;">
                        <i data-lucide="trash-2" style="width:16px;height:16px;"></i>
                    </button>
                </div>
            </td>
        `;
        ordersBody.appendChild(tr);

        // Details Row
        const detailsTr = document.createElement('tr');
        detailsTr.id = detailsId;
        detailsTr.className = 'expanded-row hidden';

        let itemsHtml = renderOrderItems(o.items);
        let infoSection = renderOrderInfo(o);

        detailsTr.innerHTML = `
            <td colspan="6">
                <div class="expanded-container">
                    <div class="items-grid">
                        ${itemsHtml}
                    </div>
                    ${infoSection}
                </div>
            </td>
        `;
        ordersBody.appendChild(detailsTr);
    });

    if (window.lucide) lucide.createIcons();
}

function renderOrderItems(items) {
    if (!items || !Array.isArray(items)) return '';
    return items.map(itemStr => {
        const i = parseItemString(itemStr);
        // Image Logic
        let imgHtml = '';
        if (window.DRIVE_MAPPING && window.DRIVE_MAPPING[i.sku]) {
            const driveId = window.DRIVE_MAPPING[i.sku];
            imgHtml = `<img src="https://lh3.googleusercontent.com/d/${driveId}" class="item-image" loading="lazy">`;
        } else {
            imgHtml = `<img src="${ASSETS_BASE_URL}${i.sku}.png" class="item-image" loading="lazy" onerror="handleAdminImageError(this, '${i.sku}')">`;
        }
        const safeSku = i.sku.replace(/"/g, '&quot;');
        return `
            <div class="item-tile" data-sku="${safeSku}" title="Click for Details" onclick="window.handleItemClick(this, event)">
                ${imgHtml}
                <div class="item-info">
                    <div class="item-header">
                        <span class="item-sku">${i.sku}</span>
                        <span class="item-qty">x${i.qty}</span>
                    </div>
                    <div class="item-name">${i.name}</div>
                    <div class="item-details">
                         <span class="item-detail-badge" style="color:#94a3b8">${i.color}</span>
                         <span class="item-detail-badge" style="margin-left:auto; color:var(--success)">${i.price} JOD</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function renderOrderInfo(o) {
    // Dynamically calculate delivery cost if not explicitly saved
    let calculatedDelivery = 0;
    if (o.deliveryCost !== undefined && o.deliveryCost !== null) {
        calculatedDelivery = parseFloat(String(o.deliveryCost).replace(/[^\d.]/g, '')) || 0;
    } else if (o.items && Array.isArray(o.items)) {
        let itemsTotal = 0;
        o.items.forEach(itemInfo => {
            // itemInfo could be string or object depending on parseItemString mapping
            const i = typeof itemInfo === 'string' ? parseItemString(itemInfo) : itemInfo;
            const itemPrice = parseFloat(String(i.price).replace(/[^\d.]/g, '')) || 0;
            const itemQty = parseInt(i.qty) || 1;
            itemsTotal += itemPrice * itemQty;
        });
        const orderTotal = parseFloat(String(o.total).replace(/[^\d.]/g, '')) || 0;
        calculatedDelivery = orderTotal - itemsTotal;
        if (calculatedDelivery < 0) calculatedDelivery = 0;
    }

    const deliveryCostDisplay = (Math.round(calculatedDelivery * 1000) / 1000).toFixed(3);

    return `
        <div class="order-info-grid">
            <div class="info-group">
                <label>Delivery Method</label>
                <span>${o.method === 'pickup' ? 'Pickup' : 'Delivery'}</span>
            </div>
            ${o.method !== 'pickup' ? `
            <div class="info-group">
                <label>Region & Company</label>
                <span>${o.selectedRegion || '-'} / ${o.selectedCompany || '-'}</span>
            </div>
            ` : ''}
            <div class="info-group">
                <label>Address</label>
                <span>${o.address || '-'}</span>
            </div>
             <div class="info-group">
                <label>Payment</label>
                <span>${o.paymentMethod || '-'}</span>
            </div>
            <div class="info-group">
                <label>Delivery Cost</label>
                <span>${deliveryCostDisplay} JOD</span>
            </div>
            <div class="info-group">
                <label>Currency</label>
                <span>${o.currency || 'JOD'}</span>
            </div>
        </div>
    `;
}

function renderAnalytics(orders) {
    const itemMap = {};
    orders.forEach(o => {
        // o.items is already pre-parsed into objects by loadData() in v5.1.3.1
        if (o.items && Array.isArray(o.items)) {
            o.items.forEach(i => {
                if (!itemMap[i.sku]) {
                    itemMap[i.sku] = { id: i.sku, name: i.name, qty: 0, rev: 0 };
                }
                itemMap[i.sku].qty += parseInt(i.qty || 1);
                itemMap[i.sku].rev += (parseFloat(i.price || 0) * parseInt(i.qty || 1));
            });
        }
    });

    const analyticsBody = document.getElementById('item-analytics-body');
    if (!analyticsBody) return;
    analyticsBody.innerHTML = '';
    Object.values(itemMap).sort((a, b) => b.qty - a.qty).forEach(i => {
        const tr = document.createElement('tr');
        let imgHtml = `<img src="${ASSETS_BASE_URL}${i.id}.jpg" onerror="this.style.display='none'" style="width:50px; height:50px; object-fit:cover; border-radius:8px;">`;
        tr.innerHTML = `
            <td>${imgHtml}</td>
            <td style="font-family:monospace">${i.id}</td>
            <td>${i.name}</td>
            <td>${i.qty}</td>
            <td>${i.rev.toFixed(3)} JOD</td>
        `;
        analyticsBody.appendChild(tr);
    });
}







// --- Dashboard Charts Logic ---
let revenueChartInstance = null;
let visitsChartInstance = null;
let topProductsChartInstance = null;
let regionChartInstance = null;
let paymentChartInstance = null;

function initDashboard(orders, visitsData) {
    if (!orders) orders = [];

    // 1. Process Data for Revenue Trend (Group by Date)
    const dateMap = {};
    orders.forEach(o => {
        let dateStr = 'Unknown';
        // Prefer timestamp (seconds)
        if (o.timestamp) {
            dateStr = new Date(o.timestamp * 1000).toLocaleDateString();
        } else if (o.date) {
            dateStr = new Date(o.date).toLocaleDateString();
        }

        // Clean Amount
        const amt = parseFloat(String(o.total || '0').replace(/[^\d.]/g, ''));
        if (!isNaN(amt)) {
            if (!dateMap[dateStr]) dateMap[dateStr] = 0;
            dateMap[dateStr] += amt;
        }
    });

    // Visits Data Preparation - Fix for key mismatch
    // Check for 'daily' (visits.json format) or fallback to 'history'
    const dailyVisits = visitsData?.daily || visitsData?.history || {};
    const visitDates = Object.keys(dailyVisits).sort((a, b) => new Date(a) - new Date(b));
    const visitCounts = visitDates.map(d => dailyVisits[d]);

    // Calculate Totals for Stat Cards
    if (visitsData && visitsData.total !== undefined) {
        const totalVisitsEl = document.getElementById('stat-visits');
        if (totalVisitsEl) totalVisitsEl.textContent = visitsData.total;
    }

    // Calculate Today's Visits (Rely on server calculation to avoid Timezone mismatches)
    let visitsToday = 0;
    if (visitsData && visitsData.today !== undefined) {
        visitsToday = visitsData.today;
    } else {
        const now = new Date();
        const todayStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
        const match = Object.entries(dailyVisits).find(([k, v]) => k.trim() === todayStr);
        if (match) visitsToday = match[1];
    }

    const visitsTodayEl = document.getElementById('stat-visits-today');
    if (visitsTodayEl) visitsTodayEl.textContent = visitsToday;


    if (visitDates.length > 0) {
        // Render Visits Chart
        const ctxVisits = document.getElementById('visitsChart');
        if (ctxVisits) {
            if (visitsChartInstance) visitsChartInstance.destroy();
            visitsChartInstance = new Chart(ctxVisits, {
                type: 'line',
                data: {
                    labels: visitDates,
                    datasets: [{
                        label: 'Visits',
                        data: visitCounts,
                        borderColor: '#f97316', // Orange
                        backgroundColor: 'rgba(249, 115, 22, 0.1)',
                        tension: 0.4,
                        fill: true
                    }]
                },
                options: {
                    responsive: true,
                    plugins: { legend: { display: false } },
                    scales: {
                        x: { grid: { color: '#2d2d35' }, ticks: { color: '#94a3b8' } },
                        y: { grid: { color: '#2d2d35' }, ticks: { color: '#94a3b8', beginAtZero: true, precision: 0 } }
                    }
                }
            });
        }
    }


    const sortedDates = Object.keys(dateMap).sort((a, b) => new Date(a) - new Date(b));
    const revenueData = sortedDates.map(d => dateMap[d]);

    // 2. Render Revenue Chart
    const ctxRev = document.getElementById('revenueChart');
    if (ctxRev) {
        if (revenueChartInstance) revenueChartInstance.destroy();
        revenueChartInstance = new Chart(ctxRev, {
            type: 'line',
            data: {
                labels: sortedDates,
                datasets: [{
                    label: 'Revenue (JOD)',
                    data: revenueData,
                    borderColor: '#6d28d9',
                    backgroundColor: 'rgba(109, 40, 217, 0.1)',
                    tension: 0.4,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                plugins: { legend: { display: false } },
                scales: {
                    x: { grid: { color: '#2d2d35' }, ticks: { color: '#94a3b8' } },
                    y: { grid: { color: '#2d2d35' }, ticks: { color: '#94a3b8' } }
                }
            }
        });
    }

    // 3. Process Top Products
    const prodMap = {};
    orders.forEach(o => {
        // o.items is already pre-parsed into objects by loadData() in v5.1.3.1
        if (o.items) {
            o.items.forEach(item => {
                let name = item.id || item.sku || item.name || 'Unknown';
                let qty = parseInt(item.qty || 1);

                if (!prodMap[name]) prodMap[name] = 0;
                prodMap[name] += qty;
            });
        }
    });

    const sortedProds = Object.entries(prodMap).sort((a, b) => b[1] - a[1]).slice(0, 5);

    // 4. Render Top Products Chart
    const ctxProd = document.getElementById('topProductsChart');
    if (ctxProd) {
        if (topProductsChartInstance) topProductsChartInstance.destroy();
        topProductsChartInstance = new Chart(ctxProd, {
            type: 'bar',
            data: {
                labels: sortedProds.map(p => p[0]), // Show full SKU, no truncation
                datasets: [{
                    label: 'Units Sold',
                    data: sortedProds.map(p => p[1]),
                    backgroundColor: '#10b981',
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                plugins: { legend: { display: false } },
                scales: {
                    x: { grid: { display: false }, ticks: { color: '#94a3b8' } },
                    y: {
                        grid: { color: '#2d2d35' },
                        ticks: {
                            color: '#94a3b8',
                            precision: 0,
                            stepSize: 1
                        }
                    }
                }
            }
        });
    }

    // 5. Region Distribution
    const regionMap = {};
    orders.forEach(o => {
        let reg = o.selectedRegion;

        // Handle Pickup
        if (o.method === 'pickup') {
            reg = 'Pickup';
        }
        // Handle missing/empty region
        else if (!reg || reg.trim() === '') {
            reg = 'Unknown';
        }

        reg = reg.trim();
        if (!regionMap[reg]) regionMap[reg] = 0;
        regionMap[reg]++;
    });

    const ctxReg = document.getElementById('regionChart');
    if (ctxReg) {
        if (regionChartInstance) regionChartInstance.destroy();
        regionChartInstance = new Chart(ctxReg, {
            type: 'doughnut',
            data: {
                labels: Object.keys(regionMap),
                datasets: [{
                    data: Object.values(regionMap),
                    backgroundColor: ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981'],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                plugins: { legend: { position: 'right', labels: { color: '#94a3b8' } } }
            }
        });
    }

    // 6. Payment Methods
    const payMap = {};
    orders.forEach(o => {
        const method = o.paymentMethod || 'Cash On Delivery';
        if (!payMap[method]) payMap[method] = 0;
        payMap[method]++;
    });

    const ctxPay = document.getElementById('paymentChart');
    if (ctxPay) {
        if (paymentChartInstance) paymentChartInstance.destroy();
        paymentChartInstance = new Chart(ctxPay, {
            type: 'pie',
            data: {
                labels: Object.keys(payMap),
                datasets: [{
                    data: Object.values(payMap),
                    backgroundColor: ['#6366f1', '#14b8a6', '#f43f5e'],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                plugins: { legend: { position: 'right', labels: { color: '#94a3b8' } } }
            }
        });
    }
}


// --- Order Status Logic ---
function renderStatusSelect(id, currentStatus) {
    const options = ['Placed', 'Preparing', 'Delivery', 'Not Paid', 'Closed', 'Canceled', 'Ignored'];
    const colorMap = {
        'Placed': '#3b82f6',     // Blue
        'Preparing': '#f59e0b',  // Orange
        'Delivery': '#8b5cf6',   // Purple
        'Not Paid': '#ec4899',   // Pink
        'Closed': '#10b981',     // Green
        'Canceled': '#ef4444',   // Red
        'Ignored': '#64748b'     // Gray
    };

    // Fallback for unknown status
    const color = colorMap[currentStatus] || '#3b82f6';

    let opts = options.map(opt => `<option value="${opt}" ${opt === currentStatus ? 'selected' : ''}>${opt}</option>`).join('');

    return `<select onchange="window.updateOrderStatus('${id}', this.value)" 
            style="background: ${color}20; color: ${color}; border: 1px solid ${color}; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-weight: 500;">
            ${opts}
            </select>`;
}


window.updateOrderStatus = async function (id, newStatus) {
    showLoading("Updating Status", `Changing order ${id} to ${newStatus}...`);

    let success = false;

    // 1. Try Supabase
    if (window.supabaseClient) {
        try {
            const { error } = await window.supabaseClient.from('orders').update({ status: newStatus }).eq('id', id);
            if (!error) success = true;
        } catch (e) { console.error("Supabase status update error:", e); }
    }

    // 2. Try GAS
    const GAS_URL = getGasUrl();
    if (GAS_URL && window.submitToGas) {
        try {
            await window.submitToGas(GAS_URL, { action: 'updateOrderStatus', orderId: id, status: newStatus });
            success = true;
        } catch (e) { console.error("GAS status update error:", e); }
    }

    // 3. Local API (Dev only)
    if (!window.location.hostname.includes('github.io')) {
        try {
            const res = await fetch('/api/update-order-status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ orderId: id, status: newStatus })
            });
            if (res.ok) success = true;
        } catch (e) { }
    }

    if (success) {
        // Update local state and re-apply on refresh
        const changeData = { status: newStatus };
        window.pendingChanges[String(id)] = { data: changeData, timestamp: Date.now() };
        savePendingChanges();

        if (window.allOrders) {
            const order = window.allOrders.find(o => String(o.id || o.ID) === String(id));
            if (order) order.status = newStatus;
            renderOrdersTable(window.allOrders);
            renderDashboardStats(window.allOrders, window.currentVisits);
        }
    } else {
        alert("Failed to update status in the database. Please try again.");
        renderOrdersTable(window.allOrders); // Reset UI
    }

    hideLoading();
}

window.toggleDeliveryCalc = async function (event, id) {
    const isChecked = event.target.checked;
    showLoading("Syncing Data", `Updating delivery fee setting for order ${id}...`);

    let success = false;

    // 1. Try Supabase
    if (window.supabaseClient) {
        try {
            const { error } = await window.supabaseClient.from('orders').update({ calculate_delivery: String(isChecked) }).eq('id', id);
            if (!error) success = true;
        } catch (e) { console.error("Supabase delivery toggle error:", e); }
    }

    // 2. Try GAS
    const GAS_URL = getGasUrl();
    if (GAS_URL && window.submitToGas) {
        try {
            await window.submitToGas(GAS_URL, { action: 'updateOrderDeliveryToggle', orderId: id, calculateDelivery: isChecked });
            success = true;
        } catch (e) { console.error("GAS delivery toggle error:", e); }
    }

    if (success) {
        const changeData = { calculate_delivery: String(isChecked) };
        window.pendingChanges[String(id)] = { data: changeData, timestamp: Date.now() };
        savePendingChanges();

        if (window.allOrders) {
            const order = window.allOrders.find(o => String(o.id || o.ID) === String(id));
            if (order) {
                order.calculate_delivery = String(isChecked);
                renderOrdersTable(window.allOrders);
                renderDashboardStats(window.allOrders, window.currentVisits);
            }
        }
    } else {
        alert("Failed to update delivery toggle. Please try again.");
        renderOrdersTable(window.allOrders); // Reset toggle UI
    }

    hideLoading();
}

window.updateOrderDate = async function (id, newDate) {
    if (!newDate) return;
    showLoading("Updating Date", `Saving new date for order ${id}...`);

    let success = false;

    // 1. Try Supabase
    if (window.supabaseClient) {
        try {
            const isoDate = new Date(newDate).toISOString();
            const { error } = await window.supabaseClient.from('orders').update({ date: isoDate }).eq('id', id);
            if (!error) success = true;
        } catch (e) { console.error("Supabase date update error:", e); }
    }

    // 2. Try GAS
    const GAS_URL = getGasUrl();
    if (GAS_URL && window.submitToGas) {
        try {
            await window.submitToGas(GAS_URL, { action: 'updateOrderDate', orderId: id, date: new Date(newDate).toISOString() });
            success = true;
        } catch (e) { console.error("GAS date update error:", e); }
    }

    if (success) {
        const changeData = { date: new Date(newDate).toISOString() };
        window.pendingChanges[String(id)] = { data: changeData, timestamp: Date.now() };
        savePendingChanges();

        if (window.allOrders) {
            const order = window.allOrders.find(o => String(o.id || o.ID) === String(id));
            if (order) {
                order.date = new Date(newDate).toISOString();
                renderOrdersTable(window.allOrders);
                renderDashboardStats(window.allOrders, window.currentVisits);
            }
        }
    } else {
        alert("Failed to update date. Please try again.");
        renderOrdersTable(window.allOrders);
    }

    hideLoading();
}

window.deleteOrder = async function (id) {
    if (!confirm(`Are you sure you want to delete order #${id}?`)) return;

    let success = false;

    // Try Supabase first
    if (window.supabaseClient) {
        try {
            const { error } = await window.supabaseClient.from('orders').delete().eq('id', id);
            if (!error) success = true;
        } catch (e) { }
    }

    // Try GAS
    const GAS_URL = (document.getElementById('settings-google-script-url')?.value || document.getElementById('google-script-url')?.value)?.trim();
    if (GAS_URL && window.submitToGas) {
        try {
            await window.submitToGas(GAS_URL, { action: 'deleteOrder', orderId: id });
            success = true;
        } catch (e) { }
    }

    // Local API
    if (!window.location.hostname.includes('github.io')) {
        try {
            const res = await fetch('/api/orders', {
                method: 'DELETE',
                body: JSON.stringify({ orderId: id })
            });
            if (res.ok) success = true;
        } catch (e) { }
    }

    if (success) {
        loadData(); // REFRESH DATA TO REFLECT DELETED ITEM
    } else {
        alert("Failed to delete order. Please try again.");
    }
}

function toggleDetails(id) {
    const el = document.getElementById(id);
    if (el) {
        if (el.classList.contains('hidden')) {
            el.classList.remove('hidden');
            el.classList.add('fade-in-up');
        } else {
            el.classList.add('hidden');
            el.classList.remove('fade-in-up');
        }
    }
}

function parseItemString(str) {
    let sku = 'N/A';
    let color = 'Default';
    let price = '0.00';
    let name = 'Item';
    let qty = 1;

    try {
        // If already an object (new format), just return mapping
        if (typeof str === 'object' && str !== null) {
            return {
                sku: str.id || str.sku || 'N/A',
                color: str.color || 'Default',
                price: str.price || '0.00',
                name: str.name || 'Item',
                qty: str.qty || 1
            };
        }

        // 1. Extract and remove Quantity: "(Qty: 5)"
        const qtyMatch = str.match(/\(Qty:\s*(\d+)\)/);
        if (qtyMatch) {
            qty = qtyMatch[1];
            str = str.replace(qtyMatch[0], '').trim();
        }

        // 2. Strict Regex for format: "Index. [SKU] (Color) - Price - Name"
        // Escaped decimals for price, greedy match for name
        const match = str.match(/^\d+\.\s*\[(.*?)\]\s*\((.*?)\)\s*-\s*([\d.]+)\s*-\s*(.*)$/);

        if (match) {
            sku = match[1];
            color = match[2];
            price = match[3]; // Capture price group
            name = match[4];  // Capture name group (rest of string)
        } else {
            // Fallback: Use " - " (space dash space) as delimiter which is safer than "-"
            const parts = str.split(' - ');
            if (parts.length >= 3) {
                // parts[0]: "1. [TRND...-...] (Color)"
                // parts[1]: "13.08"
                // parts[2]: "Name"
                price = parts[1].trim();
                name = parts.slice(2).join(' - ').trim(); // Rejoin if name had separators

                // Extract SKU/Color from parts[0]
                const skuM = parts[0].match(/\[(.*?)\]/);
                if (skuM) sku = skuM[1];
                const colM = parts[0].match(/\((.*?)\)/);
                if (colM) color = colM[1];
            }
        }
    } catch (e) {
        console.warn("Error parsing item:", str, e);
        name = str;
    }

    return { sku, color, price, name, qty };
}

function handleAdminImageError(img, sku) {
    const currentSrc = img.src;
    const retries = parseInt(img.dataset.retries || '0');

    // 1. Try alternate extensions first
    if (retries === 0) {
        img.dataset.retries = '1';
        img.src = `${ASSETS_BASE_URL}${sku}.png`;
    } else if (retries === 1) {
        img.dataset.retries = '2';
        img.src = `${ASSETS_BASE_URL}${sku}.jpg`;
    } else if (retries === 2) {
        img.dataset.retries = '3';
        img.src = `${ASSETS_BASE_URL}${sku}.webp`;
    }
    // 2. Drive Fallback (if SKU looks like a Drive ID or we can extract one)
    else if (retries === 3) {
        img.dataset.retries = '4';
        const driveId = extractDriveId(currentSrc) || sku; // Sometimes SKU is the drive ID for unsynced items
        if (driveId && driveId.length > 20) {
            img.src = `https://lh3.googleusercontent.com/d/${driveId}`;
        } else {
            handleAdminImageError(img, sku); // Skip to placeholder
        }
    }
    else {
        // Final fallback: Placeholder
        img.onerror = null;
        if (img.parentNode) {
            img.parentNode.innerHTML = '<div class="item-image" style="display:flex;align-items:center;justify-content:center;color:#64748b;font-size:0.8rem;background:rgba(0,0,0,0.2);width:50px;height:50px;border-radius:8px;">No Img</div>';
        }
    }
}

// --- PRODUCT MODAL LOGIC & HELPERS ---

window.allProducts = [];
const PRODUCT_CSV_URL = 'https://raw.githubusercontent.com/3omarhs/crtv-rarities-products/main/data/products.csv';

// Assets Configuration
const ASSETS_BASE_URL = './assets/products/';

async function initProductData() {
    if (window.allProducts && window.allProducts.length > 0) return;

    return new Promise((resolve, reject) => {
        try {
            console.log("Fetching Product CSV from:", PRODUCT_CSV_URL);
            Papa.parse(PRODUCT_CSV_URL + '?v=' + Date.now(), {
                download: true,
                header: true,
                skipEmptyLines: true,
                complete: (results) => {
                    if (results.data) {
                        // Reverse results data so latest products (last in CSV) appear first in UI
                        window.allProducts = results.data.reverse();
                        window.manualProducts = window.allProducts.map(p => ({
                            id: p['No'],
                            name: p['Product Name'] || p['product name'] || p['Name on Store'] || 'Unknown Name',
                            price: parseFloat(String(p['Price < 25 QTY'] || 0).replace(/[^\d.]/g, '')),
                            image: `${ASSETS_BASE_URL}${p['No']}.jpg`
                        })).filter(p => p.id && p.name);
                    }
                    resolve();
                },
                error: (err) => {
                    console.error("Papa Parse Error:", err);
                    reject(err);
                }
            });
        } catch (e) {
            console.error("Failed to load products:", e);
            reject(e);
        }
    });
}

function extractDriveId(url) {
    if (!url) return null;
    let match = url.match(/\/(?:file\/)?d\/([a-zA-Z0-9_-]+)/);
    if (match) return match[1];
    match = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (match) return match[1];
    if (url.length > 20 && /^[a-zA-Z0-9_-]+$/.test(url)) return url;
    return null;
}

// Minimal Translation Stub for Admin (English default)
const translations = {
    en: {
        retailPrice: "Retail Price",
        priceLabel: "Price",
        bulkSaving: "Wholesale Price (>10 pcs)",
        oos: "Out of Stock",
        inStock: "In Stock",
        copy: "Copy",
        viewDoc: "View Document",
        categoryLabel: "Category",
        collectionLabel: "Collection",
        dimensionsLabel: "Dimensions",
        targetMarketLabel: "Target Market",
        descriptionLabel: "Description",
        noDesc: "No description available.",
        selectColor: "Available Colors"
    }
};

window.getColorHex = function (name) {
    const colors = {
        'Black': '#1a1a1a',
        'White': '#ffffff',
        'Red': '#dc2626',
        'Blue': '#2563eb',
        'Green': '#16a34a',
        'Yellow': '#ca8a04',
        'Purple': '#9333ea',
        'Orange': '#ea580c',
        'Pink': '#db2777',
        'Gray': '#4b5563',
        'Brown': '#78350f',
        'Beige': '#f5f5dc',
        'Navy': '#1e3a8a',
        'Gold': '#d4af37',
        'Silver': '#94a3b8'
    };
    return colors[name] || '#e2e8f0';
};

window.handleItemClick = function (element, event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    const sku = element.getAttribute('data-sku');
    console.log("handleItemClick called. SKU:", sku);
    if (sku) {
        window.toggleItemExpansion(element, sku);
    } else {
        console.error("handleItemClick: No SKU found on element", element);
    }
};

window.toggleItemExpansion = function (element, sku) {
    // Check if already expanded
    if (element.classList.contains('expanded')) {
        // Collapse
        element.classList.remove('expanded');
        const details = element.querySelector('.inline-details-container');
        if (details) details.remove();
        return;
    }

    // Collapse other expanded items in the same container (Accordion style - optional but cleaner)
    const siblings = element.parentNode.querySelectorAll('.item-tile.expanded');
    siblings.forEach(sib => {
        sib.classList.remove('expanded');
        const d = sib.querySelector('.inline-details-container');
        if (d) d.remove();
    });

    // Expand
    sku = String(sku).trim();
    if (!window.allProducts || window.allProducts.length === 0) {
        initProductData().then(() => {
            // Retry once after load
            window.toggleItemExpansion(element, sku);
        });
        return;
    }

    const productRaw = window.allProducts.find(p => {
        const no = p['No'] || p['Item Number'] || p['no'] || p['id'] || '';
        return String(no).trim().toLowerCase() === sku.toLowerCase();
    });

    if (!productRaw) {
        alert("Details not available for Item #" + sku);
        return;
    }

    const html = window.getProductDetailsHtml(productRaw, `window.toggleItemExpansion(this.closest('.item-tile'), '${p.no}')`);

    element.insertAdjacentHTML('beforeend', html);
    element.classList.add('expanded');

    // Re-init icons if any exist in the template (currently none, but good practice)
    if (window.lucide) lucide.createIcons();
};

window.getProductDetailsHtml = function (productRaw, closeJs) {
    // Normalize Data
    const sku = productRaw['No'] || productRaw['Item Number'] || productRaw['no'] || productRaw['id'] || '';
    const p = {
        name: productRaw['Name on Store'] || productRaw['Product Name'] || productRaw['product name'] || productRaw['Name'] || 'Unknown',
        no: sku,
        image: productRaw['Image'] || productRaw['image'] || productRaw['Photo'] || '',
        link: productRaw['Document Link'] || productRaw['link'] || '',
        price: productRaw['Price'] || productRaw['Retail Price'] || productRaw['Price < 25 QTY'] || productRaw['Price <25 QTY'] || '0',
        bulkPrice: productRaw['Wholesale Price'] || productRaw['Price >=25 QTY'] || productRaw['Price >= 25 QTY'] || productRaw['Price > 25 QTY'] || '',
        category: productRaw['Category'] || productRaw['category'],
        collection: productRaw['Collection'] || productRaw['collection'],
        dimensions: productRaw['Dimensions'] || productRaw['Dimensions(mm) x y z'],
        targetMarket: productRaw['Target Market'] || productRaw['target market'],
        description: productRaw['Description'] || productRaw['description (80 word)'],
        colors: (productRaw['Colors'] || '').split(',').map(c => c.trim()).filter(c => c),
    };

    const t = translations.en;

    // Force Local Assets Only as requested
    // The handleAdminImageError function will handle extension fallback (png -> jpg -> etc)
    let imageSrc = `${ASSETS_BASE_URL}${p.no}.png`;

    // Add a new property 'available' based on 'Stock' or 'Availability'
    p.available = productRaw['Stock'] || productRaw['Availability'] || 'Yes';

    return `
        <div class="inline-details-container" onclick="event.stopPropagation()" style="animation: fadeIn 0.3s ease-in-out;">
            <!-- Header -->
            <div class="premium-header">
                 <div style="display:flex; align-items:center; gap:1rem;">
                    <h1 class="premium-title">${p.name}</h1>
                    ${p.available === 'No' ? '<span style="background:#fee2e2; color:#ef4444; padding:0.2rem 0.6rem; border-radius:4px; font-weight:600; font-size:0.75rem; letter-spacing:0.05em;">OUT OF STOCK</span>' : ''}
                 </div>
                 <span class="premium-sku-badge">#${p.no}</span>
            </div>

            <!-- Content Grid -->
            <div class="premium-grid">
                <!-- Left: Image -->
                <div class="premium-image-container">
                    <img 
                        src="${imageSrc}" 
                        alt="${p.name}" 
                        class="premium-image"
                        onload="this.style.display='block'; this.onerror=null;"
                        onerror="if(window.handleAdminImageError) window.handleAdminImageError(this, '${p.no}')"
                    >
                </div>

                <!-- Right: Details -->
                <div class="premium-details">
                    
                    <div class="premium-data-grid">
                         <div class="premium-data-item">
                            <span class="premium-label">${t.categoryLabel}</span>
                            <span class="premium-value">${p.category || '-'}</span>
                         </div>
                         <div class="premium-data-item">
                            <span class="premium-label">${t.collectionLabel}</span>
                            <span class="premium-value">${p.collection || '-'}</span>
                         </div>
                         <div class="premium-data-item">
                            <span class="premium-label">${t.dimensionsLabel}</span>
                            <span class="premium-value">${p.dimensions || '-'}</span>
                         </div>
                         <div class="premium-data-item">
                            <span class="premium-label">${t.targetMarketLabel}</span>
                            <span class="premium-value">${p.targetMarket || '-'}</span>
                         </div>
                    </div>

                    <div class="premium-description">
                        <strong style="display:block; margin-bottom:0.5rem; color:var(--text-secondary); font-weight:700;">${t.descriptionLabel}</strong>
                        ${p.description || t.noDesc}
                    </div>

                    ${p.colors && p.colors.length > 0 ? `
                        <div class="premium-colors">
                            <div style="margin-bottom:0.5rem; font-size:0.75rem; text-transform:uppercase; color:#64748b; font-weight:600; letter-spacing:0.1em;">
                                ${t.selectColor}
                            </div>
                            <div>
                                ${p.colors.map(color => `
                                    <span class="premium-color-tag">${color}</span>
                                `).join('')}
                            </div>
                        </div>
                    ` : ''}

                    <div class="premium-footer">
                        <div class="premium-price-block">
                             <span class="premium-price-label">Price &lt; 25 QTY</span>
                             <span class="premium-price-value">${parseFloat(p.price || 0).toFixed(3)} JOD</span>
                        </div>
                        <div class="premium-price-block">
                             <span class="premium-price-label" style="color:#b45309;">Price >= 25 QTY</span>
                             <span class="premium-price-value" style="color:#d97706;">${parseFloat(p.bulkPrice || 0).toFixed(3)} JOD</span>
                        </div>
                    </div>

                </div>
            </div>
            
            <!-- Bottom Close Bar -->
            <div class="premium-close-bar" onclick="${closeJs}">
                Close Details
            </div>
        </div>
    `;
};

// --- Product List Logic ---
const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSTejg41yuaKcYa0CbOodUP9osmE5DIv8ZNQyMXlHJLLh2pQUZ5EoMT93UgV3LZfhAJcPEL8uEfK9Y4/pub?gid=897526080&single=true&output=csv';

window.fetchProductsData = async function () {
    if (window.currentProducts && window.currentProducts.length > 0) {
        return window.currentProducts;
    }

    try {
        const res = await fetch(CSV_URL);
        const text = await res.text();
        return new Promise((resolve, reject) => {
            Papa.parse(text, {
                header: true,
                skipEmptyLines: true,
                complete: function (results) {
                    window.currentProducts = results.data;
                    resolve(results.data);
                },
                error: (err) => reject(err)
            });
        });
    } catch (e) {
        console.error("Error fetching CSV", e);
        return [];
    }
};

window.loadProducts = async function () {
    console.log("Loading products...");
    const tbody = document.getElementById('products-list-body');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="7">Loading...</td></tr>';

    try {
        await initProductData();
        window.currentProducts = window.allProducts; // Keep currentProducts for compatibility
        renderProductsTable(window.allProducts);
    } catch (e) {
        console.error("Error loading products", e);
        tbody.innerHTML = '<tr><td colspan="7">Error loading products. Check console.</td></tr>';
    }
};

window.prepareAddProductForm = async function () {
    // Reset form to "Add" state
    const form = document.getElementById('add-product-form');
    if (!form) return;

    form.reset();
    document.getElementById('product-action').value = 'addProduct';
    document.getElementById('edit-product-no').value = '';
    document.getElementById('page-title').textContent = "Add Product";
    if (form.elements['No']) form.elements['No'].readOnly = false;

    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.textContent = "Add Product";

    // Always pre-populate the GAS URL so the field is never left blank
    const gasUrlInput = document.getElementById('google-script-url');
    if (gasUrlInput) {
        const knownGasUrl = window.GAS_URL || 'https://script.google.com/macros/s/AKfycby-F1rqwiv6aneRtEL0ZV3lB8tOUQ64ckECuZDM7tXbzp85xxz6vyNvvvc718SNVjdVyQ/exec';
        gasUrlInput.value = knownGasUrl;
    }

    // Auto-increment logic
    try {
        const data = await window.fetchProductsData();
        const nextNo = getNextItemNumber(data);
        if (nextNo && form.elements['No']) {
            form.elements['No'].value = nextNo;
        }
    } catch (e) {
        console.error("Error auto-incrementing", e);
    }
};

window.getNextItemNumber = function (products) {
    if (!products || products.length === 0) return '';

    // Filter for valid IDs and find the last one (assuming order in CSV matters, or sort?)
    // Usually usage is sequential, so the last valid row with an ID is the latest.
    // Let's look at the last few entries.

    let lastId = '';
    // Since products might be reversed (latest first), search from start to find the most recent valid ID
    for (let i = 0; i < products.length; i++) {
        if (products[i]['No'] && products[i]['No'].trim() !== '') {
            lastId = products[i]['No'];
            break;
        }
    }

    if (!lastId) return '';

    // Regex to separate prefix and number
    // Supports: "ABC-123", "Item10", "A-B-C-005"
    // Captures everything up to the last digit sequence as group 1, and the digits as group 2.
    const match = lastId.match(/^(.*?)(\d+)$/);

    if (match) {
        const prefix = match[1];
        const numberStr = match[2];
        const number = parseInt(numberStr, 10);
        const nextNumber = number + 1;

        // Pad with leading zeros to match original length
        const paddedNextNumber = String(nextNumber).padStart(numberStr.length, '0');

        return prefix + paddedNextNumber;
    }

    return lastId; // Fallback if no digits found
};

window.renderProductsTable = function (data) {
    const tbody = document.getElementById('products-list-body');
    tbody.innerHTML = '';

    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7">No products found.</td></tr>';
        return;
    }

    data.forEach(row => {
        if (!row['No']) return;

        const tr = document.createElement('tr');

        // Image Logic: Prioritize Drive ID from 'Image' column for instant preview
        const driveId = extractDriveId(row['Image'] || row['image'] || '');
        let initialImgSrc = `${ASSETS_BASE_URL}${row['No']}.jpg`;
        if (driveId) {
            initialImgSrc = `https://lh3.googleusercontent.com/d/${driveId}`;
        }

        let imgHtml = `<img src="${initialImgSrc}" onerror="window.handleAdminImageError(this, '${row['No']}')" style="width:50px; height:50px; object-fit:cover; border-radius:8px;">`;

        const isActive = row['Available'] === 'TRUE';
        const statusHtml = isActive
            ? '<span class="status-badge status-active">Active</span>'
            : '<span class="status-badge status-inactive">Hidden</span>';

        tr.onclick = function () { window.toggleProductRowExpansion(this, row['No']); };
        tr.style.cursor = 'pointer';
        tr.className = 'product-row-item';

        tr.innerHTML = `
            <td>${imgHtml}</td>
            <td style="font-family:monospace; font-weight:600; font-size:0.9rem;">${row['No']}</td>
            <td style="font-weight:500;">${row['Product Name'] || row['product name'] || row['Name on Store'] || '-'}</td>
            <td style="opacity:0.8;">${row['category']}</td>
            <td style="font-weight:700; color:#fff;">${parseFloat(row['Price < 25 QTY'] || 0).toFixed(3)}</td>
            <td>${statusHtml}</td>
            <td onclick="event.stopPropagation()">
                <div class="action-buttons">
                    <button class="btn-icon btn-edit" onclick="window.editProduct('${row['No']}')" title="Edit">
                        <i data-lucide="edit-2" style="width:16px; height:16px;"></i>
                    </button>
                    <button class="btn-icon btn-delete" onclick="window.deleteProduct('${row['No']}')" title="Delete">
                        <i data-lucide="trash-2" style="width:16px; height:16px;"></i>
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });

    // Initialize new icons
    if (window.lucide) lucide.createIcons();
};

window.toggleProductRowExpansion = function (tr, sku) {
    const nextRow = tr.nextElementSibling;
    if (nextRow && nextRow.classList.contains('product-expanded-row')) {
        nextRow.remove();
        tr.classList.remove('active-expanded');
        return;
    }

    // Collapse other expanded rows
    document.querySelectorAll('.product-expanded-row').forEach(row => row.remove());
    document.querySelectorAll('.product-row-item').forEach(row => row.classList.remove('active-expanded'));

    const product = window.currentProducts.find(p => p['No'] === sku);
    if (!product) return;

    tr.classList.add('active-expanded');

    const expandedTr = document.createElement('tr');
    expandedTr.className = 'product-expanded-row';

    // Use the shared HTML generator
    // The close action simply removes this row
    const html = window.getProductDetailsHtml(product, "this.closest('tr').remove(); document.querySelector('.product-row-item.active-expanded')?.classList.remove('active-expanded');");

    expandedTr.innerHTML = `
        <td colspan="7" style="padding: 0; background: #1e1e24; border-bottom: 1px solid var(--gold-500); border-top: 1px solid transparent;">
            ${html}
        </td>
    `;

    tr.after(expandedTr);

    // Animate
    setTimeout(() => expandedTr.style.opacity = '1', 10);
};

window.editProduct = function (no) {
    const product = window.currentProducts?.find(p => p['No'] === no);
    if (!product) { alert("Product not found. Please refresh."); return; }

    document.querySelector('.nav-item[data-view="add-product"]').click();

    document.getElementById('page-title').textContent = `Editing ${no}`;
    document.getElementById('product-action').value = 'updateProduct';
    document.getElementById('edit-product-no').value = no;

    const form = document.getElementById('add-product-form');
    if (form.elements['No']) { form.elements['No'].value = product['No']; form.elements['No'].readOnly = true; }
    if (form.elements['Name on Store']) form.elements['Name on Store'].value = product['Name on Store'] || product['product name'];
    if (form.elements['product name']) form.elements['product name'].value = product['Product Name'] || product['product name'] || '';
    if (form.elements['Arabic Name']) form.elements['Arabic Name'].value = product['Arabic Name'];
    if (form.elements['Price < 25 QTY']) form.elements['Price < 25 QTY'].value = product['Price < 25 QTY'];
    if (form.elements['category']) form.elements['category'].value = product['category'];
    if (form.elements['collection']) form.elements['collection'].value = product['collection'];
    if (form.elements['description (80 word)']) form.elements['description (80 word)'].value = product['description (80 word)'];
    if (form.elements['Colors']) form.elements['Colors'].value = product['Colors'];
    if (form.elements['Dimensions(mm) x y z']) form.elements['Dimensions(mm) x y z'].value = product['Dimensions(mm) x y z'];

    const btn = form.querySelector('button[type="submit"]');
    btn.innerText = "Update Product";
};

window.deleteProduct = async function (no) {
    if (!confirm(`Are you sure you want to delete ${no}?`)) return;

    const gasUrl = (document.getElementById('settings-google-script-url')?.value || document.getElementById('google-script-url')?.value)?.trim();
    if (!gasUrl) {
        alert("Error: No Google Apps Script URL defined. Delete action aborted.");
        return;
    }

    try {
        console.log("Admin: Deleting product via GAS...");
        const res = await window.submitToGas(gasUrl, {
            action: 'deleteProduct',
            no: no
        });

        if (res) {
            alert(`Product #${no} deleted successfully from Sheet/GitHub.`);
            if (window.loadProducts) window.loadProducts();
        }
    } catch (e) {
        console.error("Delete product error", e);
        alert("Failed to delete product: " + e.message);
    }
};

// --- Initialization Logic for GAS URL ---
window.checkGasUrlVisibility = function () {
    const input = document.getElementById('google-script-url');
    const container = document.getElementById('gas-url-container');

    if (input && container) {
        if (input.value && input.value.trim() !== '') {
            container.style.display = 'none';
        } else {
            container.style.display = 'block';
        }
    }
};

// --- SCROLL TO TOP ---
const scrollToTopBtn = document.getElementById("scrollToTopBtn");
if (scrollToTopBtn) {
    window.onscroll = function () {
        if (document.body.scrollTop > 20 || document.documentElement.scrollTop > 20) {
            scrollToTopBtn.style.display = "block";
        } else {
            scrollToTopBtn.style.display = "none";
        }
    };
    scrollToTopBtn.onclick = function () {
        document.body.scrollTop = 0;
        document.documentElement.scrollTop = 0;
    };
}


// --- WHOLESALE LOGIC ---

async function initWholesale() {
    console.log("Initializing Wholesale...");

    const productSelect = document.getElementById('so-product-select');
    if (productSelect) {
        productSelect.addEventListener('change', (e) => {
            const itemNo = e.target.value;
            if (!itemNo) {
                document.getElementById('so-original-price').textContent = '0.00 JOD';
                return;
            }

            // Find product
            const product = window.allProducts.find(p => String(p['No']) === itemNo);
            if (product) {
                const price = product['Price < 25 QTY'] || 0;
                document.getElementById('so-original-price').textContent = `${price} JOD`;
            }
        });
    }
}

window.showAddWholesaleModal = async function () {
    try {
        console.log("Admin: Opening Wholesale Modal");
        const modal = document.getElementById('add-wholesale-modal');
        if (!modal) { console.error("Wholesale modal not found!"); return; }

        modal.classList.remove('hidden');
        requestAnimationFrame(() => modal.classList.add('open'));

        // Reset fields
        const sel = document.getElementById('so-product-select');
        if (sel) {
            sel.innerHTML = '<option value="">-- Select a Product --</option>';
            sel.value = "";
        }
        const catInput = document.getElementById('so-category-input');
        if (catInput) {
            catInput.value = "";
        }
        const catList = document.getElementById('so-category-list');
        if (catList) catList.innerHTML = '';

        const price = document.getElementById('so-price');
        if (price) price.value = '';
        const orig = document.getElementById('so-original-price');
        if (orig) orig.textContent = '0.00 JOD';

        // Ensure products
        if (!window.allProducts || window.allProducts.length === 0) {
            console.log("Admin: Products missing, initializing...");
            if (typeof initProductData === 'function') await initProductData();
        }

        // Setup Custom Dropdown
        if (window.allProducts) {
            window.setupCustomProductDropdown({
                inputId: 'so-product-search',
                dropdownId: 'so-product-dropdown',
                onSelect: (id) => {
                    if (sel) sel.value = id;
                    // Auto-fill price
                    const product = window.allProducts.find(p => p['No'] === id);
                    if (product) {
                        const orig = document.getElementById('so-original-price');
                        const pVal = parseFloat(String(product['Price < 25 QTY'] || 0).replace(/[^\d.]/g, ''));
                        if (orig) orig.textContent = pVal.toFixed(3) + ' JOD';
                    }
                }
            });
        }

        // 2. Categories (From existing wholesale offers, not products)
        if (catList && window.wholesaleOffers) {
            const categories = new Set();
            window.wholesaleOffers.forEach(o => {
                if (o.category) categories.add(o.category.trim());
            });
            const sortedCats = Array.from(categories).sort();
            sortedCats.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c;
                catList.appendChild(opt);
            });
        }
    } catch (e) {
        console.error("Admin: Error showing wholesale modal", e);
        alert("Error opening modal: " + e.message);
    }
};

window.closeWholesaleModal = function () {
    const modal = document.getElementById('add-wholesale-modal');
    if (modal) {
        modal.classList.remove('open');
        setTimeout(() => {
            modal.classList.add('hidden');
        }, 500); // Wait for transition
    }
};

window.submitWholesaleItem = async function () {
    const itemNo = document.getElementById('so-product-select').value;
    const category = document.getElementById('so-category-input').value;
    const specialPrice = parseFloat(document.getElementById('so-price').value);

    if (!itemNo) { alert("Please select a product"); return; }
    // Category is optional? User asked "option to choose a category", implying it might be optional, but better to encourage it.
    // Let's make it optional for now to avoid blocking if old data doesn't have it, or mandatory if user insists.
    // User said "choose a category for the added item", likely wants it saved.

    if (isNaN(specialPrice)) { alert("Please enter a valid wholesale price"); return; }

    // 1. Try GAS (Primary for GitHub Pages / CSV workflow)
    const gasUrl = getGasUrl();
    if (gasUrl) {
        try {
            console.log("Admin: Saving wholesale offer to GitHub CSV via GAS...");
            await window.submitToGas(gasUrl, {
                action: 'saveWholesale',
                offer: { item_no: itemNo, special_price: specialPrice, category: category }
            });
            window.closeWholesaleModal();
            loadWholesale();

            // Success in GAS usually means it's pushed to GitHub
            alert("Wholesale offer saved to GitHub successfully.");
            return;
        } catch (e) {
            console.error("GAS Wholesale error", e);
        }
    }

    // 2. Fallback to Supabase
    if (window.supabaseClient) {
        try {
            console.log("Adding wholesale offer to Supabase...");
            const { error } = await window.supabaseClient.from('wholesale').upsert({
                item_no: itemNo,
                special_price: specialPrice,
                category: category || null
            }, { onConflict: 'item_no' });

            if (!error) {
                console.log("Wholesale offer added to Supabase.");
                window.closeWholesaleModal();
                loadWholesale();
                alert("Wholesale offer saved to Supabase.");
                return;
            }
        } catch (e) {
            console.error("Supabase Wholesale Error:", e);
        }
    }

    alert("Failed to save wholesale offer. Ensure your GAS URL or Supabase is connected.");
};

window.loadWholesale = async function () {
    const grid = document.getElementById('wholesale-grid');
    if (!grid) return;

    grid.innerHTML = '<p style="color:var(--text-secondary);">Loading items...</p>';

    // 1. Try fetching from GitHub directly (Read-only view)
    try {
        const CSV_URL = 'https://raw.githubusercontent.com/3omarhs/crtv-rarities-products/main/data/wholesale.csv';
        const res = await fetch(CSV_URL);
        if (res.ok) {
            const text = await res.text();
            Papa.parse(text, {
                header: true,
                skipEmptyLines: true,
                complete: (results) => {
                    window.wholesaleOffers = results.data;
                    renderWholesaleItems(results.data);
                }
            });
            return;
        }
    } catch (e) {
        console.warn("Wholesale: GitHub fetch failed, skipping...");
    }

    grid.innerHTML = '<p style="color:var(--text-secondary); text-align:center; grid-column:1/-1; padding:2rem;">Unable to load Wholesale items.</p>';
};

function renderWholesaleItems(offers) {
    const grid = document.getElementById('wholesale-grid');
    if (!grid) return;
    grid.innerHTML = '';

    if (offers.length === 0) {
        grid.innerHTML = '<p style="color:var(--text-secondary); text-align:center; grid-column:1/-1; padding:2rem;">No wholesale items active.</p>';
        return;
    }

    offers.forEach(offer => {
        const card = document.createElement('article');
        card.className = 'card fade-in-up';
        card.style.cssText = 'padding:0; overflow:hidden; display:flex; flex-direction:column; position:relative; min-height:400px;';

        const name = offer['Product Name'] || offer['product name'] || offer.name || 'Unknown Product';
        const originalPrice = parseFloat(offer.price || 0); // Using 'price' from enriched data
        const specialPrice = parseFloat(offer.special_price || 0);
        let discount = 0;
        if (originalPrice > 0 && specialPrice < originalPrice) {
            discount = Math.round(((originalPrice - specialPrice) / originalPrice) * 100);
        }

        const images = offer.images || [];
        const imageSrc = images.length > 0 ? images[0] : `${ASSETS_BASE_URL}${offer.item_no}.jpg`;
        const fallback = "data:image/svg+xml;charset=UTF-8,%3Csvg%20width%3D%22800%22%20height%3D%22600%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Crect%20width%3D%22100%25%22%20height%3D%22100%25%22%20fill%3D%22%232d2d35%22%2F%3E%3Ctext%20x%3D%2250%25%22%20y%3D%2250%25%22%20font-family%3D%22sans-serif%22%20font-size%3D%2220%22%20fill%3D%22%2394a3b8%22%20text-anchor%3D%22middle%22%20%3ENo%20Image%3C%2Ftext%3E%3C%2Fsvg%3E";

        card.innerHTML = `
            <div class="card-image-container" style="height:250px; background:#000; position:relative;">
                <img src="${imageSrc}" alt="${name}" 
                     style="width:100%; height:100%; object-fit:cover;"
                     onerror="this.src='${fallback}'">
                <div style="position:absolute; top:10px; right:10px; display:flex; gap:8px;">
                     <button class="icon-btn" style="background:rgba(0,0,0,0.6); color:white; border-radius:4px; padding:6px;" 
                             onclick="window.showEditWholesaleModal('${offer.item_no}')" title="Edit Item">
                        <i data-lucide="edit-3" style="width:16px; height:16px;"></i>
                    </button>
                    <button class="icon-btn" style="background:rgba(239, 68, 68, 0.8); color:white; border-radius:4px; padding:6px;" 
                             onclick="window.showDeleteWholesaleModal('${offer.item_no}')" title="Remove Item">
                        <i data-lucide="trash-2" style="width:16px; height:16px;"></i>
                    </button>
                </div>
                ${discount > 0 ? `<div style="position:absolute; bottom:10px; left:10px; background:#ef4444; color:white; padding:4px 8px; border-radius:4px; font-weight:bold; font-size:0.8rem;">-${discount}%</div>` : ''}
            </div>
            <div style="padding:1.25rem; flex-grow:1; display:flex; flex-direction:column; gap:0.5rem;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span style="font-size:0.7rem; color:var(--text-secondary); background:var(--bg-darker); padding:2px 6px; border-radius:4px;">#${offer.item_no}</span>
                    <span style="background:var(--accent); color:white; padding:2px 8px; border-radius:4px; font-size:0.7rem; text-transform:uppercase;">${offer.category || 'Wholesale'}</span>
                </div>
                <h3 style="margin:0; font-size:1rem; line-height:1.4; color:white; overflow:hidden; text-overflow:ellipsis; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;">${name}</h3>
                
                <div style="margin-top:auto; padding-top:0.75rem; border-top:1px solid var(--border); display:flex; align-items:center; gap:0.75rem;">
                    <span style="color:var(--accent); font-weight:bold; font-size:1.1rem;">${specialPrice.toFixed(3)} JOD</span>
                    <span style="text-decoration:line-through; color:var(--text-secondary); font-size:0.85rem;">${originalPrice.toFixed(3)} JOD</span>
                </div>
            </div>
        `;
        grid.appendChild(card);
    });

    if (window.lucide) lucide.createIcons();
}

window.showEditWholesaleModal = function (itemNo) {
    const offer = window.wholesaleOffers.find(o => o.item_no == itemNo);
    if (!offer) return;

    document.getElementById('edit-so-item-no').value = itemNo;
    document.getElementById('edit-so-product-name').textContent = offer.name;
    document.getElementById('edit-so-category-input').value = offer.category || '';
    document.getElementById('edit-so-price').value = offer.special_price;

    const modal = document.getElementById('edit-wholesale-modal');
    modal.classList.remove('hidden');
    modal.classList.add('open');
};

window.showDeleteWholesaleModal = function (itemNo) {
    const offer = window.wholesaleOffers.find(o => o.item_no == itemNo);
    if (!offer) return;

    document.getElementById('delete-so-item-no').value = itemNo;
    document.getElementById('delete-so-product-name').textContent = offer.name;

    const modal = document.getElementById('delete-wholesale-modal');
    modal.classList.remove('hidden');
    modal.classList.add('open');
};

window.closeDeleteWholesaleModal = function () {
    const modal = document.getElementById('delete-wholesale-modal');
    modal.classList.remove('open');
    setTimeout(() => modal.classList.add('hidden'), 300);
};

window.closeEditWholesaleModal = function () {
    const modal = document.getElementById('edit-wholesale-modal');
    modal.classList.remove('open');
    setTimeout(() => modal.classList.add('hidden'), 300);
};

window.submitWholesaleEdit = async function () {
    const itemNo = document.getElementById('edit-so-item-no').value;
    const category = document.getElementById('edit-so-category-input').value;
    const price = parseFloat(document.getElementById('edit-so-price').value);

    if (isNaN(price)) { alert("Invalid price"); return; }

    let supabaseSuccess = false;
    if (window.supabaseClient) {
        try {
            console.log("Updating special offer in Supabase...");
            const { error } = await window.supabaseClient.from('wholesale').update({
                special_price: price,
                category: category || null
            }).eq('item_no', itemNo);
            if (error) throw error;
            console.log("Special offer updated in Supabase.");
            supabaseSuccess = true;
            window.closeEditWholesaleModal();
            alert("Special offer updated in Supabase.");
        } catch (e) {
            console.error("Supabase Edit Wholesale Error:", e);
        }
    }

    if (supabaseSuccess) return;

    // Static hosting limitation
    console.warn("Special offers update disabled on static GitHub Pages.");
    alert("Updating special offers is disabled on static GitHub Pages. Please update your backend API or Google Sheet directly.");
    return;

    try {
        const res = await fetch('/api/special-offers', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ item_no: itemNo, special_price: price, category: category })
        });
        if (res.ok) {
            window.closeEditWholesaleModal();
            loadWholesale();
        } else {
            alert("Failed to update item.");
        }
    } catch (e) {
        console.error("Error editing wholesale:", e);
        alert("Network error.");
    }
};

window.confirmWholesaleDelete = async function () {
    const itemNo = document.getElementById('delete-so-item-no').value;

    // 1. Try GAS (Primary for CSV delete)
    const gasUrl = getGasUrl();
    if (gasUrl) {
        try {
            console.log("Admin: Removing wholesale item via GAS...");
            await window.submitToGas(gasUrl, {
                action: 'deleteWholesale',
                item_no: itemNo
            });
            window.closeDeleteWholesaleModal();
            loadWholesale();
            alert("Wholesale item removed from GitHub.");
            return;
        } catch (e) {
            console.error("GAS Wholesale delete error", e);
        }
    }

    // 2. Fallback to Supabase
    if (window.supabaseClient) {
        try {
            console.log("Removing wholesale offer from Supabase...");
            const { error } = await window.supabaseClient.from('wholesale').delete().eq('item_no', itemNo);
            if (!error) {
                console.log("Wholesale offer removed from Supabase.");
                window.closeDeleteWholesaleModal();
                loadWholesale();
                alert("Wholesale offer removed from Supabase.");
                return;
            }
        } catch (e) {
            console.error("Supabase Delete Wholesale Error:", e);
        }
    }

    alert("Failed to remove item. Please check your backend connection.");
};



window.removeWholesaleItem = function (itemNo) {
    window.showDeleteWholesaleModal(itemNo);
};

window.showOfferImages = function (itemNo, imagesJson) {
    // Deprecated for inline gallery, but keeping just in case
    const images = JSON.parse(decodeURIComponent(imagesJson));
    const modal = document.getElementById('image-gallery-modal');
    const container = document.getElementById('gallery-container');
    const title = document.getElementById('gallery-title');

    title.textContent = `Images for ${itemNo}`;
    container.innerHTML = '';

    if (images.length === 0) {
        container.innerHTML = '<p>No images found.</p>';
    } else {
        images.forEach(img => {
            const imgEl = document.createElement('img');
            imgEl.src = img;
            imgEl.style.cssText = 'width:100%; height:150px; object-fit:cover; border-radius:4px; border:1px solid var(--border);';
            container.appendChild(imgEl);
        });
    }

    modal.classList.remove('hidden');
};
// Run after a short delay to ensure value is populated if it comes from extensions/autofill
setTimeout(window.checkGasUrlVisibility, 100);

// Safety init for Special Offers
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        if (window.initWholesale) window.initWholesale();
    });
} else {
    // DOM already loaded
    setTimeout(() => {
        if (window.initWholesale) window.initWholesale();
    }, 500);
}


window.openImagePopup = function (src) {
    const modal = document.getElementById('image-popup-modal');
    const img = document.getElementById('image-popup-img');
    if (!modal || !img) return;

    img.src = src;
    modal.style.display = 'flex';
    // Small delay to allow display:flex to apply before opacity transition
    requestAnimationFrame(() => {
        modal.style.opacity = '1';
        img.style.transform = 'scale(1)';
    });
};

window.closeImagePopup = function () {
    const modal = document.getElementById('image-popup-modal');
    const img = document.getElementById('image-popup-img');
    if (!modal) return;

    modal.style.opacity = '0';
    if (img) img.style.transform = 'scale(0.95)';

    setTimeout(() => {
        modal.style.display = 'none';
        if (img) img.src = '';
    }, 300);
};

// Close on Escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') window.closeImagePopup();
});

window.currentSearchTerm = '';
window.currentSortColumn = '';
window.currentSortDirection = 'asc';

window.handleProductSearch = function (term) {
    window.currentSearchTerm = term.toLowerCase();
    window.filterAndRenderProducts();
};

window.handleSort = function (column) {
    if (window.currentSortColumn === column) {
        // Toggle direction
        window.currentSortDirection = window.currentSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        window.currentSortColumn = column;
        window.currentSortDirection = 'asc';
    }
    window.filterAndRenderProducts();
};

// --- Smart Search Logic ---
window.levenshtein = function (a, b) {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    const matrix = [];
    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1, // substitution
                    Math.min(
                        matrix[i][j - 1] + 1, // insertion
                        matrix[i - 1][j] + 1  // deletion
                    )
                );
            }
        }
    }
    return matrix[b.length][a.length];
};

window.filterAndRenderProducts = function () {
    let products = [...window.currentProducts]; // Clone original list
    const term = window.currentSearchTerm;

    // 1. Filter (Smart Search)
    if (term && term.length > 0) {
        products = products.filter(p => {
            // Check ALL fields
            return Object.values(p).some(val => {
                const strVal = String(val).toLowerCase();

                // 1. Direct Include
                if (strVal.includes(term)) return true;

                // 2. Fuzzy Match (only if search term is > 2 chars)
                if (term.length > 2) {
                    // Allow 1 error for 3-5 chars, 2 errors for 6+ chars
                    const maxDist = term.length > 5 ? 2 : 1;

                    // Optimization: Only run expensive levenshtein if lengths are close
                    if (Math.abs(strVal.length - term.length) > maxDist + 2) return false;

                    // Check full value fuzzy
                    if (window.levenshtein(strVal, term) <= maxDist) return true;

                    // Also check individual words in the value
                    const words = strVal.split(/[\s-_]+/);
                    return words.some(w => window.levenshtein(w, term) <= maxDist);
                }
                return false;
            });
        });
    }

    // 2. Sort
    if (window.currentSortColumn) {
        products.sort((a, b) => {
            let valA = a[window.currentSortColumn] || '';
            let valB = b[window.currentSortColumn] || '';

            // Smart numeric sort
            const numA = parseFloat(valA);
            const numB = parseFloat(valB);

            // If both are numbers, compare numerically
            // "Price" fields usually are numbers
            if (!isNaN(numA) && !isNaN(numB) && window.currentSortColumn.includes('Price')) {
                return window.currentSortDirection === 'asc' ? numA - numB : numB - numA;
            }

            // String compare
            valA = String(valA).toLowerCase();
            valB = String(valB).toLowerCase();

            if (window.currentSortColumn === 'no') {
                valA = valA.includes('-') ? valA.substring(valA.indexOf('-') + 1) : valA;
                valB = valB.includes('-') ? valB.substring(valB.indexOf('-') + 1) : valB;
            }

            if (valA < valB) return window.currentSortDirection === 'asc' ? -1 : 1;
            if (valA > valB) return window.currentSortDirection === 'asc' ? 1 : -1;
            return 0;
        });
    }

    // 3. Render
    window.renderProductsTable(products);
    window.updateSortIcons();
};

window.updateSortIcons = function () {
    // Reset all headers
    document.querySelectorAll('.sortable-header').forEach(th => {
        th.classList.remove('asc', 'desc');
        const icon = th.querySelector('.sort-icon');
        if (icon) {
            // Reset icon (optional logic if we want to change icon type)
            // lucide.createIcons() handles basic rendering, CSS handles rotation
        }
    });

    // Set active header
    if (window.currentSortColumn) {
        // Find the header by onclick attribute to be safe or add data attributes
        // Simple search by onclick text
        const headers = Array.from(document.querySelectorAll('.sortable-header'));
        const activeHeader = headers.find(th => th.getAttribute('onclick').includes(`'${window.currentSortColumn}'`));

        if (activeHeader) {
            activeHeader.classList.add(window.currentSortDirection);
        }
    }
};
// --- MANUAL ORDER LOGIC ---

let manualCart = [];
let manualProducts = [];
let deliveryRegionsCache = {}; // { RegionName: { CompanyName: Price, ... } }

// --- REUSABLE CUSTOM DROPDOWN LOGIC ---
window.setupCustomProductDropdown = function (config) {
    const { inputId, dropdownId, onSelect, limit = null } = config;
    const input = document.getElementById(inputId);
    const dropdown = document.getElementById(dropdownId);

    if (!input || !dropdown) return;

    // Remove old listeners by cloning
    const newInput = input.cloneNode(true);
    input.parentNode.replaceChild(newInput, input);

    // Move dropdown to body to avoid parent transform/clipping contexts
    if (dropdown.parentElement !== document.body) {
        console.log(`Moving dropdown ${dropdownId} to body. Current parent:`, dropdown.parentElement);
        document.body.appendChild(dropdown);
    }

    // HELPER: Position dropdown based on input rect and fixed positioning
    const reposition = () => {
        if (dropdown.classList.contains('hidden')) {
            dropdown.style.display = 'none';
            return;
        }
        const rect = newInput.getBoundingClientRect();
        dropdown.style.display = 'block';
        dropdown.style.top = rect.bottom + 'px';
        dropdown.style.left = rect.left + 'px';
        dropdown.style.width = rect.width + 'px';
        dropdown.style.position = 'fixed';
        dropdown.style.zIndex = '100000'; // Extra high for body-level
    };

    const handleSearch = (e) => {
        const term = e.target.value.toLowerCase().trim();

        // Filter using manualProducts (which holds normalized data)
        let productList = window.manualProducts || [];

        let matches = [];
        if (!term) {
            matches = limit ? productList.slice(0, limit) : productList;
        } else {
            matches = productList.filter(p => {
                const id = String(p.id).toLowerCase();
                const name = String(p.name).toLowerCase();
                return id.includes(term) || name.includes(term);
            });
            if (limit) matches = matches.slice(0, limit);
        }

        if (matches.length === 0) {
            dropdown.innerHTML = '<div class="dropdown-item" style="cursor:default">No matches found</div>';
            dropdown.classList.remove('hidden');
            return;
        }

        dropdown.innerHTML = matches.map(p => `
            <div class="dropdown-item" onclick="window._handleCustomSelect('${inputId}', '${dropdownId}', '${p.id}')">
                <img src="${ASSETS_BASE_URL}${p.id}.jpg" onerror="this.src='${ASSETS_BASE_URL}${p.id}.png'; this.onerror=null;">
                <div class="item-content">
                    <div class="item-name">${p.name}</div>
                    <div class="item-id">${p.id}</div>
                </div>
                <div class="item-price">${p.price.toFixed(3)}</div>
            </div>
        `).join('');

        dropdown.classList.remove('hidden');
        reposition();
    };

    // Attach listener to NEW input
    newInput.addEventListener('input', handleSearch);
    newInput.addEventListener('focus', () => {
        handleSearch({ target: newInput });
        reposition();
    });

    // Handle scroll/resize to keep fixed dropdown aligned
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);

    // CRITICAL: Handle card hover transforms (translateY(-5px))
    const parentCard = newInput.closest('.card') || newInput.closest('.item-tile');
    if (parentCard) {
        // We trigger reposition on mouse events to ensure alignment during hover
        parentCard.addEventListener('mouseenter', () => { setTimeout(reposition, 10); });
        parentCard.addEventListener('mouseleave', () => { setTimeout(reposition, 10); });
        parentCard.addEventListener('mousemove', reposition); // Safety buffer
    }

    // Store callback
    window._customSelectCallbacks = window._customSelectCallbacks || {};
    window._customSelectCallbacks[inputId] = onSelect;
};

window._handleCustomSelect = function (inputId, dropdownId, value) {
    const input = document.getElementById(inputId);
    const dropdown = document.getElementById(dropdownId);
    if (input) input.value = value;
    if (dropdown) {
        dropdown.classList.add('hidden');
        dropdown.style.display = 'none';
    }

    if (window._customSelectCallbacks && window._customSelectCallbacks[inputId]) {
        window._customSelectCallbacks[inputId](value);
    }
};

// Global click outside to close all dropdowns
document.addEventListener('click', (e) => {
    document.querySelectorAll('.custom-dropdown').forEach(d => {
        const inputId = d.id.replace('-dropdown', '-search');
        const input = document.getElementById(inputId) || document.getElementById(d.id.replace('dropdown', 'search'));
        if (!d.contains(e.target) && e.target !== input) {
            d.classList.add('hidden');
        }
    });
});

// Manual Order Search specialization (Legacy wrapper to keep old flow working)
window.handleManualProductSearch = function (e) {
    // This is now handled by setupCustomProductDropdown
    // but we can leave the empty stub or let initCreateOrder handle it
};

// Mobile Sidebar Logic
window.toggleSidebar = function () {
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('sidebar-overlay');

    sidebar.classList.toggle('open');
    if (overlay) overlay.classList.toggle('active');
};

// Close sidebar when clicking overlay
document.addEventListener('DOMContentLoaded', () => {
    // Create overlay if not exists
    if (!document.getElementById('sidebar-overlay')) {
        const overlay = document.createElement('div');
        overlay.id = 'sidebar-overlay';
        overlay.className = 'sidebar-overlay';
        overlay.onclick = window.toggleSidebar;
        document.body.appendChild(overlay);
    }

    // Close sidebar on nav item click (mobile)
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            if (window.innerWidth <= 768) {
                const sidebar = document.querySelector('.sidebar');
                const overlay = document.getElementById('sidebar-overlay');
                if (sidebar.classList.contains('open')) {
                    sidebar.classList.remove('open');
                    if (overlay) overlay.classList.remove('active');
                }
            }
        });
    });
});

window.selectManualProduct = function (id) {
    const input = document.getElementById('mo-product-search');
    const dropdown = document.getElementById('mo-product-dropdown');
    input.value = id;
    dropdown.classList.add('hidden');
    // Optional: Auto-focus quantity or just let user continue
    document.getElementById('mo-qty').focus();
};

window.addToManualCart = function () {
    const searchInput = document.getElementById('mo-product-search');
    const qtyInput = document.getElementById('mo-qty');
    const msgEl = document.getElementById('mo-msg');
    const errEl = document.getElementById('mo-error');

    msgEl.classList.add('hidden');
    errEl.classList.add('hidden');

    const id = searchInput.value.trim();
    const qty = parseInt(qtyInput.value);

    if (!id) {
        errEl.textContent = "Please select a product.";
        errEl.classList.remove('hidden');
        return;
    }

    if (!qty || qty < 1) {
        errEl.textContent = "Invalid quantity.";
        errEl.classList.remove('hidden');
        return;
    }

    // Find product
    const product = manualProducts.find(p => p.id === id);
    if (!product) {
        errEl.textContent = "Product not found. Please select from the list.";
        errEl.classList.remove('hidden');
        return;
    }

    // Check if already in cart? Merge or add new?
    // Let's add new line to allow different customizations if needed, but here simple merge
    const existing = manualCart.find(item => item.id === id);
    if (existing) {
        existing.qty += qty;
    } else {
        manualCart.push({
            id: product.id,
            name: product.name,
            price: product.price,
            image: product.image,
            qty: qty
        });
    }

    // Reset inputs
    searchInput.value = '';
    qtyInput.value = 1;
    document.getElementById('mo-product-dropdown').classList.add('hidden');

    renderManualCart();
    updateManualTotal();
};

window.removeFromManualCart = function (index) {
    manualCart.splice(index, 1);
    renderManualCart();
    updateManualTotal();
};

window.updateManualCartItem = function (index, field, value) {
    if (manualCart[index]) {
        if (field === 'qty') {
            manualCart[index].qty = Math.max(1, parseInt(value) || 1);
        } else if (field === 'price') {
            manualCart[index].price = Math.max(0, parseFloat(value) || 0);
        } else if (field === 'desc') {
            manualCart[index].desc = value;
        }
        renderManualCart();
        updateManualTotal();
    }
};

window.renderManualCart = function () {
    const list = document.getElementById('mo-cart-items');
    if (!list) return;

    if (manualCart.length === 0) {
        list.innerHTML = '<p style="text-align:center; color:var(--text-secondary); margin-top:2rem;">No items added.</p>';
        return;
    }

    list.innerHTML = manualCart.map((item, idx) => `
        <div style="background:var(--bg-darker); padding:10px; border-radius:8px; margin-bottom:8px; border:1px solid var(--border); display:flex; flex-direction:column; gap:10px;">
            <div style="display:flex; gap:10px; align-items:center;">
                <div style="width:40px; height:40px; border-radius:4px; overflow:hidden; background:#000; flex-shrink:0;">
                    <img src="${ASSETS_BASE_URL}${item.id}.jpg" onerror="this.src='${ASSETS_BASE_URL}${item.id}.png'; this.onerror=null;" style="width:100%; height:100%; object-fit:cover;">
                </div>
                <div style="flex:1;">
                    <div style="font-weight:600; font-size:0.9rem;">${item.name}</div>
                    <div style="font-size:0.8rem; color:var(--text-secondary);">#${item.id}</div>
                </div>
                <button onclick="window.removeFromManualCart(${idx})" style="background:none; border:none; color:var(--danger); cursor:pointer; padding:5px;">
                    <i data-lucide="x-circle" style="width:20px; height:20px;"></i>
                </button>
            </div>
            <div style="display:flex; gap:10px; align-items:center;">
                <div style="flex:1;">
                    <label style="font-size:0.75rem; color:var(--text-secondary); display:block; margin-bottom:0.25rem;">Price (JOD)</label>
                    <input type="number" step="0.001" value="${item.price}" onchange="window.updateManualCartItem(${idx}, 'price', this.value)" style="width:100%; padding:0.5rem; background:var(--bg-card); border:1px solid var(--border); border-radius:4px; color:white; font-size:0.85rem;">
                </div>
                <div style="flex:1;">
                    <label style="font-size:0.75rem; color:var(--text-secondary); display:block; margin-bottom:0.25rem;">Quantity</label>
                    <input type="number" min="1" value="${item.qty}" onchange="window.updateManualCartItem(${idx}, 'qty', this.value)" style="width:100%; padding:0.5rem; background:var(--bg-card); border:1px solid var(--border); border-radius:4px; color:white; font-size:0.85rem;">
                </div>
                <div style="text-align:right; min-width:80px;">
                    <label style="font-size:0.75rem; color:var(--text-secondary); display:block; margin-bottom:0.25rem;">Total</label>
                    <div style="font-weight:bold; font-size:0.95rem; margin-top:0.4rem;">${(item.price * item.qty).toFixed(3)}</div>
                </div>
            </div>
            <div>
                <input type="text" placeholder="Add custom description for this item..." value="${item.desc || ''}" onchange="window.updateManualCartItem(${idx}, 'desc', this.value)" style="width:100%; padding:0.5rem; background:var(--bg-card); border:1px solid var(--border); border-radius:4px; color:white; font-size:0.85rem;">
            </div>
        </div>
    `).join('');

    if (window.lucide) lucide.createIcons();
};

// manualProducts and manualCart are global

window.initCreateOrder = async function () {
    console.log("Initializing Manual Order View...");

    // 1. Load products if missing
    if (!window.allProducts || window.allProducts.length === 0) {
        try {
            await initProductData();
        } catch (e) {
            console.error("Create Order: Failed to load products", e);
            document.getElementById('mo-error').textContent = "Failed to load products. detailed error in console.";
            document.getElementById('mo-error').classList.remove('hidden');
        }
    }

    // 2. Populate manualProducts for search
    if (window.allProducts) {
        // Update global manualProducts
        // Empty array first to avoid duplicates if re-run (though map ref is new)
        manualProducts.length = 0;
        const mapped = window.allProducts.map(p => ({
            id: p['No'],
            name: p['Name on Store'] || p['product name'],
            price: parseFloat(p['Price < 25 QTY'] || 0),
            image: `${ASSETS_BASE_URL}${p['No']}.jpg`
        })).filter(p => p.id && p.name);

        manualProducts.push(...mapped);
        console.log(`Create Order: Populated ${manualProducts.length} manual products.`);
    }

    // 3. Reset UI
    manualCart = [];
    renderManualCart();
    updateManualTotal();

    // 4. Attach Listeners
    window.setupCustomProductDropdown({
        inputId: 'mo-product-search',
        dropdownId: 'mo-product-dropdown',
        onSelect: (id) => {
            document.getElementById('mo-qty').focus();
        },
        limit: null // Show all
    });

    if (window.manualProducts.length === 0) await window.loadManualProducts();
    await window.loadDeliveryDetails();
};
// End initCreateOrder

// Bind Buttons (Global or inside init? Global is better if elements exist, but elements might be in a template)
// Actually they are in index.html (admin.html) so they exist on load (or are hidden)
// But if they are inside a view that is cloned... `mo-add-btn` is inside `view-create-order`.
// The cloning in other parts might break these listeners if we aren't careful.
// Let's bind them SAFELY inside initCreateOrder or here with checks.
const bindBtn = (id, handler) => {
    const el = document.getElementById(id);
    if (el) el.onclick = handler;
};
bindBtn('mo-add-btn', addToManualCart);
bindBtn('mo-create-btn', submitManualOrder);
const regionEl = document.getElementById('mo-region');
if (regionEl) regionEl.onchange = updateManualDeliveryOptions;

async function loadManualProducts() {
    const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSTejg41yuaKcYa0CbOodUP9osmE5DIv8ZNQyMXlHJLLh2pQUZ5EoMT93UgV3LZfhAJcPEL8uEfK9Y4/pub?gid=897526080&single=true&output=csv';
    try {
        const res = await fetch(CSV_URL);
        const text = await res.text();

        Papa.parse(text, {
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
                const data = results.data;
                // Normalize keys logic simplified from app.js
                const keys = Object.keys(data[0] || {});
                const productKey = keys.find(k => k.toLowerCase().includes('name on store')) || keys.find(k => k.toLowerCase().includes('product name'));
                const priceKey = keys.find(k => k.toLowerCase().includes('price') && k.includes('<'));
                const idKey = keys.find(k => k.toLowerCase().includes('no'));
                const imgKey = keys.find(k => k.toLowerCase().includes('image'));

                manualProducts = data.map(item => ({
                    name: item[productKey] || 'Unknown',
                    price: parseFloat((item[priceKey] || '0').replace(/[^\d.]/g, '')),
                    id: item[idKey] || 'N/A',
                    image: item[imgKey]
                })).filter(p => !isNaN(p.price));

                console.log(`Manual Order: Loaded ${manualProducts.length} products.`);
                // populateProductDatalist(); // Removed
            }
        });
    } catch (e) {
        console.error("Failed to load products for manual order", e);
    }
}

// function populateProductDatalist() { ... } // Removed

async function loadDeliveryDetails() {
    try {
        // Embed delivery companies directly for Vercel support
        const companies = [
            {
                "Name": "Aramex",
                "Regions": {
                    "Amman": 4, "Ajloon": 4, "Al Fanadik": 4, "Al Hashmyeh": 4, "Al Jafer": 4, "Al Omari Borders": 4, "Al Qaser": 4, "Al Qastal": 4, "Al Rosaifa": 4, "Al Sukhneh": 4, "AAy": 4, "Aqaba": 4, "Azraq": 4, "Balqa": 4, "Bereian": 4, "Der Allah": 4, "Dulail": 4, "Free Zone": 4, "Fuhais": 4, "Ghour": 4, "Ghour Al Safi": 4, "Ghweria": 4, "Irbid": 4, "Jerash": 4, "Karak": 4, "Khaldieh": 4, "MaAn / Maan": 4, "Madaba": 4, "Mahes": 4, "Moatah": 4, "Moghayam Hetein": 4, "Mwaqar": 4, "Naour": 4, "Petra": 4, "Qwaireh": 4, "Ramtha": 4, "Rashadyeh": 4, "Rwaished": 4, "Salt": 4, "Shoubak": 4, "Shouneh": 4, "Tafileh": 4, "Theban": 4, "Wadi Mousa": 4, "Yajoz": 4, "Zarqa": 4, "Zarqa Al Jadedeh": 4, "Zone 1": 4, "Zone 2": 4
                }
            },
            {
                "Name": "Bee-X",
                "Regions": {
                    "Amman": 2.5, "Ajloon": 3, "Al Fanadik": 3, "Al Hashmyeh": 3, "Al Jafer": 3, "Al Omari Borders": 3, "Al Qaser": 3, "Al Qastal": 3, "Al Rosaifa": 3, "Al Sukhneh": 3, "AAy": 3, "Aqaba": 3, "Azraq": 3, "Balqa": 3, "Bereian": 3, "Der Allah": 3, "Dulail": 3, "Free Zone": 3, "Fuhais": 3, "Ghour": 3, "Ghour Al Safi": 3, "Ghweria": 3, "Irbid": 3, "Jerash": 3, "Karak": 3, "Khaldieh": 3, "MaAn / Maan": 3, "Madaba": 3, "Mahes": 3, "Moatah": 3, "Moghayam Hetein": 3, "Mwaqar": 3, "Naour": 3, "Petra": 3, "Qwaireh": 3, "Ramtha": 3, "Rashadyeh": 3, "Rwaished": 3, "Salt": 3, "Shoubak": 3, "Shouneh": 3, "Tafileh": 3, "Theban": 3, "Wadi Mousa": 3, "Yajoz": 3, "Zarqa": 3, "Zarqa Al Jadedeh": 3, "Zone 1": 3, "Zone 2": 3
                }
            },
            {
                "Name": "DLX",
                "Regions": {
                    "Amman": 2, "Ajloon": 3, "Al Fanadik": 3, "Al Hashmyeh": 3, "Al Jafer": 3, "Al Omari Borders": 3, "Al Qaser": 3, "Al Qastal": 3, "Al Rosaifa": 3, "Al Sukhneh": 3, "AAy": 3, "Aqaba": 3, "Azraq": 3, "Balqa": 3, "Bereian": 3, "Der Allah": 3, "Dulail": 3, "Free Zone": 3, "Fuhais": 3, "Ghour": 3, "Ghour Al Safi": 3, "Ghweria": 3, "Irbid": 3, "Jerash": 3, "Karak": 3, "Khaldieh": 3, "MaAn / Maan": 3, "Madaba": 3, "Mahes": 3, "Moatah": 3, "Moghayam Hetein": 3, "Mwaqar": 3, "Naour": 3, "Petra": 3, "Qwaireh": 3, "Ramtha": 3, "Rashadyeh": 3, "Rwaished": 3, "Salt": 3, "Shoubak": 3, "Shouneh": 3, "Tafileh": 3, "Theban": 3, "Wadi Mousa": 3, "Yajoz": 3, "Zarqa": 3, "Zarqa Al Jadedeh": 3, "Zone 1": 3, "Zone 2": 3
                }
            },
            {
                "Name": "FLEET Go",
                "Regions": {
                    "Amman": 1.5, "Ajloon": 2, "Al Fanadik": 2, "Al Hashmyeh": 2, "Al Jafer": 2, "Al Omari Borders": 2, "Al Qaser": 2, "Al Qastal": 2, "Al Rosaifa": 2, "Al Sukhneh": 2, "AAy": 2, "Aqaba": 2, "Azraq": 2, "Balqa": 2, "Bereian": 2, "Der Allah": 2, "Dulail": 2, "Free Zone": 2, "Fuhais": 2, "Ghour": 2, "Ghour Al Safi": 2, "Ghweria": 2, "Irbid": 2, "Jerash": 2, "Karak": 2, "Khaldieh": 2, "MaAn / Maan": 2, "Madaba": 2, "Mahes": 2, "Moatah": 2, "Moghayam Hetein": 2, "Mwaqar": 2, "Naour": 2, "Petra": 2, "Qwaireh": 2, "Ramtha": 2, "Rashadyeh": 2, "Rwaished": 2, "Salt": 2, "Shoubak": 2, "Shouneh": 2, "Tafileh": 2, "Theban": 2, "Wadi Mousa": 2, "Yajoz": 2, "Zarqa": 2, "Zarqa Al Jadedeh": 2, "Zone 1": 2, "Zone 2": 2
                }
            },
            {
                "Name": "Ordergy",
                "Regions": {
                    "Amman": 3, "Ajloon": 4, "Al Fanadik": 4, "Al Hashmyeh": 4, "Al Jafer": 4, "Al Omari Borders": 4, "Al Qaser": 4, "Al Qastal": 4, "Al Rosaifa": 4, "Al Sukhneh": 4, "AAy": 4, "Aqaba": 4, "Azraq": 4, "Balqa": 4, "Bereian": 4, "Der Allah": 4, "Dulail": 4, "Free Zone": 4, "Fuhais": 4, "Ghour": 4, "Ghour Al Safi": 4, "Ghweria": 4, "Irbid": 4, "Jerash": 4, "Karak": 4, "Khaldieh": 4, "MaAn / Maan": 4, "Madaba": 4, "Mahes": 4, "Moatah": 4, "Moghayam Hetein": 4, "Mwaqar": 4, "Naour": 4, "Petra": 4, "Qwaireh": 4, "Ramtha": 4, "Rashadyeh": 4, "Rwaished": 4, "Salt": 4, "Shoubak": 4, "Shouneh": 4, "Tafileh": 4, "Theban": 4, "Wadi Mousa": 4, "Yajoz": 4, "Zarqa": 4, "Zarqa Al Jadedeh": 4, "Zone 1": 4, "Zone 2": 4
                }
            },
            {
                "Name": "Transporter",
                "Regions": {
                    "Amman": 1.5, "Ajloon": 2.5, "Al Fanadik": 2.5, "Al Hashmyeh": 2.5, "Al Jafer": 2.5, "Al Omari Borders": 2.5, "Al Qaser": 2.5, "Al Qastal": 2.5, "Al Rosaifa": 2.5, "Al Sukhneh": 2.5, "AAy": 2.5, "Aqaba": 2.5, "Azraq": 2.5, "Balqa": 2.5, "Bereian": 2.5, "Der Allah": 2.5, "Dulail": 2.5, "Free Zone": 2.5, "Fuhais": 2.5, "Ghour": 2.5, "Ghour Al Safi": 2.5, "Ghweria": 2.5, "Irbid": 2.5, "Jerash": 2.5, "Karak": 2.5, "Khaldieh": 2.5, "MaAn / Maan": 2.5, "Madaba": 2.5, "Mahes": 2.5, "Moatah": 2.5, "Moghayam Hetein": 2.5, "Mwaqar": 2.5, "Naour": 2.5, "Petra": 2.5, "Qwaireh": 2.5, "Ramtha": 2.5, "Rashadyeh": 2.5, "Rwaished": 2.5, "Salt": 2.5, "Shoubak": 2.5, "Shouneh": 2.5, "Tafileh": 2.5, "Theban": 2.5, "Wadi Mousa": 2.5, "Yajoz": 2.5, "Zarqa": 2.5, "Zarqa Al Jadedeh": 2.5, "Zone 1": 2.5, "Zone 2": 2.5
                }
            }
        ];

        deliveryRegionsCache = {};

        companies.forEach(comp => {
            const companyName = comp.Name;
            const regions = comp.Regions;

            for (const [regionName, price] of Object.entries(regions)) {
                if (!deliveryRegionsCache[regionName]) {
                    deliveryRegionsCache[regionName] = {};
                }
                deliveryRegionsCache[regionName][companyName] = price;
            }
        });

        // Populate Region Select
        const regionSelect = document.getElementById('mo-region');
        if (regionSelect) {
            regionSelect.innerHTML = '<option value="">-- Select Region --</option>' +
                Object.keys(deliveryRegionsCache).sort().map(r => `<option value="${r}">${r}</option>`).join('');
        }

        console.log("Delivery details loaded from embedded config.");

    } catch (e) {
        console.error("Failed to load delivery details", e);
    }
}

function updateManualDeliveryOptions() {
    const region = document.getElementById('mo-region').value;
    const listContainer = document.getElementById('mo-delivery-list');
    const companyInput = document.getElementById('mo-company-input');

    listContainer.innerHTML = '';
    companyInput.value = '';

    if (!region || !deliveryRegionsCache[region]) {
        listContainer.innerHTML = '<div style="text-align:center; color:var(--text-secondary); padding:1rem;">Select a region to see options</div>';
        updateManualTotal();
        return;
    }

    const companies = deliveryRegionsCache[region];

    // Sort companies by price ascending? or Keep original order?
    // Let's sort by price for better UX
    const sortedEntries = Object.entries(companies).sort((a, b) => a[1] - b[1]);

    sortedEntries.forEach(([comp, price]) => {
        const card = document.createElement('div');
        card.className = 'delivery-option-card';
        card.dataset.name = comp;
        card.dataset.price = price;

        card.innerHTML = `
            <span class="delivery-company-name">${comp}</span>
            <span class="delivery-company-price">${price.toFixed(3)} JOD</span>
        `;

        card.onclick = () => {
            // Deselect others
            document.querySelectorAll('.delivery-option-card').forEach(c => c.classList.remove('selected'));
            // Select this
            card.classList.add('selected');

            // Update Input
            companyInput.value = comp;

            updateManualTotal();
        };

        listContainer.appendChild(card);
    });

    updateManualTotal();
}


window.toggleManualDelivery = function (isDelivery) {
    const deliveryGroup = document.getElementById('mo-delivery-group');

    if (isDelivery) {
        deliveryGroup.style.display = 'block';
    } else {
        deliveryGroup.style.display = 'none';
        // Reset selection
        document.querySelectorAll('.delivery-option-card').forEach(c => c.classList.remove('selected'));
        document.getElementById('mo-company-input').value = "";
    }
    updateManualTotal();
}

function updateManualTotal() {
    const subtotal = manualCart.reduce((sum, item) => sum + (item.price * item.qty), 0);

    let delivery = 0;
    const isDelivery = document.querySelector('input[name="mo-method"]:checked').value === 'delivery';

    if (isDelivery) {
        const selectedCard = document.querySelector('.delivery-option-card.selected');
        if (selectedCard) {
            delivery = parseFloat(selectedCard.dataset.price);
        }
    }

    const currency = document.getElementById('mo-currency').value || 'JOD';

    document.getElementById('mo-subtotal').textContent = subtotal.toFixed(3) + ' ' + currency;
    document.getElementById('mo-delivery').textContent = delivery.toFixed(3) + ' ' + currency;
    document.getElementById('mo-total').textContent = (subtotal + delivery).toFixed(3) + ' ' + currency;
}

async function submitManualOrder() {
    const name = document.getElementById('mo-name').value;
    const phone = document.getElementById('mo-phone').value;
    const region = document.getElementById('mo-region').value;
    const address = document.getElementById('mo-address').value;
    const payment = document.getElementById('mo-payment').value;
    const currency = document.getElementById('mo-currency').value || 'JOD';

    // Check method
    const isDelivery = document.querySelector('input[name="mo-method"]:checked').value === 'delivery';
    const company = document.getElementById('mo-company-input').value; // Get from hidden input

    const msgEl = document.getElementById('mo-msg');
    const errEl = document.getElementById('mo-error');
    msgEl.classList.add('hidden');
    errEl.classList.add('hidden');

    // Validation
    if (!name || manualCart.length === 0) {
        errEl.textContent = "Please fill in customer name and add items.";
        errEl.classList.remove('hidden');
        return;
    }

    if (isDelivery && (!region || !company)) {
        errEl.textContent = "Please select a region and a delivery company.";
        errEl.classList.remove('hidden');
        return;
    }

    const totalText = document.getElementById('mo-total').textContent;

    const order = {
        id: 'MAN-' + Date.now(),
        customerName: name,
        customerPhone: phone || "N/A",
        selectedRegion: region || "N/A",
        selectedCompany: isDelivery ? company : "Pickup",
        address: address || "N/A",
        items: manualCart.map((item, idx) => {
            let descStr = item.desc ? ` - Note: ${item.desc}` : '';
            return `${idx + 1}. [${item.id}] (Default) - ${item.price.toFixed(3)} - ${item.name} (Qty: ${item.qty})${descStr}`;
        }),
        total: totalText,
        method: isDelivery ? 'delivery' : 'pickup',
        paymentMethod: payment,
        status: 'Pending',
        timestamp: Date.now() / 1000,
        date: new Date().toISOString(),
        currency: currency,
        calculate_delivery: true,
        delivery_fee: isDelivery ? (() => {
            const selectedCard = document.querySelector('.delivery-option-card.selected');
            return selectedCard ? parseFloat(selectedCard.dataset.price) : 0;
        })() : 0
    };

    try {
        // Try Direct GitHub Commit first if token is present
        const ghToken = localStorage.getItem('github_token');
        if (ghToken) {
            try {
                const commitRes = await window.commitOrderToGithub(order);
                if (commitRes.success) {
                    console.log("Admin: Order committed directly to GitHub CSV.");
                } else {
                    console.warn("Admin: Direct GitHub commit failed, falling back to GAS/Supabase.", commitRes.error);
                }
            } catch (e) {
                console.warn("Admin: Direct GitHub commit exception:", e);
            }
        }

        // Try GAS if configured
        const GAS_URL = (document.getElementById('settings-google-script-url')?.value || document.getElementById('google-script-url')?.value)?.trim();

        if (GAS_URL && window.submitToGas) {
            try {
                // Synchronously await GAS or don't block? Let's await to ensure success
                await window.submitToGas(GAS_URL, {
                    action: 'placeOrder',
                    order: order
                });
            } catch (e) {
                console.warn("GAS submission failed, order will only be saved locally.", e);
            }
        }

        // Try Supabase first (primary for static hosts like GitHub Pages)
        let savedToDb = false;
        if (window.supabaseClient) {
            try {
                console.log("Admin: Saving manual order to Supabase...");
                const { error } = await window.supabaseClient.from('orders').insert([{
                    id: order.id,
                    address: order.address,
                    currency: order.currency,
                    customerName: order.customerName,
                    customerPhone: order.customerPhone,
                    date: order.date,
                    items: JSON.stringify(order.items), // stringify array of items
                    method: order.method,
                    paymentMethod: order.paymentMethod,
                    selectedCompany: order.selectedCompany,
                    selectedRegion: order.selectedRegion,
                    status: order.status,
                    timestamp: Math.floor(order.timestamp).toString(),
                    total: order.total,
                    calculate_delivery: order.calculate_delivery,
                    delivery_fee: order.delivery_fee
                }]);
                if (error) throw error;
                savedToDb = true;
                console.log("Admin: Order saved to Supabase successfully.");
            } catch (err) {
                console.error("Admin: Supabase manual order insert error:", err);
            }
        }

        // Fallback to local API if Supabase failed/unavailable and we are NOT on static hosting
        if (!savedToDb) {
            if (window.location.hostname.includes('github.io')) {
                console.warn("Admin: Local API disabled on GitHub Pages. Order relies solely on GAS endpoint above.");
                // We won't throw because the GAS call might have succeeded
            } else {
                const res = await fetch('/api/orders', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(order)
                });
                if (!res.ok) throw new Error("Server error, status: " + res.status);
                const json = await res.json();
                if (json.status !== 'success') throw new Error(json.error || "Unknown error");
            }
        }

        msgEl.textContent = "Order created successfully!";
        msgEl.classList.remove('hidden');
        
        // --- ADD TO PENDING CHANGES FOR INSTANT UI FEEDBACK ---
        if (!window.pendingChanges) window.pendingChanges = {};
        window.pendingChanges[order.id] = {
            timestamp: Date.now(),
            isNew: true, // Flag as new order
            data: order
        };
        savePendingChanges();

        // Clear Form
        manualCart = [];
        document.getElementById('mo-name').value = '';
        document.getElementById('mo-phone').value = '';
        document.getElementById('mo-address').value = '';
        document.getElementById('mo-company-input').value = '';
        const listContainer = document.getElementById('mo-delivery-list');
        if (listContainer) listContainer.innerHTML = '<div style="text-align:center; color:var(--text-secondary); padding:1rem;">Select a region first</div>';

        renderManualCart();
        // Redirect after 1s
        setTimeout(() => {
            document.querySelector('.nav-item[data-view="orders"]').click();
            loadData();
        }, 1000);

    } catch (e) {
        errEl.textContent = "Error creating order: " + e.message;
        errEl.classList.remove('hidden');
    }
}

// --- SHARED UTILS ---

window.submitToGas = async function (url, data) {
    // GAS Web App submission
    const payload = JSON.stringify(data);

    try {
        const res = await fetch(url, {
            method: 'POST',
            mode: 'cors', // Switch to cors to actually read success/failure
            headers: {
                'Content-Type': 'text/plain;charset=utf-8',
            },
            body: payload
        });

        if (res.ok) {
            const json = await res.json().catch(() => ({ status: 'success' }));
            if (json.status === 'error' || json.error) {
                console.error("GAS Internal Error:", json);
                return { result: "error", error: json.error || json.message };
            }
            return { result: "success", data: json };
        } else {
            const text = await res.text().catch(() => "Unknown error");
            console.error("GAS Fetch Error:", res.status, text);
            return { result: "error", error: `HTTP ${res.status}: ${text}` };
        }
    } catch (e) {
        console.error("submitToGas Network Error:", e);
        // Fallback to no-cors if preflight fails? No, better to know it failed.
        return { result: "error", error: e.message };
    }
}

// --- ADMIN MANAGEMENT & THEME LOGIC ---

// Theme Logic
window.initTheme = function () {
    const savedTheme = localStorage.getItem('theme');
    const isLight = savedTheme === 'light';

    if (isLight) {
        document.documentElement.setAttribute('data-theme', 'light');
    } else {
        document.documentElement.removeAttribute('data-theme');
    }

    // Sync UI elements
    const checkbox = document.getElementById('theme-toggle-checkbox');
    if (checkbox) checkbox.checked = isLight;

    const topBtn = document.getElementById('theme-toggle-top');
    if (topBtn) {
        topBtn.innerHTML = `<i data-lucide="${isLight ? 'sun' : 'moon'}"></i>`;
        if (window.lucide) lucide.createIcons();
    }
};

window.toggleTheme = function () {
    const currentTheme = localStorage.getItem('theme');
    const newTheme = (currentTheme === 'light') ? 'dark' : 'light';
    const isLight = newTheme === 'light';

    if (isLight) {
        document.documentElement.setAttribute('data-theme', 'light');
        localStorage.setItem('theme', 'light');
    } else {
        document.documentElement.removeAttribute('data-theme');
        localStorage.setItem('theme', 'dark');
    }

    // Sync UI elements
    const checkbox = document.getElementById('theme-toggle-checkbox');
    if (checkbox) checkbox.checked = isLight;

    const topBtn = document.getElementById('theme-toggle-top');
    if (topBtn) {
        topBtn.innerHTML = `<i data-lucide="${isLight ? 'sun' : 'moon'}"></i>`;
        if (window.lucide) lucide.createIcons();
    }
};

// Call initTheme immediately
window.initTheme();


// Admin Management Logic

window.loadAdminsForManagement = async function () {
    try {
        const res = await fetch('/api/admins');
        const admins = await res.json();
        const tbody = document.getElementById('admin-list-body');
        if (!tbody) return;

        tbody.innerHTML = admins.map(admin => `
            <tr>
                <td style="font-weight:600;">${admin.username}</td>
                <td><span class="status-badge status-active">Active</span></td>
                <td>
                    <div class="action-buttons">
                        <button class="btn-icon" title="Change Password" onclick="window.openChangePassModal('${admin.username}')">
                            <i data-lucide="key" style="width:16px; height:16px; pointer-events: none;"></i>
                        </button>
                        <button class="btn-icon btn-delete" title="Remove Admin" onclick="window.handleRemoveAdmin('${admin.username}')">
                            <i data-lucide="trash-2" style="width:16px; height:16px; pointer-events: none;"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');

        if (window.lucide) lucide.createIcons();
    } catch (e) {
        console.error("Failed to load admins from API. Trying fallback...", e);
        // Fallback to local array loaded at startup
        const tbody = document.getElementById('admin-list-body');
        if (!tbody) return;

        if (ADMIN_USERS.length > 0) {
            tbody.innerHTML = ADMIN_USERS.map(u => `
                <tr>
                    <td style="font-weight:600;">${u.email}</td>
                    <td><span class="status-badge status-active">Active (File)</span></td>
                    <td>
                        <span style="font-size:0.8rem; color:grey;">Read Only</span>
                    </td>
                </tr>
            `).join('');
        } else {
            tbody.innerHTML = '<tr><td colspan="3">No admins loaded.</td></tr>';
        }
    }
};

window.showAddAdminModal = function () {
    document.getElementById('new-admin-username').value = '';
    document.getElementById('new-admin-password').value = '';
    const m = document.getElementById('add-admin-modal');
    m.classList.remove('hidden');
    requestAnimationFrame(() => m.classList.add('open'));
};

window.handleAddAdmin = async function () {
    const username = document.getElementById('new-admin-username').value.trim();
    const password = document.getElementById('new-admin-password').value.trim();

    if (!username || !password) {
        alert("Please enter username and password.");
        return;
    }

    let supabaseSuccess = false;
    if (window.supabaseClient) {
        try {
            console.log("Saving admin to Supabase...");
            const { error } = await window.supabaseClient.from('admins').insert({ username, password });
            if (error) throw error;
            console.log("Admin added to Supabase.");
            supabaseSuccess = true;

            // Update local array for immediate viewing
            ADMIN_USERS.push({ email: username, pass: password });
            alert("Admin added successfully.");
            const m = document.getElementById('add-admin-modal');
            m.classList.remove('open');
            setTimeout(() => m.classList.add('hidden'), 300);
            window.loadAdminsForManagement();
            loadCredentials();
        } catch (e) {
            console.error("Supabase Add Admin Error:", e);
        }
    }

    if (supabaseSuccess) return;

    alert("Adding an admin is disabled on static GitHub Pages. Update adminCredentials.txt directly.");
    return;

    try {
        const res = await fetch('/api/admins', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const json = await res.json();
        if (json.error) throw new Error(json.error);

        alert("Admin added successfully.");
        const m = document.getElementById('add-admin-modal');
        m.classList.remove('open');
        setTimeout(() => m.classList.add('hidden'), 300);
        window.loadAdminsForManagement();
        // Reload global creds without refreshing page if we want immediate login effect
        loadCredentials();
    } catch (e) {
        alert("Error: " + e.message);
    }
};

window.handleRemoveAdmin = async function (username) {
    if (!confirm(`Are you sure you want to remove admin access for ${username}?`)) return;

    let supabaseSuccess = false;
    if (window.supabaseClient) {
        try {
            console.log("Removing admin from Supabase...");
            const { error } = await window.supabaseClient.from('admins').delete().eq('username', username);
            if (error) throw error;
            console.log("Admin removed from Supabase.");
            supabaseSuccess = true;

            // Remove from local array
            const index = ADMIN_USERS.findIndex(u => u.email === username);
            if (index > -1) ADMIN_USERS.splice(index, 1);

            window.loadAdminsForManagement();
            loadCredentials();
        } catch (e) {
            console.error("Supabase Remove Admin Error:", e);
        }
    }

    if (supabaseSuccess) return;

    alert("Deleting an admin is disabled on static GitHub Pages. Update adminCredentials.txt directly.");
    return;

    try {
        const res = await fetch('/api/admins', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username })
        });
        const json = await res.json();
        if (json.error) throw new Error(json.error);

        window.loadAdminsForManagement();
        loadCredentials();
    } catch (e) {
        alert("Error: " + e.message);
    }
};

window.openChangePassModal = function (username) {
    document.getElementById('edit-admin-username').value = username;
    document.getElementById('edit-admin-display').textContent = `Updating password for: ${username}`;
    document.getElementById('new-admin-pass-update').value = '';
    const m = document.getElementById('change-pass-modal');
    m.classList.remove('hidden');
    requestAnimationFrame(() => m.classList.add('open'));
};

window.handleUpdateAdmin = async function () {
    const username = document.getElementById('edit-admin-username').value;
    const newPassword = document.getElementById('new-admin-pass-update').value.trim();

    if (!newPassword) {
        alert("Please enter a new password.");
        return;
    }

    let supabaseSuccess = false;
    if (window.supabaseClient) {
        try {
            console.log("Updating admin in Supabase...");
            const { error } = await window.supabaseClient.from('admins').update({ password: newPassword }).eq('username', username);
            if (error) throw error;
            console.log("Admin updated in Supabase.");
            supabaseSuccess = true;

            // Update local array
            const user = ADMIN_USERS.find(u => u.email === username);
            if (user) user.pass = newPassword;

            alert("Password updated successfully.");
            const m = document.getElementById('change-pass-modal');
            m.classList.remove('open');
            setTimeout(() => m.classList.add('hidden'), 300);
            loadCredentials();
        } catch (e) {
            console.error("Supabase Update Admin Error:", e);
        }
    }

    if (supabaseSuccess) return;

    alert("Changing credentials via dashboard is disabled on static GitHub Pages. Update the adminCredentials.txt directly in your repository.");
    return;

    try {
        const res = await fetch('/api/admins', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, newPassword })
        });
        const json = await res.json();
        if (json.error) throw new Error(json.error);

        alert("Password updated successfully.");
        const m = document.getElementById('change-pass-modal');
        m.classList.remove('open');
        setTimeout(() => m.classList.add('hidden'), 300);
        loadCredentials();
    } catch (e) {
        alert("Error: " + e.message);
    }
};

// Hook into showDashboard to refresh admin list when Settings is opened? 
// Or better: add a click listener to the Settings nav item.
document.addEventListener('DOMContentLoaded', () => {
    const settingsNav = document.querySelector('.nav-item[data-view="settings"]');
    if (settingsNav) {
        settingsNav.addEventListener('click', () => {
            if (sessionStorage.getItem('admin_logged_in') === 'true') {
                window.loadAdminsForManagement();
            }
        });
    }
});
