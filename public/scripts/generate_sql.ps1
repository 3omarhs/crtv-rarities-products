$SqlOutputFile = "d:\GitHub\crtv-rarities-products\supabase_seed.sql"
$DataDir = "d:\GitHub\crtv-rarities-products\data"
$AdminFile = "d:\GitHub\crtv-rarities-products\public\adminCredentials.txt"

# Clear or Create SQL File
Out-File -FilePath $SqlOutputFile -InputObject "-- Supabase Initial Schema and Data Seed" -Encoding UTF8

# Function to escape SQL strings
function Escape-SqlString($val) {
    if ($null -eq $val) { return "NULL" }
    $str = $val.ToString().Replace("'", "''")
    return "'$str'"
}

$schemaSql = @"
CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    arabic_name TEXT, available TEXT, calc_val TEXT, category TEXT, collection TEXT,
    colors TEXT, description TEXT, dimensions TEXT, discount_cal TEXT, discount_percent TEXT,
    document_link TEXT, hidden TEXT, image_count TEXT, item_no TEXT, name TEXT,
    price_high_qty TEXT, price_low_qty TEXT, store_name TEXT, target_market TEXT, weight_calc TEXT
);

CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    address TEXT, currency TEXT, customerName TEXT, customerPhone TEXT, date TEXT,
    items TEXT, method TEXT, paymentMethod TEXT, selectedCompany TEXT, selectedRegion TEXT,
    status TEXT, timestamp TEXT, total TEXT
);

CREATE TABLE IF NOT EXISTS admins (
    username TEXT PRIMARY KEY,
    password TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS gemini_keys (
    key TEXT PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
);

CREATE TABLE IF NOT EXISTS visits (
    date TEXT PRIMARY KEY,
    count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS wholesale (
    id TEXT PRIMARY KEY,
    category TEXT, item_no TEXT, special_price TEXT, updated_at TEXT
);

CREATE TABLE IF NOT EXISTS visit_logs (
    id SERIAL PRIMARY KEY,
    date TEXT NOT NULL,
    device_name TEXT NOT NULL,
    timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
"@
Out-File -FilePath $SqlOutputFile -InputObject $schemaSql -Append -Encoding UTF8

# Parse Visits
$visitsFile = Join-Path $DataDir "visits.csv"
if (Test-Path $visitsFile) {
    $visits = Import-Csv $visitsFile
    foreach ($row in $visits) {
        $date = Escape-SqlString $row.date
        $count = if ([string]::IsNullOrWhiteSpace($row.count)) { 0 } else { $row.count }
        $sql = "INSERT INTO visits (date, count) VALUES ($date, $count) ON CONFLICT (date) DO UPDATE SET count = EXCLUDED.count;"
        Out-File -FilePath $SqlOutputFile -InputObject $sql -Append -Encoding UTF8
    }
}

# Parse Gemini Keys
$geminiFile = Join-Path $DataDir "gemini_keys.csv"
if (Test-Path $geminiFile) {
    $keys = Import-Csv $geminiFile
    foreach ($row in $keys) {
        $k = Escape-SqlString $row.key
        $sql = "INSERT INTO gemini_keys (key) VALUES ($k) ON CONFLICT (key) DO NOTHING;"
        Out-File -FilePath $SqlOutputFile -InputObject $sql -Append -Encoding UTF8
    }
}

# Parse Settings
$settingsFile = Join-Path $DataDir "settings.csv"
if (Test-Path $settingsFile) {
    $settings = Import-Csv $settingsFile
    foreach ($row in $settings) {
        if (![string]::IsNullOrWhiteSpace($row.key) -and !$row.key.StartsWith("#")) {
            $k = Escape-SqlString $row.key
            $v = Escape-SqlString $row.value
            $sql = "INSERT INTO settings (key, value) VALUES ($k, $v) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;"
            Out-File -FilePath $SqlOutputFile -InputObject $sql -Append -Encoding UTF8
        }
    }
}

# Parse Wholesale
$wholesaleFile = Join-Path $DataDir "wholesale.csv"
if (Test-Path $wholesaleFile) {
    $wholesale = Import-Csv $wholesaleFile
    $wCount = 0
    foreach ($row in $wholesale) {
        $wCount++
        $id = if ([string]::IsNullOrWhiteSpace($row.id)) { Escape-SqlString "ws_fb_$wCount" } else { Escape-SqlString $row.id }
        $cat = Escape-SqlString $row.category
        $item = Escape-SqlString $row.item_no
        $price = Escape-SqlString $row.special_price
        $updated = Escape-SqlString $row.updated_at
        $sql = "INSERT INTO wholesale (id, category, item_no, special_price, updated_at) VALUES ($id, $cat, $item, $price, $updated) ON CONFLICT (id) DO UPDATE SET category = EXCLUDED.category, special_price=EXCLUDED.special_price;"
        Out-File -FilePath $SqlOutputFile -InputObject $sql -Append -Encoding UTF8
    }
}

# Parse Admins
$AdminFile = Join-Path $DataDir "..\public\adminCredentials.txt"
if (Test-Path $AdminFile) {
    $lines = Get-Content $AdminFile
    for ($i=0; $i -lt $lines.Length; $i+=2) {
        if ($lines[$i] -match "Username:\s*(.*)") {
            $user = Escape-SqlString $matches[1]
            if ($lines[$i+1] -match "Password:\s*(.*)") {
                $pass = Escape-SqlString $matches[1]
                $sql = "INSERT INTO admins (username, password) VALUES ($user, $pass) ON CONFLICT (username) DO UPDATE SET password = EXCLUDED.password;"
                Out-File -FilePath $SqlOutputFile -InputObject $sql -Append -Encoding UTF8
            }
        }
    }
}

# Parse Products
$productsFile = Join-Path $DataDir "products.csv"
if (Test-Path $productsFile) {
    $products = Import-Csv $productsFile
    $pCount = 0
    foreach ($row in $products) {
        $pCount++
        $id = if ([string]::IsNullOrWhiteSpace($row.id)) { Escape-SqlString "p_fb_$pCount" } else { Escape-SqlString $row.id }
        $arabic_name = Escape-SqlString $row.arabic_name
        $available = Escape-SqlString $row.available
        $calc_val = Escape-SqlString $row.calc_val
        $category = Escape-SqlString $row.category
        $collection = Escape-SqlString $row.collection
        $colors = Escape-SqlString $row.colors
        $description = Escape-SqlString $row.description
        $dimensions = Escape-SqlString $row.dimensions
        $discount_cal = Escape-SqlString $row.discount_cal
        $discount_percent = Escape-SqlString $row.discount_percent
        $document_link = Escape-SqlString $row.document_link
        $hidden = Escape-SqlString $row.hidden
        $image_count = Escape-SqlString $row.image_count
        $item_no = Escape-SqlString $row.item_no
        $name = Escape-SqlString $row.name
        $price_high_qty = Escape-SqlString $row.price_high_qty
        $price_low_qty = Escape-SqlString $row.price_low_qty
        $store_name = Escape-SqlString $row.store_name
        $target_market = Escape-SqlString $row.target_market
        $weight_calc = Escape-SqlString $row.weight_calc
        
        $sql = "INSERT INTO products (id, arabic_name, available, calc_val, category, collection, colors, description, dimensions, discount_cal, discount_percent, document_link, hidden, image_count, item_no, name, price_high_qty, price_low_qty, store_name, target_market, weight_calc) VALUES ($id, $arabic_name, $available, $calc_val, $category, $collection, $colors, $description, $dimensions, $discount_cal, $discount_percent, $document_link, $hidden, $image_count, $item_no, $name, $price_high_qty, $price_low_qty, $store_name, $target_market, $weight_calc) ON CONFLICT (id) DO NOTHING;"
        Out-File -FilePath $SqlOutputFile -InputObject $sql -Append -Encoding UTF8
    }
}

# Parse Orders
$ordersFile = Join-Path $DataDir "orders.csv"
if (Test-Path $ordersFile) {
    try {
        $orders = Import-Csv $ordersFile
        $oCount = 0
        foreach ($row in $orders) {
            $oCount++
            $id = if ([string]::IsNullOrWhiteSpace($row.id)) { Escape-SqlString "o_fb_$oCount" } else { Escape-SqlString $row.id }
            $address = Escape-SqlString $row.address
            $currency = Escape-SqlString $row.currency
            $customerName = Escape-SqlString $row.customerName
            $customerPhone = Escape-SqlString $row.customerPhone
            $date = Escape-SqlString $row.date
            $items = Escape-SqlString $row.items
            $method = Escape-SqlString $row.method
            $paymentMethod = Escape-SqlString $row.paymentMethod
            $selectedCompany = Escape-SqlString $row.selectedCompany
            $selectedRegion = Escape-SqlString $row.selectedRegion
            $status = Escape-SqlString $row.status
            $timestamp = Escape-SqlString $row.timestamp
            $total = Escape-SqlString $row.total
            
            $sql = "INSERT INTO orders (id, address, currency, customerName, customerPhone, date, items, method, paymentMethod, selectedCompany, selectedRegion, status, timestamp, total) VALUES ($id, $address, $currency, $customerName, $customerPhone, $date, $items, $method, $paymentMethod, $selectedCompany, $selectedRegion, $status, $timestamp, $total) ON CONFLICT (id) DO NOTHING;"
            Out-File -FilePath $SqlOutputFile -InputObject $sql -Append -Encoding UTF8
        }
    } catch {
        Write-Warning "Failed parsing orders.csv"
    }
}

Write-Output "SQL Generation Script Finished."
