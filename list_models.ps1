$apiKey = "AIzaSyDNDCb82ygt8XBSZWAdJUP672T6-MtYWbs"
$url = "https://generativelanguage.googleapis.com/v1beta/models?key=$apiKey"
try {
    $res = Invoke-RestMethod -Uri $url -Method Get
    $res.models | ForEach-Object { "$($_.name) - $($_.supportedGenerationMethods)" }
} catch {
    Write-Output "Error: $_"
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $body = $reader.ReadToEnd()
        Write-Output "Body: $body"
    }
}
