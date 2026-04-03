const fs = require('fs');

const sql = fs.readFileSync('supabase_seed.sql', 'utf8');
const regex = /INSERT INTO visits \(date, count\) VALUES \('(.*?)', (.*?)\)/g;

let rows = [];

let match;
while ((match = regex.exec(sql)) !== null) {
    const date = match[1];
    const count = parseInt(match[2], 10);
    rows.push(`${date},${count}`);
}

if (rows.length > 0) {
    fs.writeFileSync('data/visits.csv', 'date,count\n' + rows.join('\n'));
    console.log(`Migrated ${rows.length} visits to data/visits.csv.`);
} else {
    console.log("No visits found in supabase_seed.sql.");
}
