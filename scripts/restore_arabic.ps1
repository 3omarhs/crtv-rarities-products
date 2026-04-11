# Restoration script for Arabic names using PowerShell
$currentPath = "d:\GitHub\crtv-rarities-products\data\products.csv"
$backupPath = "d:\GitHub\crtv-rarities-products\data\products_backup.csv"
$outputPath = "d:\GitHub\crtv-rarities-products\data\products_fixed.csv"

Write-Host "Starting restoration..."

# Load mapping from backup. Backup uses item_no and arabic_name.
$backupData = Import-Csv $backupPath -Encoding UTF8
$mapping = @{}
foreach ($row in $backupData) {
    if ($row.item_no) {
        $mapping[$row.item_no.Trim()] = $row.arabic_name
    }
}
Write-Host "Loaded $($mapping.Count) Arabic names from backup."

# Read current file.
# Note: headers might be slightly different.
$currentData = Import-Csv $currentPath -Encoding UTF8
$fixedCount = 0
foreach ($row in $currentData) {
    # Match on 'No' column
    if ($row.No) {
        $itemNo = $row.No.Trim()
        if ($mapping.ContainsKey($itemNo)) {
            $row."Arabic Name" = $mapping[$itemNo]
            $fixedCount++
        }
    }
}

# Export to fixed file
$currentData | Export-Csv $outputPath -NoTypeInformation -Encoding UTF8
Write-Host "Successfully restored $fixedCount Arabic names to $outputPath"
