// International Shipping Logic

let shippingData = [];

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

    // Listen for language changes to update the dropdown labels
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.attributeName === 'lang') {
                populateCountryDropdown(true);
            }
        });
    });
    
    observer.observe(document.documentElement, { attributes: true });

    document.getElementById('shipping-country').addEventListener('change', (e) => {
        const countryIndex = e.target.value;
        if (countryIndex === "") {
            document.getElementById('shipping-result').classList.add('hidden');
            return;
        }

        const countryData = shippingData[countryIndex];
        if (countryData) {
            document.getElementById('fee-usd').textContent = `$${countryData['Delivery Cost in Dollar']}`;
            document.getElementById('fee-jod').textContent = `${countryData['Delivery Cost in JOD']} JOD`;
            document.getElementById('shipping-result').classList.remove('hidden');
        }
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
