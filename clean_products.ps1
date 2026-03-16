
$inputFile = "d:\GitHub\crtv-rarities-products\data\products.csv"
$outputFile = "d:\GitHub\crtv-rarities-products\data\products_clean.csv"

Write-Output "Loading $inputFile..."
# Load all data first
$data = Import-Csv -Path $inputFile

if ($data.Count -gt 0) {
    # Get all properties from the first object
    $allProps = $data[0].psobject.properties.Name
    
    # Filter out the empty-named column (the one that absorbed the JSON blobs)
    # The trailing comma in the header creates an empty-named property or one named ""
    $validColumns = $allProps | Where-Object { $_ -ne "" -and $_ -notlike "Column*" }
    
    # We also know there should be 19 columns total based on our analysis.
    # Let's take the first 19 valid-looking columns.
    $validColumns = $validColumns | Select-Object -First 19

    Write-Output "Kept Columns: $( $validColumns -join ' | ' )"

    Write-Output "Cleaning data..."
    $cleanedData = $data | Select-Object -Property $validColumns

    Write-Output "Exporting to $outputFile..."
    $cleanedData | Export-Csv -Path $outputFile -NoTypeInformation -Encoding UTF8
    Write-Output "Done. Cleaned file size: $((Get-Item $outputFile).Length / 1MB) MB"
} else {
    Write-Output "No data found to clean."
}
