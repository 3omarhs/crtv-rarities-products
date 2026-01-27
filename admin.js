// Admin Portal Logic
console.log("!!! ADMIN JS V3 LOADED !!!");
document.title = "Admin Portal (Debug Mode V3)";

// Global handler for item clicks to avoid inline JS issues
window.handleItemClick = function (element, event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    const sku = element.getAttribute('data-sku');
    console.log("handleItemClick called. SKU:", sku);
    if (sku) {
        window.openProductModal(sku);
    } else {
        console.error("handleItemClick: No SKU found on element", element);
    }
};

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
        });
    });

    // Logout
    document.getElementById('logout-btn').addEventListener('click', () => {
        sessionStorage.removeItem('admin_logged_in');
        window.location.reload();
    });

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

            // Show loading
            const loading = document.getElementById('loading-modal');
            loading.classList.remove('hidden');

            // 2. Prepare Data for GAS
            const gasData = {
                'No': no,
                'product name': data['product name'],
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

                reader.onload = async function (e) {
                    const base64 = e.target.result.split(',')[1]; // Remove data:image/...;base64,
                    gasData.image = base64;
                    gasData.imageName = `${no}.${file.name.split('.').pop()}`; // Rename to ItemNo.ext
                    gasData.mimeType = file.type;

                    submitToGas(gasUrl, gasData);
                };

                reader.readAsDataURL(file);
            } else {
                submitToGas(gasUrl, gasData);
            }

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
                    console.log("Attempting to open modal for:", sku);
                    window.openProductModal(sku);
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
        const GAS_URL = "https://script.google.com/macros/s/AKfycbx6Lad0xVkirbozk1SPTC6zMjvJG9sZIu7AuynPU5_xvMurqofrqLEXDdX0d7zggQpoJA/exec";

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
        const GAS_URL = "https://script.google.com/macros/s/AKfycbx6Lad0xVkirbozk1SPTC6zMjvJG9sZIu7AuynPU5_xvMurqofrqLEXDdX0d7zggQpoJA/exec";

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

    // Define the fallback chain
    // 1. Initial load is PNG (set in HTML)
    // 2. Fallback to JPG
    // 3. Fallback to JPEG
    // 4. Fallback to WEBP
    // 5. Fallback to Placeholder

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

window.openProductModal = function (sku) {
    // Clean SKU
    sku = String(sku).trim();
    console.log("OpenModal called for SKU:", sku);

    if (!window.allProducts || window.allProducts.length === 0) {
        console.warn("Products not loaded yet. Calling init...");
        // Try init and alert
        initProductData();
        alert("System is still downloading product data... Please try again in a few seconds.");
        return;
    }

    console.log("Searching in catalog of size:", window.allProducts.length);

    // Find product in CSV data
    // We check various common column names for Item Number
    const productRaw = window.allProducts.find(p => {
        const no = p['No'] || p['Item Number'] || p['no'] || p['id'] || '';
        // Loose comparison
        return String(no).trim().toLowerCase() === sku.toLowerCase();
    });

    if (!productRaw) {
        console.error("Product not found for SKU:", sku);
        console.log("Sample Data:", window.allProducts[0]);
        alert("Details not available for Item #" + sku + "\n(Code mismatch or custom item)");
        return;
    }

    console.log("Product found:", productRaw);

    // Normalize Product Data
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

    renderProductModal(p);
}

function renderProductModal(product) {
    const modal = document.getElementById('product-details-modal');
    const content = document.getElementById('product-modal-content');
    const t = translations.en;

    // Image Logic
    let imageSrc = `assets/products/${product.no}.jpg`;

    // Cloud Fallbacks
    let driveId = extractDriveId(product.image);
    if (!driveId && product.link) driveId = extractDriveId(product.link);
    if (!driveId && window.DRIVE_MAPPING) driveId = window.DRIVE_MAPPING[product.no] || null;

    // We rely on handleAdminImageError to switch to cloud/placeholders if local fails
    // But we can preemptively set it if we suspect local missing? No, stick to local first for speed.

    content.innerHTML = `
        <div class="expanded-info" style="padding: 2rem;">
            <div class="expanded-image-container">
               <img 
                    src="${imageSrc}" 
                    alt="${product.name}" 
                    class="expanded-image"
                    style="max-height: 500px; object-fit: contain; width: 100%; border-radius: 12px; display:block; margin: 0 auto;"
                    onerror="handleAdminImageError(this, '${product.no}')"
                >
            </div>
            
            <div style="margin-top: 2rem;">
                <div style="display: flex; align-items: start; justify-content: space-between; gap: 1rem; margin-bottom: 0.5rem;">
                    <h2 class="expanded-title" style="font-size: 1.8rem; margin: 0; line-height: 1.2;">${product.name}</h2>
                    <span class="card-number" style="font-size: 1rem; padding: 0.4rem 0.8rem; background: #f1f5f9; border-radius: 8px; color: var(--text-primary); white-space: nowrap;">${product.no}</span>
                </div>

                <div class="expanded-grid" style="grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); margin: 1.5rem 0; gap: 1.5rem;">
                    ${product.category ? `<div class="expanded-meta"><strong style="color:var(--accent);">${t.categoryLabel}</strong> <br><span>${product.category}</span></div>` : ''}
                    ${product.collection ? `<div class="expanded-meta"><strong style="color:var(--accent);">${t.collectionLabel}</strong> <br><span>${product.collection}</span></div>` : ''}
                    ${product.dimensions ? `<div class="expanded-meta"><strong style="color:var(--accent);">${t.dimensionsLabel}</strong> <br><span>${product.dimensions}</span></div>` : ''}
                    ${product.targetMarket ? `<div class="expanded-meta"><strong style="color:var(--accent);">${t.targetMarketLabel}</strong> <br><span>${product.targetMarket}</span></div>` : ''}
                </div>

                <div class="expanded-description" style="background: #f8fafc; padding: 1.5rem; border-radius: 12px; margin-bottom: 2rem;">
                    <strong style="display: block; margin-bottom: 0.5rem; color: var(--text-primary);">${t.descriptionLabel}</strong>
                    <div style="line-height: 1.6; color: var(--text-secondary);">${product.description || t.noDesc}</div>
                </div>
                
                ${product.colors && product.colors.length > 0 ? `
                <div class="colors-section" style="margin: 2rem 0; padding: 1.5rem; background: #fff; border: 1px solid var(--border); border-radius: 12px;">
                    <strong style="display:block; margin-bottom:1rem;">${t.selectColor}</strong>
                    <div class="color-list" style="display: flex; flex-wrap: wrap; gap: 0.8rem;">
                        ${product.colors.map(color => `
                            <span style="padding: 6px 14px; background: #f1f5f9; border-radius: 20px; font-size: 0.9rem; font-weight: 500;">${color}</span>
                        `).join('')}
                    </div>
                </div>` : ''}

                <div class="expanded-pricing">
                    <div class="main-price">
                        <div class="price-info-block">
                            <span class="label">${t.retailPrice}</span>
                            <span class="value">${product.price} JOD</span>
                        </div>
                    </div>
                    ${product.bulkPrice ? `
                    <div class="bulk-price" style="margin-top: 1rem;">
                        <div class="price-info-block">
                            <span class="label">${t.bulkSaving}</span>
                            <span class="value">${product.bulkPrice} JOD</span>
                        </div>
                    </div>` : ''}
                </div>

            </div>
        </div>
    `;

    modal.classList.remove('hidden');
    // Re-init icons
    if (window.lucide) lucide.createIcons();
}

window.closeProductModal = function () {
    document.getElementById('product-details-modal').classList.add('hidden');
}
