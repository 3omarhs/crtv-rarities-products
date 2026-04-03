const fs = require('fs');

const sql = fs.readFileSync('supabase_seed.sql', 'utf8');
const regex = /INSERT INTO orders \((.*?)\) VALUES \((.*?)\) ON CONFLICT/g;
const headers = ['id', 'address', 'currency', 'customerName', 'customerPhone', 'date', 'items', 'method', 'paymentMethod', 'selectedCompany', 'selectedRegion', 'status', 'timestamp', 'total', 'deliveryCost'];

let rows = [];

let match;
while ((match = regex.exec(sql)) !== null) {
    const colsStr = match[1].replace(/ /g, '');
    const valsStr = match[2];
    
    const parts = [];
    let curr = '';
    let inQuote = false;
    for (let i = 0; i < valsStr.length; i++) {
        const c = valsStr[i];
        if (c === "'") {
            if (i + 1 < valsStr.length && valsStr[i+1] === "'") {
                curr += "'";
                i++;
            } else {
                inQuote = !inQuote;
            }
        } else if (c === ',' && !inQuote) {
            parts.push(curr.trim());
            curr = '';
        } else {
            curr += c;
        }
    }
    parts.push(curr.trim());
    
    const rowDict = {};
    const cols = colsStr.split(',');
    cols.forEach((col, idx) => {
        let val = parts[idx] || '';
        val = val.replace(/\n/g, '\\n').replace(/\r/g, ''); // Fix broken lines
        rowDict[col] = val;
    });
    
    const row = headers.map(h => {
        let v = rowDict[h] || '';
        // Add quotes if comma present
        if (v.includes(',')) return `"${v}"`;
        return v;
    });
    rows.push(row.join(','));
}

fs.writeFileSync('data/orders.csv', headers.join(',') + '\n' + rows.join('\n'));
console.log('Orders migrated.');
