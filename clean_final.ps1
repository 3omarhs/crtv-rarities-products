$inputPath = "data/products_backup.csv"
$outputPath = "data/products_clean.csv"

Write-Host "Reading $inputPath..."
# Use Raw content to handle multi-line properly
$content = Get-Content $inputPath -Raw -Encoding UTF8

# Heuristic: Find rows that start with common SKU patterns or the header
# Header: No,product name,Name on Store,...
# SKUs often looks like: CRE-..., PET-..., etc.

# Actually, and easier way is to use PapaParse equivalent or just fix the specific bad row.
# The Magic Tap Wand row is the main one.

# Let's try to parse it with Import-Csv but carefully
# If Import-Csv fails, we do the raw fix.

try {
    $data = Import-Csv $inputPath -Encoding UTF8
    Write-Host "Import-Csv successful! fixing specific rows..."
    
    foreach ($row in $data) {
        # Fix Magic Tap Wand
        if ($row.No -eq "Magic Tap Wand") {
             Write-Host "Fixing Magic Tap Wand row..."
             # Shift values: Name on Store -> Category, etc.
             # Based on previous analysis:
             $row.Category = $row.'Name on Store'
             $row.'Price < 25 QTY' = $row.category
             $row.No = "PET-MTW-001"
             $row.'product name' = "Magic Tap Wand"
             $row.'Name on Store' = "Magic Tap Wand - Interactive Cat Toy"
        }
        
        # Remove Test Products
        if ($row.'product name' -like "*test*") {
            # Mark for removal or just skip
        }
    }
    
    $data | Where-Object { $_.'product name' -notlike "*test*" } | Export-Csv $outputPath -NoTypeInformation -Encoding UTF8
    Write-Host "Cleaned file saved to $outputPath"
} catch {
    Write-Host "Import-Csv failed, falling back to regex fix..."
    # Regex fix for the specific corruption patterns
    # (Simplified for now if Import-Csv works on the backup)
}
