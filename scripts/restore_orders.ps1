# Restoration script for Order addresses/names using PowerShell
$currentPath = "d:\GitHub\crtv-rarities-products\data\orders.csv"
$backupPath = "d:\GitHub\crtv-rarities-products\data\orders_backup.csv"
$outputPath = "d:\GitHub\crtv-rarities-products\data\orders_fixed.csv"

Write-Host "Starting orders restoration..."

# Load mapping from backup. Backup uses 'id' and 'address', 'customerName'.
$backupData = Import-Csv $backupPath -Encoding UTF8
$addrMapping = @{}
$nameMapping = @{}
foreach ($row in $backupData) {
    if ($row.id) {
        $addrMapping[$row.id.Trim()] = $row.address
        $nameMapping[$row.id.Trim()] = $row.customerName
    }
}
Write-Host "Loaded $($addrMapping.Count) orders from backup."

# Read current file.
$currentData = Import-Csv $currentPath -Encoding UTF8
$fixedAddrCount = 0
$fixedNameCount = 0
foreach ($row in $currentData) {
    if ($row.id) {
        $orderId = $row.id.Trim()
        if ($addrMapping.ContainsKey($orderId)) {
            # Only restore if current is mangled (contains '?' or is missing)
            if ($row.address -match "\?" -or [string]::IsNullOrWhiteSpace($row.address)) {
                $row.address = $addrMapping[$orderId]
                $fixedAddrCount++
            }
            if ($row.customerName -match "\?" -or [string]::IsNullOrWhiteSpace($row.customerName)) {
                $row.customerName = $nameMapping[$orderId]
                $fixedNameCount++
            }
        }
    }
}

# Export to fixed file
$currentData | Export-Csv $outputPath -NoTypeInformation -Encoding UTF8
Write-Host "Successfully restored $fixedAddrCount addresses and $fixedNameCount names to $outputPath"
