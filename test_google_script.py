
import requests
import json

GAS_URL = "https://script.google.com/macros/s/AKfycbwsSCDrdo5u_4ljm526VmYobHj1PXmfnVKRy7lzNjgVpmNDCJvoRnTmQSA1YM3y9bcV/exec"

payload = {
    'action': 'addProduct',
    'No': 'TEST-DEBUG-FULL-002',
    'product name': 'Debug Full Product V2',
    'Name on Store': 'Debug Store Full',
    'Price < 25 QTY': '5.00',
    'Price >=25 QTY': '4.50',
    'Calculate on Weight': '200',
    'target market': 'Debug Market',
    'category': 'Test Category',
    'collection': 'Test Collection',
    'description (80 word)': 'Full debug description.',
    'Dimensions(mm) x y z': '20x20x20',
    'Arabic Name': 'اسم تجريبي',
    'Colors': 'Red, Blue',
    'Discount %': '10',
    'Document Link': 'http://example.com',
    'available': 'TRUE'
}

print(f"Sending payload to {GAS_URL}...")
print(json.dumps(payload, indent=2))

try:
    response = requests.post(GAS_URL, json=payload, allow_redirects=True)
    print(f"Status Code: {response.status_code}")
    print(f"Response URL: {response.url}")
    print(f"Response Text: {response.text}")
except Exception as e:
    print(f"Error: {e}")
