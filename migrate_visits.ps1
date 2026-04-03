$sql = Get-Content -Raw 'supabase_seed.sql'
$matches = [regex]::Matches($sql, "INSERT INTO visits \(date, count\) VALUES \('(.*?)', (.*?)\)")
$result = "date,count`r`n"
foreach ($match in $matches) {
    if ($match.Groups.Count -eq 3) {
        $result += $match.Groups[1].Value + "," + $match.Groups[2].Value + "`r`n"
    }
}
Set-Content -Path 'data/visits.csv' -Value $result -NoNewline
Write-Host "Migrated items to visits.csv"
