$dataDir = "d:\GitHub\crtv-rarities-products\data"

function Decrypt-Key($encBase64) {
    if ([string]::IsNullOrWhiteSpace($encBase64)) { return $encBase64 }
    try {
        $encBytes = [System.Convert]::FromBase64String($encBase64)
        $keyBytes = [System.Text.Encoding]::UTF8.GetBytes("crtv_secure_2026")
        $resBytes = New-Object byte[] $encBytes.Length
        for ($i=0; $i -lt $encBytes.Length; $i++) {
            $resBytes[$i] = $encBytes[$i] -bxor $keyBytes[$i % $keyBytes.Length]
        }
        $dec = [System.Text.Encoding]::UTF8.GetString($resBytes)
        if ($dec -match "^AIza") { return $dec }
        return $encBase64
    } catch { return $encBase64 }
}

function Test-Key($apiKey) {
    Write-Output "`nTesting key: $($apiKey.Substring(0, 8))..."
    $models = @("gemini-1.5-flash", "gemini-1.5-pro", "gemini-2.0-flash-exp", "gemini-1.5-flash-latest")
    foreach ($model in $models) {
        $url = "https://generativelanguage.googleapis.com/v1beta/models/$($model):generateContent?key=$apiKey"
        $body = @{ contents = @(@{ parts = @(@{ text = "say hi" }) }) } | ConvertTo-Json -Depth 10
        try {
            $response = Invoke-RestMethod -Uri $url -Method Post -ContentType "application/json" -Body $body -ErrorAction Stop
            Write-Output "  - Model ${model}: SUCCESS"
            return $true
        } catch {
            $err = $_.Exception.Message
            Write-Output "  - Model ${model}: FAILED ($err)"
            if ($_.Exception.Response) {
                $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
                $body = $reader.ReadToEnd()
                Write-Output "    Body: $body"
            }
        }
    }
    return $false
}

$apiKeys = @()

# 1. From gemini_keys.csv
if (Test-Path "$dataDir\gemini_keys.csv") {
    $keysRaw = Import-Csv "$dataDir\gemini_keys.csv"
    foreach ($row in $keysRaw) { if ($row.key) { $apiKeys += Decrypt-Key $row.key } }
}

# 2. From settings.csv
if (Test-Path "$dataDir\settings.csv") {
    $settings = Import-Csv "$dataDir\settings.csv"
    foreach ($row in $settings) {
        if ($row.value -match "Gemini API Key: (AIza[A-Za-z0-9_-]+)") {
            $apiKeys += $Matches[1]
        }
    }
}

$apiKeys = $apiKeys | Select-Object -Unique

Write-Output "Total keys to test: $($apiKeys.Count)"

foreach ($k in $apiKeys) {
    Test-Key $k
}
