Write-Host "Fetching latest CSV and old CSV into memory..."
$latestCsvContent = git -C "D:\GitHub\crtv-rarities-products" show main:data/products.csv
$oldCsvContent = git -C "D:\GitHub\crtv-rarities-products" show e2406b3:data/products.csv

# Save to temp files to import via Import-Csv
$latestCsvContent | Out-File latest.csv -Encoding UTF8
$oldCsvContent | Out-File old.csv -Encoding UTF8

$oldData = Import-Csv -Path old.csv -Encoding UTF8
$latestData = Import-Csv -Path latest.csv -Encoding UTF8

Write-Host "Building name map from old CSV..."
$nameMap = @{}
foreach ($row in $oldData) {
    if (-not [string]::IsNullOrWhiteSpace($row.No) -and -not [string]::IsNullOrWhiteSpace($row.'Product Name')) {
        $nameMap[$row.No.Trim()] = $row.'Product Name'.Trim()
    }
}

Write-Host "Applying name map to latest CSV..."
$updatedCount = 0
foreach ($row in $latestData) {
    if ([string]::IsNullOrWhiteSpace($row.'Product Name')) {
        $itemNo = $row.No
        if ($null -ne $itemNo -and $nameMap.ContainsKey($itemNo.Trim())) {
            $row.'Product Name' = $nameMap[$itemNo.Trim()]
            $updatedCount++
        } else {
            # Fallback for brand new product
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

Write-Host "Updated $updatedCount product names. Saving back to data/products.csv..."
git -C "D:\GitHub\crtv-rarities-products" restore data/products.csv
$latestData | Export-Csv -Path "D:\GitHub\crtv-rarities-products\data\products.csv" -Encoding UTF8 -NoTypeInformation

rm latest.csv
rm old.csv
Write-Host "Done!"
