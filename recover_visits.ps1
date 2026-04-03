$url = "https://hrbjmhbteqjyomfwclgj.supabase.co/rest/v1/visits?select=date,count"
$anonKey = "sb_publishable_9S8Pf9CMDK7ggfG00FxM2g_O-DsRUrv"

$headers = @{
    "apikey" = $anonKey
    "Authorization" = "Bearer $anonKey"
}

$response = Invoke-RestMethod -Uri $url -Headers $headers -Method Get

$csvContent = "date,count`r`n"
foreach ($row in $response) {
    $csvContent += $row.date + "," + $row.count + "`r`n"
}

Set-Content -Path "data\visits.csv" -Value $csvContent -NoNewline

# Recover visit_logs
$logsUrl = "https://hrbjmhbteqjyomfwclgj.supabase.co/rest/v1/visit_logs?select=date,device_name,timestamp"
$logsResponse = Invoke-RestMethod -Uri $logsUrl -Headers $headers -Method Get

$logsCsv = "date,deviceName,timestamp`r`n"
foreach ($row in $logsResponse) {
    $device = ($row.device_name) -replace ",", ""
    $timestamp = $row.timestamp
    if ($null -eq $timestamp) {
        $timestamp = ""
    }
    $logsCsv += $row.date + "," + $device + "," + $timestamp + "`r`n"
}
Set-Content -Path "data\visit_logs.csv" -Value $logsCsv -NoNewline

Write-Host "Recovered Supabase visits."
