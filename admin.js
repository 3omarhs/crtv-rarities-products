// Admin Portal Logic
console.log("!!! ADMIN JS V3.5 LOADED !!!");
document.title = "Admin Portal (Debug Mode V3.5)";

// Global handler for item clicks to avoid inline JS issues


let ADMIN_USERS = [];

async function loadCredentials() {
    try {
        // Add cache busting to ensure we get the latest file content
        const response = await fetch('adminCredentials.txt?v=' + new Date().getTime());
        if (!response.ok) throw new Error("Failed to load credentials");
        const text = await response.text();
        const lines = text.split(/\r?\n/);

        ADMIN_USERS = []; // Clear existing
        let currentUser = {};

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) {
                // Empty line acts as delimiter/commit for previous user
                if (currentUser.email && currentUser.pass) {
                    ADMIN_USERS.push(currentUser);
                    currentUser = {};
                }
                continue;
            }

            // Robust parsing: Split only on first colon to support passwords with colons
            const firstColon = line.indexOf(':');
            if (firstColon === -1) continue;

            const key = line.substring(0, firstColon).trim().toLowerCase(); // Normalize key
            const value = line.substring(firstColon + 1).trim();

            if (key === 'username') {
                // If starting a new user block without an empty line separator
                if (currentUser.email && currentUser.pass) {
                    ADMIN_USERS.push(currentUser);
                    currentUser = {};
                }
                currentUser.email = value.toLowerCase();
            } else if (key === 'password') {
                currentUser.pass = value;
            }
        }

        // Push the final user if exists
        if (currentUser.email && currentUser.pass) {
            ADMIN_USERS.push(currentUser);
        }

        console.log(`Admin: Loaded ${ADMIN_USERS.length} users.`);

    } catch (e) {
        console.error("Admin: Could not load credentials", e);
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    await loadCredentials();

    // Check Session
    if (sessionStorage.getItem('admin_logged_in') === 'true') {
        showDashboard();
    } else {
        showLogin();
    }

    // Initialize Icons
    if (window.lucide) lucide.createIcons();

    // Login Form Handler
    document.getElementById('login-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const email = document.getElementById('admin-email').value;
        const pass = document.getElementById('admin-password').value;
        const err = document.getElementById('login-error');

        const validUser = ADMIN_USERS.find(u =>
            u.email === email.trim().toLowerCase() && u.pass === pass
        );

        if (validUser) {
            sessionStorage.setItem('admin_logged_in', 'true');
            err.classList.add('hidden');
            showDashboard();
        } else {
            err.classList.remove('hidden');
        }
    });

    // Navigation Handler
    document.querySelectorAll('.nav-item[data-view]').forEach(btn => {
        btn.addEventListener('click', () => {
            // Update Active State
            document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Show View
            const viewId = `view-${btn.dataset.view}`;
            document.querySelectorAll('.view-section').forEach(v => v.classList.add('hidden'));
            document.getElementById(viewId).classList.remove('hidden');
            document.getElementById('page-title').textContent = btn.textContent.trim();
            if (btn.dataset.view === 'products') loadProducts();
        });
    });

    // Logout
    document.getElementById('logout-btn').addEventListener('click', () => {
        sessionStorage.removeItem('admin_logged_in');
        window.location.reload();
    });

    document.getElementById('refresh-products-btn')?.addEventListener('click', loadProducts);

    // Add Product Form Handler
    const addProductForm = document.getElementById('add-product-form');
    if (addProductForm) {
        addProductForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const msg = document.getElementById('add-product-msg');
            const err = document.getElementById('add-product-error');
            msg.classList.add('hidden');
            err.classList.add('hidden');

            const form = e.target;
            const formData = new FormData(form);
            const data = Object.fromEntries(formData.entries());

            const no = data['No'].trim();
            if (!no) {
                err.textContent = "Item Number is required";
                err.classList.remove('hidden');
                return;
            }

            // 1. Validate GAS URL
            const gasUrl = document.getElementById('google-script-url').value.trim();
            if (!gasUrl) {
                err.textContent = "Please provide the Google Apps Script URL.";
                err.classList.remove('hidden');
                return;
            }

            const submitBtn = form.querySelector('button[type="submit"]');
            const originalBtnText = submitBtn.innerText;

            // Show loading
            const loading = document.getElementById('loading-modal');
            loading.classList.remove('hidden');
            submitBtn.disabled = true;
            submitBtn.innerText = "Processing...";

            // 2. Prepare Data for GAS
            const action = document.getElementById('product-action').value || 'addProduct';
            const gasData = {
                'action': action,
                'No': no,
                'Name on Store': data['Name on Store'], // Input renamed to match column
                // 'product name' key removed to prevent overwriting
                'Arabic Name': data['Arabic Name'],
                'category': data['category'],
                'collection': data['collection'],
                'description (80 word)': data['description (80 word)'],
                'Dimensions(mm) x y z': data['Dimensions(mm) x y z'],
                'Colors': data['Colors'],
                'Price < 25 QTY': data['Price < 25 QTY'],
                // Add logic for image
            };

            // 3. Handle Image (Convert to Base64)
            const fileInput = document.getElementById('product-image-upload');
            if (fileInput && fileInput.files.length > 0) {
                const file = fileInput.files[0];
                const reader = new FileReader();

                reader.onerror = function () {
                    console.error("FileReader error");
                    loading.classList.add('hidden');
                    submitBtn.disabled = false;
                    submitBtn.innerText = originalBtnText;
                    err.textContent = "Failed to read file";
                    err.classList.remove('hidden');
                };

                reader.onload = async function (e) {
                    const base64 = e.target.result.split(',')[1]; // Remove data:image/...;base64,
                    gasData.image = base64;
                    const ext = file.name.split('.').pop();
                    const newFileName = `${no}.${ext}`;
                    gasData.imageName = newFileName; // Rename to ItemNo.ext
                    gasData.mimeType = file.type;

                    // --- LOCAL UPLOAD ---
                    try {
                        console.log("Uploading image locally...");
                        const localRes = await fetch('/api/upload-image', {
                            method: 'POST',
                            body: file, // Send raw part
                            headers: {
                                'X-Filename': newFileName
                            }
                        });
                        if (localRes.ok) {
                            console.log("Local upload success");
                        } else {
                            console.error("Local upload failed");
                        }
                    } catch (uploadErr) {
                        console.error("Local upload error", uploadErr);
                    }
                    // --------------------

                    submitToGas(gasUrl, gasData);
                };

                reader.readAsDataURL(file);
            } else {
                submitToGas(gasUrl, gasData);
            }

            window.submitToGas = submitToGas;
            async function submitToGas(url, payload) {
                try {
                    // Use 'no-cors' if GAS doesn't return CORS headers, handle blindly?
                    // GAS Web Apps usually return simple JSON if configured right.
                    // But standard fetch might fail CORS if not handled in GAS with `ContentService`.
                    // My GAS code uses `ContentService` which generally works with redirects.

                    // Actually, Fetching GAS Web App often requires `redirect: 'follow'`.
                    // But doing it from browser often hits CORS.
                    // The best way is using `no-cors` for fire-and-forget OR fetch with `application/x-www-form-urlencoded` text/plain to avoid preflight?
                    // POSTing JSON usually triggers preflight which GAS doesn't support.
                    // So we must use `text/plain` for the body type to avoid preflight!

                    console.log("[DEBUG] Submitting to GAS. URL:", url);
                    console.log("[DEBUG] Payload:", JSON.stringify(payload, null, 2));

                    const res = await fetch(url, {
                        method: 'POST',
                        body: JSON.stringify(payload),
                        headers: {
                            "Content-Type": "text/plain;charset=utf-8", // Hacks to avoid preflight
                        },
                    });

                    const text = await res.text();
                    let json = {};
                    try {
                        json = JSON.parse(text);
                    } catch (e) {
                        // If opaque, assume success?
                        console.warn("Could not parse GAS response", text);
                    }

                    if (json.result === 'success') {
                        msg.textContent = "Product sent to Google Sheet! (It may take a moment to appear)";
                        msg.classList.remove('hidden');
                        form.reset();
                        // Keep URL?
                        document.getElementById('google-script-url').value = url;
                    } else {
                        throw new Error(json.error || ("Request failed (Status: " + res.status + "). Check permissions (Should be 'Anyone')."));
                    }
                } catch (ex) {
                    console.error(ex);
                    err.textContent = "Failed to sync with Google Sheet: " + ex.message;
                    err.classList.remove('hidden');
                } finally {
                    loading.classList.add('hidden');
                    submitBtn.disabled = false;
                    submitBtn.innerText = originalBtnText;
                }
            }
        });
    }


    // Settings Handler
    const saveSettingsBtn = document.getElementById('save-settings-btn');
    if (saveSettingsBtn) {
        // Load initial settings
        loadSettings();

        saveSettingsBtn.addEventListener('click', async () => {
            const enabled = document.getElementById('email-enabled').checked;
            const receiver = document.getElementById('receiver-email').value.trim();
            const sender = document.getElementById('sender-email').value.trim();
            const pass = document.getElementById('sender-pass').value.trim();
            const msg = document.getElementById('settings-msg');

            try {
                const res = await fetch('/api/settings', {
                    method: 'POST',
                    body: JSON.stringify({
                        enabled: enabled,
                        receiver_email: receiver,
                        sender_email: sender,
                        sender_pass: pass
                    })
                });

                const json = await res.json();
                if (json.status === 'success') {
                    msg.textContent = "Settings saved successfully!";
                    msg.classList.remove('hidden');
                    setTimeout(() => msg.classList.add('hidden'), 3000);
                } else {
                    alert("Failed: " + json.error);
                }
            } catch (e) {
                alert("Error saving settings: " + e.message);
            }
        });
    }

    async function loadSettings() {
        try {
            const res = await fetch('/api/settings');
            const config = await res.json();
            if (config.enabled !== undefined) {
                document.getElementById('email-enabled').checked = config.enabled;
                document.getElementById('receiver-email').value = config.receiver_email || '';
                document.getElementById('sender-email').value = config.sender_email || '';
                document.getElementById('sender-pass').value = config.sender_pass || '';
            }
        } catch (e) {
            console.error("Failed to load settings", e);
        }
    }

    // Delegated Event Listener for Order Item Tiles
    const ordersBody = document.getElementById('orders-table-body');
    if (ordersBody) {
        console.log("Attaching event listener to orders-table-body");
        ordersBody.addEventListener('click', (e) => {
            console.log("Click detected on orders body. Target:", e.target);
            const tile = e.target.closest('.item-tile');
            if (tile) {
                // Prevent row toggle or other side effects
                e.preventDefault();
                e.stopPropagation();

                const sku = tile.dataset.sku;
                console.log("Delegated Click on Tile. SKU:", sku);

                if (sku) {
                    console.log("Attempting to expand item:", sku);
                    window.toggleItemExpansion(tile, sku);
                } else {
                    console.warn("Tile clicked but no SKU found in dataset");
                }
            }
        });
    } else {
        console.error("CRITICAL: orders-table-body not found during initialization");
    }
});

function showLogin() {
    document.getElementById('login-screen').classList.remove('hidden');
    document.getElementById('admin-dashboard').classList.add('hidden');
}

function showDashboard() {
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('admin-dashboard').classList.remove('hidden');
    loadData();
    initProductData(); // Load product details for modal
}


async function loadData() {
    try {
        // Get GAS URL
        const GAS_URL = "https://script.google.com/macros/s/AKfycbxL5HqRvV6REMAPtLdlRM6qcoVn42XwKse0YNU0xmLLy7O1iq7SzKMzjGZNNDnxXeQYDg/exec";

        // Populate the input if not already set, for product adds
        const urlInput = document.getElementById('google-script-url');
        if (urlInput && !urlInput.value) {
            urlInput.value = GAS_URL;
        }

        let orders = [];

        try {
            // First try GAS
            // Note: simple GET to GAS webapp (Anyone access) usually works fine.
            const res = await fetch(`${GAS_URL}?action=getOrders`);
            if (res.ok) {
                orders = await res.json();
            } else {
                throw new Error("GAS fetch failed");
            }
        } catch (e) {
            console.warn("Could not load from GAS, falling back to local/legacy", e);
            // Fallback to server if GAS fails or not provided
            try {
                const ordersRes = await fetch('/api/orders');
                orders = await ordersRes.json();
            } catch (ex) {
                console.error("Local fallback also failed", ex);
                orders = [];
            }
        }

        // 1. Visits (Still local for now, or move to GAS?)
        // Visits are less critical. Let's keep local or mock 0 if failed.
        try {
            const visitsRes = await fetch('/api/visits');
            const visitsData = await visitsRes.json();
            document.getElementById('stat-visits').textContent = visitsData.visits || 0;
        } catch (e) {
            document.getElementById('stat-visits').textContent = '-';
        }

        document.getElementById('stat-orders').textContent = orders.length;

        // Initialize Dashboard Charts
        if (window.Chart) initDashboard(orders);

        // 3. Revenue
        let revenue = 0;
        orders.forEach(o => {
            if (o.status === 'Closed') {
                const amt = parseFloat(o.total.replace(/[^\d.]/g, ''));
                if (!isNaN(amt)) revenue += amt;
            }
        });
        document.getElementById('stat-revenue').textContent = revenue.toFixed(3) + ' JOD';

        // 4. Render Activity Log (Last 5 events)
        const logBody = document.getElementById('activity-log');
        logBody.innerHTML = '';

        // Combine visits (mock timestamps?) and orders
        // For simplicity, just show recent orders in activity
        const recentOrders = [...orders].reverse().slice(0, 5);
        recentOrders.forEach(o => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><span style="color:var(--success)">New Order</span></td>
                <td>${o.customerName} - ${o.total}</td>
                <td style="color:var(--text-secondary); font-size:0.85rem">${new Date(o.date).toLocaleTimeString()}</td>
            `;
            logBody.appendChild(tr);
        });

        // 5. Render Orders Table
        const ordersBody = document.getElementById('orders-table-body');
        ordersBody.innerHTML = '';
        [...orders].reverse().forEach(o => {
            const tr = document.createElement('tr');
            tr.className = 'order-row';
            const idStr = String(o.id);
            const rowId = `row-${o.id}`;
            const detailsId = `details-${o.id}`;

            tr.onclick = (e) => {
                // Ignore if clicked on select
                if (e.target.tagName === 'SELECT') return;
                toggleDetails(detailsId);
            };

            tr.innerHTML = `
                <td style="font-family:monospace">#${idStr.substr(0, 8)}</td>
                <td>${o.customerName}<br><span style="font-size:0.8em;color:grey">${o.customerPhone}</span></td>
                <td>${o.items ? o.items.length : 0} Items</td>
                <td>${o.total}</td>
                <td>${new Date(o.date).toLocaleDateString()}</td>
                <td>${renderStatusSelect(o.id, o.status || 'Placed')}</td>
            `;
            ordersBody.appendChild(tr);

            // Details Row
            const detailsTr = document.createElement('tr');
            detailsTr.id = detailsId;
            detailsTr.className = 'expanded-row hidden';

            let itemsHtml = '';
            if (o.items && Array.isArray(o.items)) {
                itemsHtml = o.items.map(itemStr => {
                    const i = parseItemString(itemStr);

                    // Image Logic
                    // Image Logic
                    let imgHtml = '';
                    if (window.DRIVE_MAPPING && window.DRIVE_MAPPING[i.sku]) {
                        const driveId = window.DRIVE_MAPPING[i.sku];
                        const imgSrc = `https://lh3.googleusercontent.com/d/${driveId}`;
                        imgHtml = `<img src="${imgSrc}" class="item-image" loading="lazy">`;
                    } else {
                        // Fallback checking using helper function
                        // Start with PNG
                        imgHtml = `<img src="assets/products/${i.sku}.png" class="item-image" loading="lazy" onerror="handleAdminImageError(this, '${i.sku}')">`;
                    }

                    // Sanitize SKU for HTML attribute
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
                                    <span class="item-detail-badge" style="color:#94a3b8">
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>
                                        ${i.color}
                                    </span>
                                    <span class="item-detail-badge" style="margin-left:auto; color:var(--success)">
                                        ${i.price} JOD
                                    </span>
                                </div>
                            </div>
                        </div>
                    `;
                }).join('');
            }

            // Extended Details Logic
            const infoSection = `
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
                        <span>${o.deliveryCost || '0.00'} JOD</span>
                    </div>
                </div>
            `;

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

        // 6. Item Analytics
        const itemMap = {};
        orders.forEach(o => {
            o.items.forEach(item => {
                const qtyMatch = item.match(/\(Qty:\s*(\d+)\)/);
                const qty = qtyMatch ? parseInt(qtyMatch[1]) : 1;
                const nameMatch = item.match(/\[(.*?)\]/);
                const id = nameMatch ? nameMatch[1] : 'Unknown';
                const priceMatch = item.match(/-\s*(\d+\.\d+)\s*-/);
                const price = priceMatch ? parseFloat(priceMatch[1]) : 0;

                if (!itemMap[id]) {
                    itemMap[id] = { id: id, name: item.split('-').pop().split('(')[0].trim(), qty: 0, rev: 0 };
                }
                itemMap[id].qty += qty;
                itemMap[id].rev += (price * qty);
            });
        });

        const analyticsBody = document.getElementById('item-analytics-body');
        analyticsBody.innerHTML = '';
        Object.values(itemMap).sort((a, b) => b.qty - a.qty).forEach(i => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="font-family:monospace">${i.id}</td>
                <td>${i.name}</td>
                <td>${i.qty}</td>
                <td>${i.rev.toFixed(3)} JOD</td>
            `;
            analyticsBody.appendChild(tr);
        });

    } catch (e) {
        console.error("Admin: Failed to load data from server", e);
    }
}

// --- Dashboard Charts Logic ---
let revenueChartInstance = null;
let topProductsChartInstance = null;
let regionChartInstance = null;
let paymentChartInstance = null;

function initDashboard(orders) {
    if (!orders || orders.length === 0) return;

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
        const amt = parseFloat(o.total.replace(/[^\d.]/g, ''));
        if (!isNaN(amt)) {
            if (!dateMap[dateStr]) dateMap[dateStr] = 0;
            dateMap[dateStr] += amt;
        }
    });

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
        if (o.items) {
            o.items.forEach(item => {
                // Try to extract simplified name
                // Format: "Name - Price - [ID] (Qty: X)" OR just string
                let name = item;
                let qty = 1;

                if (item.includes('[') && item.includes(']')) {
                    // Extract SKU from brackets [SKU]
                    // Format: "1. [TRND-1225-129] ..."
                    const skuMatch = item.match(/\[(.*?)\]/);
                    if (skuMatch) {
                        name = skuMatch[1]; // Use SKU as the name/key
                    }
                }

                // Extract Qty
                const qtyMatch = item.match(/\(Qty:\s*(\d+)\)/);
                if (qtyMatch) qty = parseInt(qtyMatch[1]);

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
    try {
        const GAS_URL = "https://script.google.com/macros/s/AKfycbxL5HqRvV6REMAPtLdlRM6qcoVn42XwKse0YNU0xmLLy7O1iq7SzKMzjGZNNDnxXeQYDg/exec";

        if (GAS_URL) {
            // Update via GAS
            const payload = {
                action: 'updateStatus',
                orderId: id,
                status: newStatus
            };

            await fetch(GAS_URL, {
                method: 'POST',
                body: JSON.stringify(payload),
                headers: { "Content-Type": "text/plain;charset=utf-8" }
            });
            // We assume success or it fails silently/logs error. GAS return is hard to read due to no-cors/redirects sometimes.
            // But if we use redirect:follow, we might get it.

            // Reload to verify
            setTimeout(loadData, 1000);

        } else {
            // Fallback to local server
            const res = await fetch('/api/update-order-status', {
                method: 'POST',
                body: JSON.stringify({ orderId: id, status: newStatus })
            });
            const json = await res.json();
            if (json.status === 'success') {
                loadData();
            } else {
                alert("Failed to update status: " + (json.message || "Unknown error"));
            }
        }
    } catch (e) {
        console.error("Error updating status:", e);
        alert("Error updating status");
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

    // Check if it's a Drive URL or valid standard URL
    const isStandardAsset = currentSrc.includes('assets/products/');

    if (!isStandardAsset) {
        // If it was a Drive/Cloud URL and failed, fallback immediately to local PNG
        // The local fallback chain (PNG->JPG->etc) will take over if PNG fails
        img.src = `assets/products/${sku}.png`;
        return;
    }

    // Standard Fallback Chain for Local Assets
    if (currentSrc.endsWith('.png')) {
        img.src = `assets/products/${sku}.jpg`;
    } else if (currentSrc.endsWith('.jpg')) {
        img.src = `assets/products/${sku}.jpeg`;
    } else if (currentSrc.endsWith('.jpeg')) {
        img.src = `assets/products/${sku}.webp`;
    } else {
        // Final fallback: Placeholder
        img.onerror = null; // Stop infinite loop
        img.parentNode.innerHTML = '<div class="item-image" style="display:flex;align-items:center;justify-content:center;color:#64748b;font-size:0.8rem;background:rgba(0,0,0,0.2);">No Img</div>';
    }
}

// --- PRODUCT MODAL LOGIC & HELPERS ---

window.allProducts = [];
const PRODUCT_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSTejg41yuaKcYa0CbOodUP9osmE5DIv8ZNQyMXlHJLLh2pQUZ5EoMT93UgV3LZfhAJcPEL8uEfK9Y4/pub?gid=897526080&single=true&output=csv';

async function initProductData() {
    if (window.allProducts && window.allProducts.length > 0) return; // Already loaded

    try {
        console.log("Fetching Product CSV from:", PRODUCT_CSV_URL);
        // Use Papa Parse directly via URL if possible, or fetch text first
        // Papa.parse supports remote files if 'download: true'
        Papa.parse(PRODUCT_CSV_URL, {
            download: true,
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
                if (results.data) {
                    window.allProducts = results.data;
                    console.log("Products loaded:", window.allProducts.length);
                }
            },
            error: (err) => {
                console.error("Papa Parse Error:", err);
            }
        });
    } catch (e) {
        console.error("Failed to load products:", e);
    }
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

    // Normalize Data
    const p = {
        name: productRaw['Product Name'] || productRaw['product name'] || productRaw['Name'] || 'Unknown',
        no: sku,
        image: productRaw['Image'] || productRaw['image'] || productRaw['Photo'] || '',
        link: productRaw['Document Link'] || productRaw['link'] || '',
        price: productRaw['Price'] || productRaw['Retail Price'] || productRaw['Price < 25 QTY'] || '0',
        bulkPrice: productRaw['Wholesale Price'] || productRaw['Price > 25 QTY'] || '',
        category: productRaw['Category'] || productRaw['category'],
        collection: productRaw['Collection'] || productRaw['collection'],
        dimensions: productRaw['Dimensions'] || productRaw['Dimensions(mm) x y z'],
        targetMarket: productRaw['Target Market'] || productRaw['target market'],
        description: productRaw['Description'] || productRaw['description (80 word)'],
        colors: (productRaw['Colors'] || '').split(',').map(c => c.trim()).filter(c => c),
    };

    // Render HTML
    const t = translations.en;

    // Cloud Fallbacks
    // PRIORITY FIX: Check DRIVE_MAPPING first (matches collapsed view logic)
    let driveId = null;
    if (window.DRIVE_MAPPING && window.DRIVE_MAPPING[p.no]) {
        driveId = window.DRIVE_MAPPING[p.no];
    }

    // Then check extracted specific links if no global mapping
    if (!driveId) driveId = extractDriveId(p.image);
    if (!driveId && p.link) driveId = extractDriveId(p.link);

    let imageSrc = `assets/products/${p.no}.png`; // Start with PNG to allow fallback chain to work
    if (driveId) {
        // Use the format that works in the collapsed card
        imageSrc = `https://lh3.googleusercontent.com/d/${driveId}`;
    }

    // Add a new property 'available' to product 'p' based on 'Stock' or 'Availability'
    p.available = productRaw['Stock'] || productRaw['Availability'] || 'Yes'; // Default to 'Yes' if not specified

    const html = `
        <div class="inline-details-container" onclick="event.stopPropagation()">
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
                        onerror="handleAdminImageError(this, '${p.no}')"
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
                        <strong style="display:block; margin-bottom:0.5rem; color:#1e1e24; font-weight:700;">${t.descriptionLabel}</strong>
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
                             <span class="premium-price-label">${t.retailPrice}</span>
                             <span class="premium-price-value">${p.price} JOD</span>
                        </div>
                        ${p.bulkPrice ? `
                        <div class="premium-price-block">
                             <span class="premium-price-label" style="color:#b45309;">${t.bulkSaving}</span>
                             <span class="premium-price-value" style="color:#d97706;">${p.bulkPrice} JOD</span>
                        </div>` : ''}
                    </div>

                </div>
            </div>
            
            <!-- Bottom Close Bar -->
            <div class="premium-close-bar" onclick="window.toggleItemExpansion(this.closest('.item-tile'), '${p.no}')">
                Close Details
            </div>
        </div>
    `;

    element.insertAdjacentHTML('beforeend', html);
    element.classList.add('expanded');

    // Re-init icons if any exist in the template (currently none, but good practice)
    if (window.lucide) lucide.createIcons();
};

// --- Product List Logic ---
const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSTejg41yuaKcYa0CbOodUP9osmE5DIv8ZNQyMXlHJLLh2pQUZ5EoMT93UgV3LZfhAJcPEL8uEfK9Y4/pub?gid=897526080&single=true&output=csv';

window.loadProducts = async function () {
    console.log("Loading products...");
    const tbody = document.getElementById('products-list-body');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="7">Loading...</td></tr>';

    try {
        const res = await fetch(CSV_URL);
        const text = await res.text();
        Papa.parse(text, {
            header: true,
            skipEmptyLines: true,
            complete: function (results) {
                window.currentProducts = results.data;
                renderProductsTable(results.data);
            }
        });
    } catch (e) {
        console.error("Error loading CSV", e);
        tbody.innerHTML = '<tr><td colspan="7">Error loading products. Check console.</td></tr>';
    }
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
        let imgHtml = `<img src="assets/products/${row['No']}.jpg" onerror="this.style.display='none'" style="width:50px; height:50px; object-fit:cover; border-radius:4px;">`;

        tr.innerHTML = `
            <td>${imgHtml}</td>
            <td>${row['No']}</td>
            <td>${row['Name on Store'] || row['product name'] || '-'}</td>
            <td>${row['category']}</td>
            <td>${row['Price < 25 QTY']}</td>
            <td>${row['Available'] === 'TRUE' ? '<span style="color:green">Yes</span>' : '<span style="color:red">No</span>'}</td>
            <td>
                <button class="btn btn-sm" onclick="window.editProduct('${row['No']}')" style="background:#3b82f6; color:white;">Edit</button>
                <button class="btn btn-sm" onclick="window.deleteProduct('${row['No']}')" style="margin-left:0.5rem; background:#ef4444; color:white;">Delete</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
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
    const url = document.getElementById('google-script-url').value;
    if (!window.submitToGas) { alert("Function not ready."); return; }

    await window.submitToGas(url, { action: 'deleteProduct', No: no });
    setTimeout(loadProducts, 2000); // Refresh after delay
};
