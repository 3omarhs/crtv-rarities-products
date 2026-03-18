$excelPath = "D:\GitHub\crtv-rarities-products\temp products names.xlsx"
$csvPath = "D:\GitHub\crtv-rarities-products\data\products.csv"

Write-Host "Reading Excel..."
$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$workbook = $excel.Workbooks.Open($excelPath)
$worksheet = $workbook.Sheets.Item(1)

$nameMap = @{}
for ($row = 1; $row -le 1000; $row++) {
    $val1 = $worksheet.Cells.Item($row, 1).Value2
    $val2 = $worksheet.Cells.Item($row, 2).Value2
    
    if ($null -eq $val1 -and $null -eq $val2) { break }
    if ($null -ne $val1 -and $null -ne $val2) {
        $nameMap[$val2.ToString().Trim()] = $val1.ToString().Trim()
    }
}
$workbook.Close($false)
$excel.Quit()
[System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null
Write-Host "Found $($nameMap.Keys.Count) mappings in Excel."

Write-Host "Reading CSV and repairing names..."
$csvData = Import-Csv -Path $csvPath -Encoding UTF8
$updatedCount = 0

foreach ($row in $csvData) {
    if ([string]::IsNullOrWhiteSpace($row.'Product Name')) {
        $itemNo = $row.No
        if ($null -ne $itemNo -and $nameMap.ContainsKey($itemNo)) {
            $row.'Product Name' = $nameMap[$itemNo]
            $updatedCount++
        } else {
            # Fallback for new products added recently
            $storeName = $row.'Name on Store'
            if (-not [string]::IsNullOrWhiteSpace($storeName)) {
                $row.'Product Name' = $storeName
                $updatedCount++
            } else {
                $row.'Product Name' = 'Unknown Product'
            }
        }
    }
}

Write-Host "Updated $updatedCount rows. Saving CSV..."
$csvData | Export-Csv -Path $csvPath -Encoding UTF8 -NoTypeInformation

Write-Host "Done!"
