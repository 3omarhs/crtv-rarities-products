$port = 8080
$root = "d:\GitHub\crtv-rarities-products\public"
$dataDir = "d:\GitHub\crtv-rarities-products\data"
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")
$listener.Start()
Write-Output "API-Enabled Static Server Listening on http://localhost:$port/"

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

function Convert-CsvToJson($csvPath) {
    if (Test-Path $csvPath) {
        $data = Import-Csv $csvPath
        return $data | ConvertTo-Json -Depth 10
    }
    return "[]"
}

while ($listener.IsListening) {
    try {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response
        
        if ($request.HttpMethod -eq "OPTIONS") {
            $response.Headers.Add("Access-Control-Allow-Origin", "*")
            $response.Headers.Add("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            $response.StatusCode = 200
            $response.Close()
            continue
        }

        $path = $request.Url.LocalPath
        Write-Output "Request: $($request.HttpMethod) $path"
        if ($path -eq "/" -or $path -eq "") { $path = "/index.html" }
        
        $localPath = Join-Path $root $path.Replace("/", "\")
        
        # API Routes
        if ($path -match "^/api/") {
            $response.Headers.Add("Access-Control-Allow-Origin", "*")
            $response.ContentType = "application/json; charset=utf-8"
            $json = "{}"
            
            if ($path -eq "/api/orders") {
                $json = Convert-CsvToJson (Join-Path $dataDir "orders.csv")
            } elseif ($path -eq "/api/visits") {
                $visits = Import-Csv (Join-Path $dataDir "visits.csv")
                $total = 0
                $daily = @{}
                $todayStr = Get-Date -Format "yyyy-MM-dd"
                $todayCount = 0
                
                foreach ($v in $visits) {
                    $c = [int]$v.count
                    $total += $c
                    $daily[$v.date] = $c
                    if ($v.date -eq $todayStr) { $todayCount = $c }
                }
                
                $res = @{
                    total = $total
                    daily = $daily
                    today = $todayCount
                    visits = $total
                }
                $json = $res | ConvertTo-Json
            } elseif ($path -eq "/api/admins") {
                $json = Convert-CsvToJson (Join-Path $dataDir "admins.csv")
            } elseif ($path -eq "/api/settings") {
                $setRaw = Import-Csv (Join-Path $dataDir "settings.csv")
                $set = @{}
                foreach ($s in $setRaw) { $set[$s.key] = $s.value }
                $json = $set | ConvertTo-Json
            } elseif ($path -eq "/api/gemini-keys") {
                $keysRaw = Import-Csv (Join-Path $dataDir "gemini_keys.csv")
                $keys = $keysRaw | ForEach-Object { Decrypt-Key $_.key }
                $json = @{ keys = $keys } | ConvertTo-Json
            } elseif ($path -eq "/api/products") {
                $json = Convert-CsvToJson (Join-Path $dataDir "products.csv")
            } elseif ($path -eq "/api/proxy-gemini" -and $request.HttpMethod -eq "POST") {
                try {
                    $reader = New-Object System.IO.StreamReader($request.InputStream)
                    $postData = $reader.ReadToEnd() | ConvertFrom-Json
                    $response.StatusCode = 200
                    
                    # Get API Keys from all sources
                    $apiKeys = @()
                    
                    # 1. From gemini_keys.csv
                    if (Test-Path (Join-Path $dataDir "gemini_keys.csv")) {
                        $keysRaw = Import-Csv (Join-Path $dataDir "gemini_keys.csv")
                        foreach ($row in $keysRaw) { if ($row.key) { $apiKeys += Decrypt-Key $row.key } }
                    }
                    
                    # 2. From settings.csv fallback
                    if (Test-Path (Join-Path $dataDir "settings.csv")) {
                        $settings = Import-Csv (Join-Path $dataDir "settings.csv")
                        # Try both specific keys and raw credentials block
                        $geminiRow = $settings | Where-Object { $_.key -eq "gemini_credentials_raw" -or $_.key -eq "gemini_api_key" }
                        foreach ($row in $geminiRow) {
                            if ($row.value -match "Gemini API Key: ([A-Za-z0-9_-]+)") {
                                $apiKeys += Decrypt-Key $Matches[1]
                            } elseif ($row.value -match "^AIza") {
                                $apiKeys += Decrypt-Key $row.value
                            }
                        }
                    }

                    # Remove duplicates and empty keys
                    $apiKeys = $apiKeys | Where-Object { $_ } | Select-Object -Unique

                    if ($apiKeys.Count -eq 0) { throw "No Gemini API Key found in gemini_keys.csv or settings.csv" }

                    # Updated robust model list
                    $models = @("gemini-2.0-flash", "gemini-1.5-flash-latest", "gemini-1.5-flash", "gemini-flash-latest", "gemini-2.0-flash-exp")
                    $success = $false
                    $lastErr = ""

                    foreach ($apiKey in $apiKeys) {
                        foreach ($model in $models) {
                            try {
                                Write-Output "Attempting Gemini API with model: $model (Key: $($apiKey.Substring(0, 8)))..."
                                $url = "https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}"
                                $headers = @{ "Content-Type" = "application/json" }
                                $payload = @{
                                    contents = @(
                                        @{
                                            parts = @(
                                                @{ text = $postData.prompt }
                                            )
                                        }
                                    )
                                }
                                # Add image if present
                                if ($postData.image -and $postData.mimeType) {
                                    $payload.contents[0].parts += @{ inline_data = @{ mime_type = $postData.mimeType; data = $postData.image } }
                                }
                                
                                $apiResponse = Invoke-RestMethod -Uri $url -Method Post -Headers $headers -Body ($payload | ConvertTo-Json -Depth 10)
                                $json = $apiResponse | ConvertTo-Json -Depth 10
                                $success = $true
                                break
                            } catch {
                                $lastErr = $_.Exception.Message
                                Write-Output "Gemini API Error with model $model : $lastErr"
                                if ($_.Exception.Response) {
                                    $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
                                    $errorBody = $reader.ReadToEnd()
                                    Write-Output "Error Body: $errorBody"
                                }
                            }
                        }
                        if ($success) { break }
                    }

                    if (-not $success) {
                        throw "All Gemini API keys failed. Last error: $lastErr"
                    }
                } catch {
                    $response.StatusCode = 500
                    $json = @{ error = $_.Exception.Message } | ConvertTo-Json
                }
            } else {
                $response.StatusCode = 404
                $json = "{`"error`": `"Endpoint not implemented`"}"
            }
            
            $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
            $response.ContentLength64 = $bytes.Length
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
        } elseif (Test-Path $localPath -PathType Leaf) {
            $ext = [System.IO.Path]::GetExtension($localPath).ToLower()
            $mime = "application/octet-stream"
            switch ($ext) {
                ".html" { $mime = "text/html; charset=utf-8" }
                ".css"  { $mime = "text/css; charset=utf-8" }
                ".js"   { $mime = "application/javascript; charset=utf-8" }
                ".png"  { $mime = "image/png" }
                ".jpg"  { $mime = "image/jpeg" }
                ".jpeg" { $mime = "image/jpeg" }
                ".gif"  { $mime = "image/gif" }
                ".json" { $mime = "application/json; charset=utf-8" }
                ".svg"  { $mime = "image/svg+xml" }
                ".ico"  { $mime = "image/x-icon" }
            }
            $response.ContentType = $mime
            $response.Headers.Add("Access-Control-Allow-Origin", "*")
            
            $bytes = [System.IO.File]::ReadAllBytes($localPath)
            $response.ContentLength64 = $bytes.Length
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
            $response.StatusCode = 200
        } else {
            $response.StatusCode = 404
        }
        $response.Close()
    } catch {
        Write-Output "Error: $_"
    }
}
