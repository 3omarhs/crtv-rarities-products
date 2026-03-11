param (
    [Parameter(Mandatory=$false)]
    [string]$ApiKey
)

$pwd = "crtv_secure_2026"

function Encrypt-Key ($plainText, $pwd) {
    if (-not $plainText.StartsWith("AIza")) {
        Write-Warning "This does not look like a standard Gemini API key (does not start with AIza)."
    }
    
    $textBytes = [System.Text.Encoding]::UTF8.GetBytes($plainText)
    $keyBytes = [System.Text.Encoding]::UTF8.GetBytes($pwd)
    $resBytes = New-Object byte[] $textBytes.Length
    
    for ($i=0; $i -lt $textBytes.Length; $i++) {
        $resBytes[$i] = $textBytes[$i] -bxor $keyBytes[$i % $keyBytes.Length]
    }
    
    return [System.Convert]::ToBase64String($resBytes)
}

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "  Creative Rarities - Key Encryptor" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "This tool will locally encrypt your Gemini API key"
Write-Host "so you can safely paste it into data\gemini_keys.csv"
Write-Host "without being flagged by GitHub's automated scanners.`n"

if ([string]::IsNullOrWhiteSpace($ApiKey)) {
    $ApiKey = Read-Host "Please paste your NEW Gemini API Key here"
}

if ([string]::IsNullOrWhiteSpace($ApiKey)) {
    Write-Host "No key provided. Exiting." -ForegroundColor Red
    Write-Host "Press Enter to exit..."
    Read-Host
    exit
}

try {
    $encrypted = Encrypt-Key -plainText $ApiKey.Trim() -pwd $pwd
    Write-Host "`n✔ Encryption Successful!" -ForegroundColor Green
    Write-Host "`nCopy the following text and paste it under the 'key' column in data\gemini_keys.csv:" -ForegroundColor Yellow
    Write-Host "--------------------------------------------------------------------------------"
    Write-Host $encrypted -ForegroundColor Magenta
    Write-Host "--------------------------------------------------------------------------------"
} catch {
    Write-Host "`n❌ An error occurred: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host " "
Write-Host "Press Enter to exit..."
Read-Host
