$GAS_URL = "https://script.google.com/macros/s/AKfycbxpzqWhgL17l6J_nKZl4n_LlugnbXyT3ACE127tTn6Dmr0-x9Hmt6EiBjSh5bMc9OHtxw/exec"
$DATA_DIR = Join-Path $PSScriptRoot "..\data"

Write-Host "Starting migration to GAS via PowerShell..."

# 1. Read and Parse Visits
$visitsPath = Join-Path $DATA_DIR "visits.csv"
$visits = Import-Csv $visitsPath | ForEach-Object {
    [PSCustomObject]@{
        count = [int]$_.count
        date  = $_.date.Trim()
    }
}
Write-Host "Read $($visits.Count) visit records."

# 2. Read and Parse Orders
$ordersPath = Join-Path $DATA_DIR "orders.csv"
$orders = Import-Csv $ordersPath | ForEach-Object {
    # The 'items' field might be a JSON string, but Invoke-RestMethod will handle it as text unless we parse it.
    # However, for the GAS backend, it's safer to send it as it's parsed from CSV (string).
    $_
}
Write-Host "Read $($orders.Count) order records."

# 3. Construct Payload
$payload = @{
    action = "migrateData"
    data = @{
        visits = $visits
        orders = $orders
    }
} | ConvertTo-Json -Depth 10

# 4. Send to GAS
Write-Host "Sending data to GAS..."
try {
    $response = Invoke-RestMethod -Uri $GAS_URL -Method Post -Body $payload -ContentType "application/json"
    Write-Host "Migration Result:" ($response | ConvertTo-Json)
    
    if ($response.status -eq "success") {
        Write-Host "MIGRATION SUCCESSFUL!" -ForegroundColor Green
    } else {
        Write-Host "MIGRATION FAILED: $($response.message)" -ForegroundColor Red
    }
} catch {
    Write-Host "Error during migration: $_" -ForegroundColor Red
}
