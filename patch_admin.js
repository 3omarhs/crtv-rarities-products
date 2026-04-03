const fs = require('fs');
let code = fs.readFileSync('public/admin_v5.js', 'utf8');

// Replace loadSettings
const settingsStart = code.indexOf(`    try {\n        const res = await fetch('/api/settings');`);
const settingsEnd = code.indexOf(`        const enabled = document.getElementById('email-enabled');`);
if (settingsStart > -1 && settingsEnd > -1) {
    const replacement = `    try {
        const res = await fetch('https://raw.githubusercontent.com/3omarhs/crtv-rarities-products/main/data/settings.csv?v=' + Date.now());
        if (!res.ok) throw new Error("Failed to fetch settings");
        const csvText = await res.text();
        const data = {};
        Papa.parse(csvText, {
            header: true, skipEmptyLines: true,
            complete: function(results) {
                results.data.forEach(row => {
                    if (row.key) data[row.key] = row.value;
                });
            }
        });

`;
    code = code.substring(0, settingsStart) + replacement + code.substring(settingsEnd);
} else {
    console.log("Could not patch loadSettings");
}

// Replace fetchVisits
const visitsStart = code.search(/async function fetchVisits\(GAS_URL\) \{[\s\S]*?\/\/ 1\. Try Supabase first/);
const visitsEndRegex = /return \{ total: 0, daily: \{\}, today: 0, dailyLogs: \{\} \};\s*\}/;
const visitsEndMatch = code.match(visitsEndRegex);

if (visitsStart > -1 && visitsEndMatch) {
    const visitsEnd = visitsEndMatch.index + visitsEndMatch[0].length;
    
    const fetchVisitsReplacement = `async function fetchVisits(GAS_URL) {
    let total = 0, daily = {}, dailyLogs = {}, todayCount = 0;
    const localDate = getLocalDateStr();
    try {
        const res = await fetch('https://raw.githubusercontent.com/3omarhs/crtv-rarities-products/main/data/visits.csv?v=' + Date.now());
        if(res.ok) {
            const csvText = await res.text();
            Papa.parse(csvText, {
                header: true, skipEmptyLines: true,
                complete: function(results) {
                    results.data.forEach(row => {
                        const count = parseInt(row.count, 10) || 0;
                        total += count; daily[row.date] = count;
                        if (row.date === localDate) todayCount = count;
                    });
                }
            });
        }
        const logsRes = await fetch('https://raw.githubusercontent.com/3omarhs/crtv-rarities-products/main/data/visit_logs.csv?v=' + Date.now());
        if(logsRes.ok) {
            const logsText = await logsRes.text();
            Papa.parse(logsText, {
                header: true, skipEmptyLines: true,
                complete: function(results) {
                    results.data.forEach(row => {
                        if(!dailyLogs[row.date]) dailyLogs[row.date] = [];
                        dailyLogs[row.date].push(row.deviceName);
                    });
                }
            });
        }
    } catch(e) { console.warn("Admin: Visits fetch failed", e); }
    return { total, daily, today: todayCount, dailyLogs };
}`;
    
    code = code.substring(0, visitsStart) + fetchVisitsReplacement + code.substring(visitsEnd);
} else {
    console.log("Could not patch fetchVisits");
}

fs.writeFileSync('public/admin_v5.js', code);
console.log('admin_v5.js patched successfully!');
