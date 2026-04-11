# SUPER ROBUST sync script to recover Arabic names
$currentPath = "d:\GitHub\crtv-rarities-products\data\products.csv"
$spreadsheetPath = "C:\Users\omarh\.gemini\antigravity\brain\1680ae4d-9350-45aa-8d0a-58da7317c7f3\.system_generated\steps\664\content.md"
$patchesPath = "d:\GitHub\crtv-rarities-products\scripts\gap_patches.json"
$outputPath = "d:\GitHub\crtv-rarities-products\data\products_final_v2.csv"

Write-Host "Starting FINAL V2 Sync..."

# 1. Load Patches from JSON (Strict UTF8)
$patchesRaw = [System.IO.File]::ReadAllText($patchesPath, [System.Text.Encoding]::UTF8)
$patches = $patchesRaw | ConvertFrom-Json
Write-Host "Loaded manual patches JSON."

# 2. Load Mapping from Spreadsheet (Skip first few lines)
$allLines = [System.IO.File]::ReadAllLines($spreadsheetPath, [System.Text.Encoding]::UTF8)
$csvLines = $allLines | Where-Object { $_ -match "," -and $_ -notmatch "^Source:" -and $_ -notmatch "^---" }
$tempCsv = [System.IO.Path]::GetTempFileName()
[System.IO.File]::WriteAllLines($tempCsv, $csvLines, [System.Text.Encoding]::UTF8)

# Import-Csv with UTF8
$sheetData = Import-Csv $tempCsv -Encoding UTF8
$arabicMapping = @{}
foreach ($row in $sheetData) {
    if ($row.No) {
        $no = $row.No.Trim()
        $arabic = $row."Arabic Name"
        if (![string]::IsNullOrWhiteSpace($arabic) -and $arabic -notmatch "\?") {
            $arabicMapping[$no] = $arabic
        }
    }
}
Write-Host "Mapped $($arabicMapping.Count) clean Arabic entries from Sheet."

# 3. Read Current products.csv (Strict UTF8)
$currentData = Import-Csv $currentPath -Encoding UTF8
$fixedTotal = 0

foreach ($row in $currentData) {
    if ($row.No) {
        $itemNo = $row.No.Trim()
        
        # Priority 1: Spreadsheet
        if ($arabicMapping.ContainsKey($itemNo)) {
             $row."Arabic Name" = $arabicMapping[$itemNo]
             $fixedTotal++
        }
        
        # Priority 2: Manual Patches (wins for recent items)
        if ($patches.PSObject.Properties[$itemNo]) {
            $row."Arabic Name" = $patches.$itemNo
            $fixedTotal++
        }
    }
}

# 4. Final Export (UTF8)
$currentData | Export-Csv $outputPath -NoTypeInformation -Encoding UTF8
Write-Host "Success! Recovered $fixedTotal records. File at $outputPath"
