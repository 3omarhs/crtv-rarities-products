$apiKey = "AIzaSyDNDCb82ygt8XBSZWAdJUP672T6-MtYWbs"
$model = "gemini-1.5-flash"
$url = "https://generativelanguage.googleapis.com/v1beta/models/$($model):generateContent?key=$apiKey"
$body = @{ contents = @(@{ parts = @(@{ text = "hi" }) }) } | ConvertTo-Json -Depth 10

Write-Output "Testing URL: $url"
try {
    $res = Invoke-WebRequest -Uri $url -Method Post -ContentType "application/json" -Body $body -ErrorAction Stop
    Write-Output "SUCCESS!"
    Write-Output $res.Content
} catch {
    Write-Output "FAILED!"
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $errBody = $reader.ReadToEnd()
        Write-Output "Error Body: $errBody"
    } else {
        Write-Output "Error Message: $($_.Exception.Message)"
    }
}
