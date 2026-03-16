
$inputFile = "d:\GitHub\crtv-rarities-products\data\products.csv"
$data = Import-Csv -Path $inputFile | Select-Object -First 1
if ($data) {
    $props = $data.psobject.properties
    foreach ($p in $props) {
        Write-Output "Property: [$($p.Name)] - Value: [$($p.Value)]"
    }
} else {
    Write-Output "No data found."
}
