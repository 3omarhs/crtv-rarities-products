const fs = require('fs');
const path = require('path');

const currentPath = "d:/GitHub/crtv-rarities-products/data/products.csv";
const spreadsheetPath = "C:/Users/omarh/.gemini/antigravity/brain/1680ae4d-9350-45aa-8d0a-58da7317c7f3/.system_generated/steps/664/content.md";
const outputPath = "d:/GitHub/crtv-rarities-products/data/products_fixed.csv";

// Simple CSV Parser (enough for this one-time task)
function parseCSV(content) {
    const lines = content.split('\n').filter(l => l.trim() !== '');
    if (lines.length === 0) return [];
    
    // Naive parse for the header
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    
    return lines.slice(1).map(line => {
        const values = line.split(',');
        const obj = {};
        headers.forEach((header, i) => {
            let val = values[i] ? values[i].trim() : '';
            val = val.replace(/^"|"$/g, '');
            obj[header] = val;
        });
        return obj;
    });
}

// 1. Load Arabic Mapping
const rawSheet = fs.readFileSync(spreadsheetPath, 'utf8');
const sheetLines = rawSheet.split('\n').filter(l => l.includes(','));
const sheetCSV = sheetLines.join('\n');
const sheetData = parseCSV(sheetCSV);

const arabicMapping = {};
sheetData.forEach(row => {
    const itemNo = row.No || row['No'];
    const arabic = row['Arabic Name'];
    if (itemNo && arabic && !arabic.includes('?')) {
        arabicMapping[itemNo.trim()] = arabic;
    }
});
console.log(`Loaded ${Object.keys(arabicMapping).length} Arabic names from Spreadsheet.`);

// 2. Manual Patches
const manualPatches = {
    "ISLMC-0226-141": "ديكور خط عربي \"عيد مبارك\" أنيق",
    "ISLMC-0226-142": "طقم مشابك عيدية بخط عربي احتفالي",
    "ISLMC-0226-143": "حامل حلويات شكل أرنب لطيف",
    "ISLMC-0226-144": "حامل هدايا مالية \"مفاجأة حلوة\"",
    "TLS-0226-145": "ولاعة وموزع سجائر سريع السحب",
    "TLS-0226-146": "أداة تضفير الشعر السهلة",
    "TLS-0226-147": "مشبك شاي على شكل قطة ساحرة",
    "TLS-0226-148": "فتاحة علب مزدوجة المفعول غطاء صحي",
    "TLS-0226-149": "مقبض وفتاحة علب تكتيكية بشكل قنبلة",
    "JWHLD-1225-012": "حامل عرض مجوهرات إضافي"
};

// 3. Sync Current Products
const currentCSV = fs.readFileSync(currentPath, 'utf8');
const currentLines = currentCSV.split('\n');
const headers = currentLines[0].split(',');
const noIdx = headers.indexOf('No'); // Some specify 'No', some 'item_no'
const arabicIdx = headers.indexOf('Arabic Name');

if (noIdx === -1 || arabicIdx === -1) {
    console.error("Could not find headers in current CSV", headers);
    process.exit(1);
}

const fixedLines = currentLines.map((line, idx) => {
    if (idx === 0) return line;
    const parts = line.split(',');
    const itemNo = parts[noIdx] ? parts[noIdx].trim().replace(/^"|"$/g, '') : '';
    
    if (itemNo) {
        if (arabicMapping[itemNo]) {
            parts[arabicIdx] = `"${arabicMapping[itemNo]}"`;
        }
        if (manualPatches[itemNo]) {
            parts[arabicIdx] = `"${manualPatches[itemNo]}"`;
        }
    }
    return parts.join(',');
});

fs.writeFileSync(outputPath, fixedLines.join('\n'), 'utf8');
console.log(`Successfully synced products to ${outputPath}`);
