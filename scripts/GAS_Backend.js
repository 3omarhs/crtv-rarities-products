/**
 * CREATIVE RARITIES - GOOGLE APPS SCRIPT BACKEND
 * 
 * INSTRUCTIONS:
 * 1. Go to your Google Sheet.
 * 2. Click Extensions > Apps Script.
 * 3. Delete any code there and paste ALL of this code.
 * 4. Click Deploy > New deployment.
 * 5. Select type: Web app.
 * 6. Execute as: Me (<your email>).
 * 7. Who has access: Anyone.
 * 8. Click Deploy, Authorize access, and copy the Web app URL.
 * 9. Paste that URL into your app's Settings in the Admin Portal.
 */

const SPREADSHEET_ID = '1x3ExLPeQwSJtewUXQhYwdXO_I3Owhs6fenFc4UlbwPU'; // Your Sheet ID

function doPost(e) {
    try {
        const data = JSON.parse(e.postData.contents);
        const action = data.action;

        if (action === 'placeOrder') {
            return handleNewOrder(data.order);
        } else if (action === 'recordVisit') {
            return handleVisit();
        } else if (action === 'updateProduct') {
            return handleProductUpdate(data.product);
        }

        return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'Unknown action' }))
            .setMimeType(ContentService.MimeType.JSON);

    } catch (error) {
        return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: error.toString() }))
            .setMimeType(ContentService.MimeType.JSON);
    }
}

function handleNewOrder(order) {
    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('orders');
    if (!sheet) return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'Orders sheet not found' }));

    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

    // Prepare row data based on headers
    const rowData = headers.map(header => {
        switch (header) {
            case 'id': return order.id;
            case 'customerName': return order.customerName;
            case 'customerPhone': return order.customerPhone;
            case 'selectedRegion': return order.selectedRegion;
            case 'selectedCompany': return order.selectedCompany;
            case 'address': return order.address;
            case 'items': return Array.isArray(order.items) ? order.items.join(' | ') : order.items;
            case 'total': return order.total;
            case 'method': return order.method;
            case 'paymentMethod': return order.paymentMethod;
            case 'status': return order.status || 'Pending';
            case 'timestamp': return order.timestamp;
            case 'date': return order.date;
            case 'currency': return order.currency;
            default: return '';
        }
    });

    sheet.appendRow(rowData);

    return ContentService.createTextOutput(JSON.stringify({ status: 'success', message: 'Order recorded' }))
        .setMimeType(ContentService.MimeType.JSON);
}

function handleVisit() {
    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('visits');
    if (!sheet) return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'Visits sheet not found' }));

    const today = new Date().toISOString().split('T')[0];
    const data = sheet.getDataRange().getValues();

    let found = false;
    for (let i = 1; i < data.length; i++) {
        if (data[i][0] === today) {
            sheet.getRange(i + 1, 2).setValue(Number(data[i][1]) + 1);
            found = true;
            break;
        }
    }

    if (!found) {
        sheet.appendRow([today, 1]);
    }

    return ContentService.createTextOutput(JSON.stringify({ status: 'success', message: 'Visit recorded' }))
        .setMimeType(ContentService.MimeType.JSON);
}

// Ensure CORS is handled for preflight requests
function doOptions(e) {
    const headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
    };
    return ContentService.createTextOutput()
        .setMimeType(ContentService.MimeType.JSON);
}
