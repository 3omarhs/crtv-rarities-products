// Admin Portal Logic

let ADMIN_USERS = [];

async function loadCredentials() {
    try {
        const response = await fetch('adminCredentials.txt');
        if (!response.ok) throw new Error("Failed to load credentials");
        const text = await response.text();
        const lines = text.split(/\r?\n/);

        let currentUser = {};

        lines.forEach(line => {
            const [key, value] = line.split(':');
            if (key && value) {
                const cleanKey = key.trim();
                const cleanValue = value.trim();

                if (cleanKey === 'Username') {
                    // Start new user or update current
                    if (currentUser.email && currentUser.pass) {
                        ADMIN_USERS.push(currentUser);
                        currentUser = {};
                    }
                    currentUser.email = cleanValue.toLowerCase();
                }
                if (cleanKey === 'Password') {
                    currentUser.pass = cleanValue;
                }
            } else if (line.trim() === '') {
                // Empty line acts as delimiter, push current if complete
                if (currentUser.email && currentUser.pass) {
                    ADMIN_USERS.push(currentUser);
                    currentUser = {};
                }
            }
        });

        // Push last one if exists
        if (currentUser.email && currentUser.pass) {
            ADMIN_USERS.push(currentUser);
        }

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
});

function showLogin() {
    document.getElementById('login-screen').classList.remove('hidden');
    document.getElementById('admin-dashboard').classList.add('hidden');
}

function showDashboard() {
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('admin-dashboard').classList.remove('hidden');
    loadData();
}

async function loadData() {
    try {
        // 1. Visits
        const visitsRes = await fetch('/api/visits');
        const visitsData = await visitsRes.json();
        const visits = visitsData.visits || 0;
        document.getElementById('stat-visits').textContent = visits;

        // 2. Orders
        const ordersRes = await fetch('/api/orders');
        const orders = await ordersRes.json();

        // Initialize Dashboard Charts
        if (window.Chart) initDashboard(orders);

        // Also sync local just in case? No, trust server.
        document.getElementById('stat-orders').textContent = orders.length;

        // 3. Revenue
        let revenue = 0;
        orders.forEach(o => {
            const amt = parseFloat(o.total.replace(/[^\d.]/g, ''));
            if (!isNaN(amt)) revenue += amt;
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
            tr.innerHTML = `
                <td style="font-family:monospace">#${o.id.substr(0, 8)}</td>
                <td>${o.customerName}<br><span style="font-size:0.8em;color:grey">${o.customerPhone}</span></td>
                <td>${o.items.length} Items</td>
                <td>${o.total}</td>
                <td>${new Date(o.date).toLocaleDateString()}</td>
                <td><span style="padding:2px 8px; background:rgba(16, 185, 129, 0.2); color:#10b981; border-radius:4px; font-size:0.8rem">Received</span></td>
            `;
            ordersBody.appendChild(tr);
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
                    // Extract name before first dash? 
                    // Example: "Minimalist Calendar - 45 - [ID] (Qty: 1)"
                    const parts = item.split('-');
                    if (parts.length > 0) name = parts[0].trim();
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
                labels: sortedProds.map(p => p[0].substring(0, 15) + (p[0].length > 15 ? '...' : '')),
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
                    y: { grid: { color: '#2d2d35' }, ticks: { color: '#94a3b8' } }
                }
            }
        });
    }

    // 5. Region Distribution
    const regionMap = {};
    orders.forEach(o => {
        const reg = o.selectedRegion || 'Unknown';
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

