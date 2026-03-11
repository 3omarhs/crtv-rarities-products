$key = 'AIzaSyDNDCb82ygt8XBSZWAdJUP672T6-MtYWbs'
$pwd = 'crtv_secure_2026'
$keyBytes = [System.Text.Encoding]::UTF8.GetBytes($key)
$pwdBytes = [System.Text.Encoding]::UTF8.GetBytes($pwd)
$resBytes = New-Object byte[] $keyBytes.Length
for ($i=0; $i -lt $keyBytes.Length; $i++) {
    $resBytes[$i] = $keyBytes[$i] -bxor $pwdBytes[$i % $pwdBytes.Length]
}
$encoded = [System.Convert]::ToBase64String($resBytes)
Write-Output $encoded
