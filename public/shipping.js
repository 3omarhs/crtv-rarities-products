// International Shipping & Item Pricing Logic

let shippingData = [];
let productsData = [];
let selectedCountryIndex = null;
let selectedProduct = null;

document.addEventListener('DOMContentLoaded', () => {
    initShipping();
});

async function initShipping() {
    try {
        const response = await fetch('https://raw.githubusercontent.com/3omarhs/crtv-rarities-products/main/data/international_shipping.csv?v=' + Date.now());
        if (!response.ok) throw new Error('Network response was not ok');
        const csvText = await response.text();
        
        Papa.parse(csvText, {
            header: true,
            skipEmptyLines: true,
            complete: function(results) {
                shippingData = results.data;
                populateCountryDropdown();
                calculateTotal();
            },
            error: function(error) {
                console.error("Error parsing shipping CSV:", error);
                document.getElementById('shipping-error').classList.remove('hidden');
            }
        });
    } catch (error) {
        console.error("Failed to load shipping data:", error);
        document.getElementById('shipping-error').classList.remove('hidden');
    }

    // Load products
    try {
        if (typeof fetchSheetData === 'function') {
            productsData = await fetchSheetData();
            renderProductTiles();
        } else {
            console.error("fetchSheetData is not available.");
        }
    } catch (error) {
        console.error("Failed to load products:", error);
    }

    // Listen for language changes to update the dropdown labels and product names
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.attributeName === 'lang') {
                populateCountryDropdown(true);
                renderProductTiles(); // Re-render to translate names
            }
        });
    });
    
    observer.observe(document.documentElement, { attributes: true });

    document.getElementById('shipping-country').addEventListener('change', (e) => {
        selectedCountryIndex = e.target.value;
        if (selectedCountryIndex === "") {
            document.getElementById('shipping-result').classList.add('hidden');
        } else {
            const countryData = shippingData[selectedCountryIndex];
            if (countryData) {
                document.getElementById('fee-usd').textContent = `$${countryData['Delivery Cost in Dollar']}`;
                document.getElementById('fee-jod').textContent = `${countryData['Delivery Cost in JOD']} JOD`;
                document.getElementById('shipping-result').classList.remove('hidden');
            }
        }
        calculateTotal();
    });
}

function populateCountryDropdown(preserveSelection = false) {
    const select = document.getElementById('shipping-country');
    const currentLang = document.documentElement.lang || 'en';
    const currentValue = select.value;
    
    const defaultText = currentLang === 'ar' ? '-- اختر الدولة --' : '-- Choose Country --';
    
    let html = `<option value="">${defaultText}</option>`;
    
    // Sort data based on current language
    const sortedIndices = shippingData.map((data, index) => ({ index, data })).sort((a, b) => {
        const nameA = currentLang === 'ar' ? a.data['Country in Arabic'] : a.data['Country in English'];
        const nameB = currentLang === 'ar' ? b.data['Country in Arabic'] : b.data['Country in English'];
        return String(nameA).localeCompare(String(nameB));
    });

    sortedIndices.forEach(({ index, data }) => {
        const name = currentLang === 'ar' ? data['Country in Arabic'] : data['Country in English'];
        html += `<option value="${index}">${name}</option>`;
    });

    select.innerHTML = html;
    
    if (preserveSelection && currentValue !== "") {
        select.value = currentValue;
    }
}

function renderProductTiles() {
    const grid = document.getElementById('item-selector-grid');
    if (!grid) return;
    
    const currentLang = document.documentElement.lang || 'en';
    let html = '';

    productsData.forEach(product => {
        const no = product['No'] || product['no'] || product['Item Number'];
        const hidden = product['Hidden'] || product['hidden'];
        
        // Skip hidden or invalid products
        if (!product || !no || String(hidden).toUpperCase() === 'TRUE' || String(hidden).toUpperCase() === 'YES') return;

        const arabicName = product['Arabic Name'] || product['arabicName'];
        const engName = product['Name on Store'] || product['Product Name'] || product['name'];
        const name = currentLang === 'ar' && arabicName ? arabicName : engName;
        
        // Extract base image logic from app.js
        let imgUrl = 'baseImage.png';
        const images = product['Image'] || product['image'] || product['Image Link'] || product['Gallery'];
        if (images) {
            let urls = String(images).split(/[\n,]/).filter(u => u.trim());
            if (urls.length > 0) {
                let firstUrl = urls[0].trim();
                let driveId = typeof extractDriveId === 'function' ? extractDriveId(firstUrl) : null;
                imgUrl = driveId ? `https://drive.google.com/thumbnail?id=${driveId}&sz=w200-h200` : firstUrl;
            }
        }

        const isSelected = selectedProduct && (selectedProduct['No'] || selectedProduct['no']) === no ? 'selected' : '';

        html += `
            <div class="product-tile ${isSelected}" data-id="${no}" onclick="selectProduct('${no}')">
                <img src="${imgUrl}" alt="${name}" class="product-tile-img" onerror="this.src='baseImage.png'">
                <div class="product-tile-name">${name}</div>
                <div class="product-tile-no">#${no}</div>
            </div>
        `;
    });

    grid.innerHTML = html;
}

window.selectProduct = function(productId) {
    selectedProduct = productsData.find(p => (p['No'] || p['no'] || p['Item Number']) === productId);
    
    // Update active class
    document.querySelectorAll('.product-tile').forEach(tile => {
        if (tile.dataset.id === productId) {
            tile.classList.add('selected');
        } else {
            tile.classList.remove('selected');
        }
    });

    calculateTotal();
};

function calculateTotal() {
    const resultContainer = document.getElementById('total-pricing-result');
    if (!resultContainer) return;

    if (selectedCountryIndex === null || selectedCountryIndex === "" || !selectedProduct) {
        resultContainer.classList.add('hidden');
        return;
    }

    const countryData = shippingData[selectedCountryIndex];
    if (!countryData) return;

    const priceRaw = selectedProduct['Price < 25 QTY'] || selectedProduct['Price'] || selectedProduct['price'] || "0";
    const itemPriceJod = parseFloat(String(priceRaw).replace(/[^\d.]/g, ''));
    if (isNaN(itemPriceJod)) return;

    const shippingJod = parseFloat(countryData['Delivery Cost in JOD']) || 0;
    const shippingUsd = parseFloat(countryData['Delivery Cost in Dollar']) || 0;

    const totalJod = itemPriceJod + shippingJod;
    const totalUsd = (itemPriceJod * EXCHANGE_RATE) + shippingUsd;

    document.getElementById('total-fee-jod').textContent = `${totalJod.toFixed(2)} JOD`;
    document.getElementById('total-fee-usd').textContent = `$${totalUsd.toFixed(2)}`;

    const breakdownEl = document.getElementById('price-breakdown');
    if (breakdownEl) {
        document.getElementById('item-solo-jod').textContent = `${itemPriceJod.toFixed(2)} JOD`;
        document.getElementById('item-solo-usd').textContent = `$${(itemPriceJod * EXCHANGE_RATE).toFixed(2)}`;
        document.getElementById('shipping-solo-jod').textContent = `${shippingJod.toFixed(2)} JOD`;
        document.getElementById('shipping-solo-usd').textContent = `$${shippingUsd.toFixed(2)}`;
    }

    resultContainer.classList.remove('hidden');
}
