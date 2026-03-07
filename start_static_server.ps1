$port = 8000
$root = "d:\GitHub\crtv-rarities-products\public"
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")
$listener.Start()
Write-Host "Static Server Listening on http://localhost:$port/"
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
        
        if (Test-Path $localPath -PathType Leaf) {
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
        } elseif ($path -match "^/api/") {
            $response.StatusCode = 404
            $err = "{`"error`": `"API not implemented in static server`"}"
            $bytes = [System.Text.Encoding]::UTF8.GetBytes($err)
            $response.ContentType = "application/json"
            $response.ContentLength64 = $bytes.Length
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
        } else {
            $response.StatusCode = 404
        }
        $response.Close()
    } catch {
        # ignore
    }
}
