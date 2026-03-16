$inputPath = "data\products.csv"
$tempPath = "data\products_temp.csv"
$newRow = 'Magic Tap Wand,TLS-0226-137,Personal Accessories - Payment & Novelty Gadgets,Fairy Pay Collection,Fairies & Funny People,67,158*23*274,"This is a novelty payment accessory designed to bring a touch of magic to everyday transactions. Shaped like a charming star-tipped wand, it allows users to perform contactless payments by simply tapping the wand on any compatible credit or debit card reader. It''s an imaginative and fun alternative to traditional cards, perfect for those who enjoy whimsical gadgets and want to stand out. Compatible with any credit or debit card, it transforms the mundane act of paying into an enchanting experience, often seen trending on social media platforms like Instagram and TikTok for its unique appeal.",3.35,3.35,,,,,Magical Payment Wand: Tap Your Way to Enchanted Transactions,عصا الدفع السحرية,TRUE,FALSE,"Black, Beige",'

(Get-Content -Path $inputPath) | ForEach-Object {
    if ($_ -like "*,TLS-0226-137,*") {
        $newRow
    } else {
        $_
    }
} | Set-Content -Path $tempPath

Move-Item -Path $tempPath -Destination $inputPath -Force
Write-Host "Successfully updated products.csv"
