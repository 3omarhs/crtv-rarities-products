# scripts/SyncExcelToCsv.ps1
param(
    [string]$ExcelPath = "d:\GitHub\crtv-rarities-products\temp products names.xlsx",
    [string]$CsvPath = "d:\GitHub\crtv-rarities-products\data\products.csv"
)

Write-Host "Starting sync from $ExcelPath to $CsvPath..." -ForegroundColor Cyan

# 1. Read Excel Data
try {
    $excel = New-Object -ComObject Excel.Application
    $excel.Visible = $false
    $workbook = $excel.Workbooks.Open($ExcelPath)
    $sheet = $workbook.Sheets.Item(1)
    $range = $sheet.UsedRange
    $rows = $range.Rows.Count
    
    $mapping = @{}
    
    # Identify Header Indices
    $noIdx = -1
    $nameIdx = -1
    for ($c = 1; $c -le $range.Columns.Count; $c++) {
        $header = [string]$sheet.Cells.Item(1, $c).Value2
        if ($header -eq "No") { $noIdx = $c }
        if ($header -eq "Product Name") { $nameIdx = $c }
    }
    
    if ($noIdx -eq -1 -or $nameIdx -eq -1) {
        Write-Error "Could not find 'No' or 'Product Name' columns in Excel."
        $workbook.Close($false)
        $excel.Quit()
        return
    }
    
    Write-Host "Reading mappings from Excel..."
    for ($r = 2; $r -le $rows; $r++) {
        $sku = [string]$sheet.Cells.Item($r, $noIdx).Value2
        $name = [string]$sheet.Cells.Item($r, $nameIdx).Value2
        if ($sku -and $name) {
            $mapping[$sku] = $name
        }
    }
    
    $workbook.Close($false)
    $excel.Quit()
    [System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null
    Write-Host "Found $($mapping.Count) product name mappings in Excel." -ForegroundColor Green
} catch {
    Write-Error "Failed to read Excel file: $_"
    if ($excel) { $excel.Quit() }
    return
}

# 2. Update CSV Data
try {
    Write-Host "Updating CSV file..."
    $csvData = Import-Csv $CsvPath -Encoding UTF8
    $updateCount = 0
    
    foreach ($row in $csvData) {
        $sku = $row.No
        if ($mapping.ContainsKey($sku)) {
            $oldName = $row."Product Name"
            $newName = $mapping[$sku]
            if ($oldName -ne $newName) {
                $row."Product Name" = $newName
                $updateCount++
            }
        }
    }
    
    if ($updateCount -gt 0) {
        $csvData | Export-Csv $CsvPath -NoTypeInformation -Encoding UTF8 -Force
        Write-Host "Success! Updated $updateCount product names in $CsvPath." -ForegroundColor Green
    } else {
        Write-Host "No changes needed. All names already match." -ForegroundColor Yellow
    }
} catch {
    Write-Error "Failed to update CSV: $_"
}
