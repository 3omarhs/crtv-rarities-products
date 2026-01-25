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

