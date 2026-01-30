/*
 * Google Apps Script for Creative Rarities Store
 * Updated: Parses extended details (Region, Cost, Method) from Raw Data column
 * Updated: addProduct now includes Raw Data column and auto-creates sheet if missing
 */

function doPost(e) {
    try {
        const data = JSON.parse(e.postData.contents);
        const action = data.action;
        const ss = SpreadsheetApp.getActiveSpreadsheet();

        if (action === 'addProduct' || !action) {
            let sheet = ss.getSheetByName("Products");
            if (!sheet) {
                sheet = ss.insertSheet("Products");
                sheet.appendRow([
                    "product name", "No", "category", "collection", "target market",
                    "Calculate on Weight", "Dimensions(mm) x y z", "description (80 word)",
                    "Price < 25 QTY", "Price >=25 QTY", "discount cal", "Document Link",
                    "Discount %", "calc", "Name on Store", "Arabic Name", "Available", "Hidden", "Colors", "Raw Data"
                ]);
            }

            const values = sheet.getDataRange().getValues();
            // Check duplicates
            for (let i = 1; i < values.length; i++) {
                if (values[i][1] === data.No) {
                    return ContentService.createTextOutput(JSON.stringify({ "result": "error", "error": "Product Number already exists" })).setMimeType(ContentService.MimeType.JSON);
                }
            }
            // Append
            const row = [
                data['product name'] || '',
                data['No'] || '',
                data['category'] || '',
                data['collection'] || '',
                '', // target market
                '', // Calculate on Weight
                data['Dimensions(mm) x y z'] || '',
                data['description (80 word)'] || '',
                data['Price < 25 QTY'] || '',
                '', // Price >=25
                '', // discount cal
                '', // Document Link
                '', // Discount %
                '', // calc
                data['Name on Store'] || '', // FIXED: Map Name on Store correctly
                data['Arabic Name'] || '',
                'TRUE',
                'FALSE',
                data['Colors'] || '',
                JSON.stringify(data) // Column T: Raw Data
            ];
            sheet.appendRow(row);
            return ContentService.createTextOutput(JSON.stringify({ "result": "success" })).setMimeType(ContentService.MimeType.JSON);
        }

        if (action === 'updateProduct') {
            const sheet = ss.getSheetByName("Products");
            if (!sheet) return ContentService.createTextOutput(JSON.stringify({ "result": "error", "error": "Sheet not found" })).setMimeType(ContentService.MimeType.JSON);
            const values = sheet.getDataRange().getValues();

            // Find row by No (Column Index 1)
            for (let i = 1; i < values.length; i++) {
                if (String(values[i][1]) === String(data.No)) { // Match 'No'
                    const rowIndex = i + 1;

                    // Update columns (indices 0-based in array, 1-based in Sheet)
                    // We only update fields provided in 'data'. 
                    // Note: This matches the 'addProduct' schema.

                    if (data['product name'] !== undefined) sheet.getRange(rowIndex, 1).setValue(data['product name']);
                    // Column 2 (No) is the key, usually not changed, but if needed:
                    // if (data['No']) sheet.getRange(rowIndex, 2).setValue(data['No']);
                    if (data['category'] !== undefined) sheet.getRange(rowIndex, 3).setValue(data['category']);
                    if (data['collection'] !== undefined) sheet.getRange(rowIndex, 4).setValue(data['collection']);
                    // ... skip 5, 6
                    if (data['Dimensions(mm) x y z'] !== undefined) sheet.getRange(rowIndex, 7).setValue(data['Dimensions(mm) x y z']);
                    if (data['description (80 word)'] !== undefined) sheet.getRange(rowIndex, 8).setValue(data['description (80 word)']);
                    if (data['Price < 25 QTY'] !== undefined) sheet.getRange(rowIndex, 9).setValue(data['Price < 25 QTY']);
                    // ... skip 10-14
                    if (data['Name on Store'] !== undefined) sheet.getRange(rowIndex, 15).setValue(data['Name on Store']);
                    if (data['Arabic Name'] !== undefined) sheet.getRange(rowIndex, 16).setValue(data['Arabic Name']);
                    if (data['Available'] !== undefined) sheet.getRange(rowIndex, 17).setValue(data['Available']);
                    if (data['Hidden'] !== undefined) sheet.getRange(rowIndex, 18).setValue(data['Hidden']);
                    if (data['Colors'] !== undefined) sheet.getRange(rowIndex, 19).setValue(data['Colors']);

                    // Update Raw Data (Column 20)
                    // We need to merge existing raw data with new data
                    let rawData = {};
                    try { rawData = JSON.parse(values[i][19]); } catch (e) { }
                    const newRawData = { ...rawData, ...data };
                    sheet.getRange(rowIndex, 20).setValue(JSON.stringify(newRawData));

                    return ContentService.createTextOutput(JSON.stringify({ "result": "success" })).setMimeType(ContentService.MimeType.JSON);
                }
            }
            return ContentService.createTextOutput(JSON.stringify({ "result": "error", "error": "Product not found" })).setMimeType(ContentService.MimeType.JSON);
        }

        if (action === 'deleteProduct') {
            const sheet = ss.getSheetByName("Products");
            if (!sheet) return ContentService.createTextOutput(JSON.stringify({ "result": "error", "error": "Sheet not found" })).setMimeType(ContentService.MimeType.JSON);
            const values = sheet.getDataRange().getValues();

            for (let i = 1; i < values.length; i++) {
                if (String(values[i][1]) === String(data.No)) {
                    sheet.deleteRow(i + 1);
                    return ContentService.createTextOutput(JSON.stringify({ "result": "success" })).setMimeType(ContentService.MimeType.JSON);
                }
            }
            return ContentService.createTextOutput(JSON.stringify({ "result": "error", "error": "Product not found" })).setMimeType(ContentService.MimeType.JSON);
        }

        if (action === 'placeOrder') {
            let sheet = ss.getSheetByName("Orders");
            if (!sheet) {
                sheet = ss.insertSheet("Orders");
                sheet.appendRow(["ID", "Date", "Customer Name", "Phone", "Status", "Total", "Items", "Address", "Payment Method", "Raw Data"]);
            }
            const newOrder = data.order;
            const row = [
                newOrder.id, newOrder.date, newOrder.customerName, newOrder.customerPhone,
                newOrder.status || 'Placed', newOrder.total,
                JSON.stringify(newOrder.items),
                newOrder.address || (newOrder.selectedRegion + ", " + newOrder.selectedCompany),
                newOrder.paymentMethod,
                JSON.stringify(newOrder) // Column J: Raw Data
            ];
            sheet.appendRow(row);
            return ContentService.createTextOutput(JSON.stringify({ "result": "success", "orderId": newOrder.id })).setMimeType(ContentService.MimeType.JSON);
        }

        if (action === 'updateStatus') {
            const sheet = ss.getSheetByName("Orders");
            const values = sheet.getDataRange().getValues();
            for (let i = 1; i < values.length; i++) {
                if (String(values[i][0]) === String(data.orderId)) {
                    sheet.getRange(i + 1, 5).setValue(data.status);
                    return ContentService.createTextOutput(JSON.stringify({ "result": "success" })).setMimeType(ContentService.MimeType.JSON);
                }
            }
            return ContentService.createTextOutput(JSON.stringify({ "result": "error", "message": "Order not found" })).setMimeType(ContentService.MimeType.JSON);
        }
    } catch (ex) {
        return ContentService.createTextOutput(JSON.stringify({ "result": "error", "error": ex.toString() })).setMimeType(ContentService.MimeType.JSON);
    }
}

function doGet(e) {
    const action = e.parameter.action;
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    if (action === 'getOrders') {
        const sheet = ss.getSheetByName("Orders");
        if (!sheet) return ContentService.createTextOutput(JSON.stringify([])).setMimeType(ContentService.MimeType.JSON);

        const values = sheet.getDataRange().getValues();
        const orders = [];

        for (let i = 1; i < values.length; i++) {
            const row = values[i];
            try {
                let items = [];
                try { items = JSON.parse(row[6]); } catch (e) { items = [row[6]]; }

                // IMPORTANT: Extract extended details from Raw Data (Column J / Index 9)
                let rawData = {};
                try { rawData = JSON.parse(row[9]); } catch (e) { }

                orders.push({
                    id: row[0],
                    date: row[1],
                    customerName: row[2],
                    customerPhone: row[3],
                    status: row[4],
                    total: row[5],
                    items: items,
                    address: row[7],
                    paymentMethod: row[8],
                    // New Fields
                    method: rawData.method || '',
                    selectedRegion: rawData.selectedRegion || '',
                    selectedCompany: rawData.selectedCompany || '',
                    deliveryCost: rawData.deliveryCost || '0.00'
                });
            } catch (e) { }
        }
        return ContentService.createTextOutput(JSON.stringify(orders)).setMimeType(ContentService.MimeType.JSON);
    }
    return ContentService.createTextOutput(JSON.stringify({ "result": "error" })).setMimeType(ContentService.MimeType.JSON);
}
