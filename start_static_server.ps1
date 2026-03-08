$port = 8000
$root = "d:\GitHub\crtv-rarities-products\public"
$dataDir = "d:\GitHub\crtv-rarities-products\data"
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")
$listener.Start()
Write-Host "API-Enabled Static Server Listening on http://localhost:$port/"

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
                $keys = $keysRaw | ForEach-Object { $_.key }
                $json = @{ keys = $keys } | ConvertTo-Json
            } elseif ($path -eq "/api/products") {
                $json = Convert-CsvToJson (Join-Path $dataDir "products.csv")
            } else {
                $response.StatusCode = 404
                $json = "{`"error`": `"Endpoint not implemented`"}"
            }
            
            $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
            $response.ContentLength64 = $bytes.Length
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
            $response.StatusCode = 200
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
        Write-Host "Error: $_"
    }
}
