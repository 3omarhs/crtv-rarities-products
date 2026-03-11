// Checkout System Logic
// Handles the multi-step modal, delivery calculation, and WhatsApp submission

let checkoutState = {
    step: 1,
    cartTotal: 0,
    deliveryCost: 0,
    deliveryMethod: 'delivery', // 'pickup' or 'delivery'
    selectedRegion: '',
    selectedCompany: '',
    customerName: '',
    customerPhone: '',
    customerEmail: '',
    address: '',
    deliveryData: []
};

// Custom parser for the specific format of deliveryCompaniesDetails.txt
// It handles repeated "Name" keys by grouping them into objects
function parseDeliveryDetails(text) {
    const lines = text.split(/\r?\n/);
    const companies = [];
    let currentCompany = null;
    let parsingRegions = false;

    lines.forEach(line => {
        const cleanLine = line.trim().replace(/,$/, ''); // Remove trailing commas

        if (cleanLine.includes('"Name":')) {
            // Start of a new company
            if (currentCompany) {
                companies.push(currentCompany);
            }
            const name = cleanLine.split(':')[1].trim().replace(/"/g, '');
            currentCompany = { name: name, regions: {} };
            parsingRegions = false;
        } else if (cleanLine.includes('Regions:{')) {
            parsingRegions = true;
        } else if (cleanLine.includes('}') && parsingRegions) {
            parsingRegions = false; // End of regions block
        } else if (parsingRegions && cleanLine.includes(':')) {
            // Parse "Region": Cost
            const parts = cleanLine.split(':');
            const region = parts[0].trim().replace(/"/g, '');
            const cost = parseFloat(parts[1].trim());
            if (currentCompany && !isNaN(cost)) {
                currentCompany.regions[region] = cost;
            }
        }
    });

    // Push the last one
    if (currentCompany) {
        companies.push(currentCompany);
    }

    return companies;
}

async function initCheckout() {
    try {
        const response = await fetch('deliveryCompanies.json?v=' + Date.now());
        if (!response.ok) throw new Error("Failed to load delivery details");
        const companies = await response.json();

        // Transform JSON structure to match what the rest of the code expects if needed
        // The existing code expects an array of objects with { name: "Name", regions: { "Region": Cost } }
        // deliveryCompanies.json seems to have { "Name": "...", "Regions": { ... } } (Capitalized keys)

        checkoutState.deliveryData = companies.map(c => ({
            name: c.Name,
            regions: c.Regions
        }));

        console.log("Checkout: Loaded delivery details", checkoutState.deliveryData);
    } catch (e) {
        console.warn("Checkout: Could not load delivery details. Defaulting to standard delivery.", e);
    }

    // Attach event listeners to inputs
    const nameInput = document.getElementById('cx-name');
    if (nameInput) nameInput.addEventListener('input', validateStep1);

    const phoneInput = document.getElementById('cx-phone');
    if (phoneInput) {
        // Prevent typing non-digits
        phoneInput.addEventListener('keydown', function (e) {
            // Allow: backspace, delete, tab, escape, enter and .
            if ([46, 8, 9, 27, 13, 110, 190].indexOf(e.keyCode) !== -1 ||
                // Allow: Ctrl+A, Ctrl+C, Ctrl+V, Ctrl+X
                (e.ctrlKey === true || e.metaKey === true)) {
                return;
            }
            // Ensure that it is a number and stop the keypress
            if ((e.shiftKey || (e.keyCode < 48 || e.keyCode > 57)) && (e.keyCode < 96 || e.keyCode > 105)) {
                e.preventDefault();
            }
        });

        // Sanitize on input (paste, etc)
        phoneInput.addEventListener('input', function () {
            this.value = this.value.replace(/\D/g, '');
            // Enforce max length manually just in case
            if (this.value.length > 9) {
                this.value = this.value.slice(0, 9);
            }
            validateStep1();
        });
    }

    // Initial language apply if app loaded first
    if (window.updateCheckoutLanguage) window.updateCheckoutLanguage();

    // Auto-init for standalone page
    if (window.location.pathname.includes('checkout.html')) {
        // Imitate opening the modal to set initial state
        openCheckoutModal();
    }
}

function updateCheckoutLanguage() {
    const lang = localStorage.getItem('cr_lang') || 'en';
    const t = (window.translations && window.translations[lang]) ? window.translations[lang] : null;

    if (!t) return;

    const setT = (sel, text) => {
        const el = document.querySelector(sel);
        if (el) el.textContent = text;
    };
    const setP = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.placeholder = text;
    };

    setT('.checkout-title', t.checkoutTitle);
    setT('[data-step="1"]', t.step1);
    setT('[data-step="2"]', t.step2);
    setT('[data-step="3"]', t.step3);

    setT('#checkout-step-1 h4', t.contactInfo);
    setT('label[for="cx-name"]', t.fullName);
    setP('cx-name', t.enterName);
    setT('label[for="cx-phone"]', t.phoneNumber);

    const emailLabel = document.querySelector('label[for="cx-email"]');
    if (emailLabel) emailLabel.innerHTML = `${t.emailAddr} <span style="font-size: 0.8rem; font-weight: 400; color: var(--text-secondary);">${t.optional}</span>`;

    setT('.whatsapp-direct-btn', t.waOrderBtn);

    setT('#checkout-step-2 h4', t.deliveryMethod);
    setT('label[for="delivery-method-select"]', t.chooseMethod);

    const methodSelect = document.getElementById('delivery-method-select');
    if (methodSelect && methodSelect.options.length >= 2) {
        methodSelect.options[0].text = t.methodDelivery;
        methodSelect.options[1].text = t.methodPickup;
    }

    setT('#pickup-label', t.pickupLocationLabel);
    setT('#pickup-address', t.pickupAddress);

    setT('label[for="cx-region"]', t.selectRegion);
    const regionSelect = document.getElementById('cx-region');
    if (regionSelect && regionSelect.options.length > 0) {
        regionSelect.options[0].text = t.chooseRegion;
    }
    // Re-populate regions to apply translation
    populateRegions();

    setT('label[for="cx-company"]', t.selectCompany);
    const companySelect = document.getElementById('cx-company');
    if (companySelect && companySelect.options.length > 0 && companySelect.value === "") {
        companySelect.options[0].text = t.chooseCompany;
    }

    setT('label[for="cx-address"]', t.detailedAddress);
    setP('cx-address', t.enterAddress);

    setT('#checkout-step-3 h4', t.orderSummary);
    setT('#payment-method-header', t.paymentLabel || "Payment Method");

    // Safely update summary labels which are siblings to the value spans
    const sub = document.getElementById('summary-subtotal');
    if (sub && sub.previousElementSibling) sub.previousElementSibling.textContent = t.subtotal;

    const del = document.getElementById('summary-delivery');
    if (del && del.previousElementSibling) del.previousElementSibling.textContent = t.delivery;

    const tot = document.getElementById('summary-total');
    if (tot && tot.previousElementSibling) tot.previousElementSibling.textContent = t.total;

    setT('#checkout-back-btn', t.back);
    setT('#checkout-next-btn', t.next);
    setT('#checkout-submit-btn', t.placeOrder);

    if (checkoutState.step === 3) {
        renderSummary();
    }

    // Ensure initial payment labels match default delivery method
    selectDeliveryMethod(checkoutState.deliveryMethod);
}

// Open the modal and reset state (Legacy/Modal Mode) - modified for Redirect
function openCheckoutModal() {
    // If we are on the main page, redirect to checkout.html
    if (!window.location.pathname.includes('checkout.html')) {
        window.location.href = 'checkout.html';
        return;
    }

    if (cart.length === 0) {
        showError("Your cart is empty!");
        return;
    }

    // On standalone page, we just ensure state is ready
    const modal = document.getElementById('checkout-modal');
    if (modal) modal.classList.add('open'); // Only if modal exists

    // Reset State
    checkoutState.step = 1;
    checkoutState.deliveryMethod = 'delivery';
    checkoutState.deliveryCost = 0;

    // reset dropdown if exists
    const methodSelect = document.getElementById('delivery-method-select');
    if (methodSelect) {
        methodSelect.value = 'delivery';
        // Force trigger change to ensure UI updates
        selectDeliveryMethod('delivery');
    }

    // Ensure regions are populated
    populateRegions();
    const details = document.getElementById('delivery-details');
    if (details) details.classList.remove('hidden');

    // Reset UI
    document.querySelectorAll('.checkout-step').forEach(el => el.classList.add('hidden'));
    const step1 = document.getElementById('checkout-step-1');
    if (step1) {
        step1.classList.remove('hidden');
        step1.classList.add('active');
    }

    updateStepIndicator(1);

    // Ensure language is correct when opening
    if (window.updateCheckoutLanguage) window.updateCheckoutLanguage();

    updateButtons();

    // Calculate initial cart total from app.js variable 'cart'
    updateCheckoutCalculations();
}

function closeCheckout() {
    // If independent page, go back
    if (window.location.pathname.includes('checkout.html')) {
        window.location.href = 'index.html';
    } else {
        const modal = document.getElementById('checkout-modal');
        if (modal) modal.classList.remove('open');
    }
}

function updateStepIndicator(step) {
    document.querySelectorAll('.checkout-progress .step').forEach(el => {
        const s = parseInt(el.dataset.step);
        el.classList.remove('active', 'completed');
        if (s === step) el.classList.add('active');
        if (s < step) el.classList.add('completed');
    });
}

function updateButtons() {
    const backBtn = document.getElementById('checkout-back-btn');
    const nextBtn = document.getElementById('checkout-next-btn');
    const submitBtn = document.getElementById('checkout-submit-btn');

    if (checkoutState.step === 1) {
        backBtn.classList.add('hidden');
        nextBtn.classList.remove('hidden');
        submitBtn.classList.add('hidden');
    } else if (checkoutState.step === 2) {
        backBtn.classList.remove('hidden');
        nextBtn.classList.remove('hidden');
        submitBtn.classList.add('hidden');
    } else if (checkoutState.step === 3) {
        backBtn.classList.remove('hidden');
        nextBtn.classList.add('hidden');
        submitBtn.classList.remove('hidden');
    }
}

function validateStep1() {
    const name = document.getElementById('cx-name').value.trim();
    const phone = document.getElementById('cx-phone').value.trim();

    // Check name length
    const isNameValid = name.length > 2;

    // Check phone: digits only, max 9 chars
    const phoneDigits = phone.replace(/\D/g, '');
    const isPhoneValid = phoneDigits.length === 9;

    const isValid = isNameValid && isPhoneValid;
    return isValid;
}

function validateStep2() {
    if (checkoutState.deliveryMethod === 'pickup') return true;
    if (checkoutState.deliveryMethod === 'delivery') {
        const region = document.getElementById('cx-region').value;
        const company = document.getElementById('cx-company').value;
        const address = document.getElementById('cx-address').value.trim();
        // require region AND company AND address
        if (!region || !company || !address) return false;
        return true;
    }
    return false;
}

function checkoutNext() {
    if (checkoutState.step === 1) {
        if (!validateStep1()) {
            const lang = localStorage.getItem('cr_lang') || 'en';
            const t = window.translations ? window.translations[lang] : { valNamePhone: "Please enter a valid name and phone number." };
            alert(t.valNamePhone);
            return;
        }
        // Save info
        checkoutState.customerName = document.getElementById('cx-name').value.trim();
        checkoutState.customerPhone = document.getElementById('cx-phone').value.trim();
        checkoutState.customerEmail = document.getElementById('cx-email').value.trim();

        checkoutState.step = 2;
    } else if (checkoutState.step === 2) {
        if (!validateStep2()) {
            const lang = localStorage.getItem('cr_lang') || 'en';
            const t = window.translations ? window.translations[lang] : { valRegionCompany: "Please select a region, delivery company, and enter your address." };
            // Custom message if address is missing but others are present
            const region = document.getElementById('cx-region').value;
            const company = document.getElementById('cx-company').value;
            const address = document.getElementById('cx-address').value.trim();

            if (region && company && !address) {
                alert(t.valAddress || "Please enter your detailed address.");
            } else {
                alert(t.valRegionCompany);
            }
            return;
        }
        // Save Address
        if (checkoutState.deliveryMethod === 'delivery') {
            checkoutState.address = document.getElementById('cx-address').value.trim();
        } else {
            checkoutState.address = '';
        }

        // Save Payment Method
        const selectedPm = document.querySelector('input[name="payment-method"]:checked');
        checkoutState.paymentMethod = selectedPm ? selectedPm.value : 'Cash on delivery';

        // Prepare Step 3 (Review)
        renderSummary();
        checkoutState.step = 3;
    } else {
        return;
    }

    // UI Updates
    document.querySelectorAll('.checkout-step').forEach(el => {
        el.classList.add('hidden');
        el.classList.remove('active');
    });
    const currentStepEl = document.getElementById(`checkout-step-${checkoutState.step}`);
    currentStepEl.classList.remove('hidden');
    currentStepEl.classList.add('active');

    updateStepIndicator(checkoutState.step);
    updateButtons();
}

function checkoutBack() {
    if (checkoutState.step > 1) {
        checkoutState.step--;
        document.querySelectorAll('.checkout-step').forEach(el => {
            el.classList.add('hidden');
            el.classList.remove('active');
        });
        const currentStepEl = document.getElementById(`checkout-step-${checkoutState.step}`);
        currentStepEl.classList.remove('hidden');
        currentStepEl.classList.add('active');

        updateStepIndicator(checkoutState.step);
        updateButtons();
    }
}

function selectDeliveryMethod(method) {
    checkoutState.deliveryMethod = method;

    const lang = localStorage.getItem('cr_lang') || 'en';
    const t = (window.translations && window.translations[lang]) ? window.translations[lang] : {
        paymentCash: "Cash",
        paymentCliQ: "CliQ payment",
        paymentEWallet: "E-Wallets",
        paymentCashDelivery: "Cash on delivery",
        paymentCliQDelivery: "CliQ payment on delivery",
        paymentEWalletDelivery: "E-Wallets on delivery"
    };

    const pmCash = document.getElementById('pm-cash');
    const pmCliq = document.getElementById('pm-cliq');
    const pmEwallet = document.getElementById('pm-ewallet');

    if (method === 'pickup') {
        const deliveryDetails = document.getElementById('delivery-details');
        const pickupDetails = document.getElementById('pickup-details');

        if (deliveryDetails) deliveryDetails.classList.add('hidden');
        if (pickupDetails) pickupDetails.classList.remove('hidden');
        checkoutState.deliveryCost = 0;

        // Update Payment Labels for Pickup
        if (pmCash) pmCash.textContent = t.paymentCash;
        if (pmCliq) pmCliq.textContent = t.paymentCliQ;
        if (pmEwallet) pmEwallet.textContent = t.paymentEWallet;

    } else {
        const deliveryDetails = document.getElementById('delivery-details');
        const pickupDetails = document.getElementById('pickup-details');

        if (deliveryDetails) deliveryDetails.classList.remove('hidden');
        if (pickupDetails) pickupDetails.classList.add('hidden');

        // Update Payment Labels for Delivery
        const pmCash = document.getElementById('pm-cash');
        const pmCliq = document.getElementById('pm-cliq');
        const pmEwallet = document.getElementById('pm-ewallet');

        if (pmCash) pmCash.textContent = t.paymentCashDelivery;
        if (pmCliq) pmCliq.textContent = t.paymentCliQDelivery;
        if (pmEwallet) pmEwallet.textContent = t.paymentEWalletDelivery;

        // Populate Regions if empty
        const regionSelect = document.getElementById('cx-region');
        if (regionSelect.options.length <= 1) {
            populateRegions();
        }
    }
    updateCheckoutCalculations();
}

function populateRegions() {
    const regionSelect = document.getElementById('cx-region');
    // Extract unique regions from all companies
    const allRegions = new Set();
    checkoutState.deliveryData.forEach(comp => {
        Object.keys(comp.regions).forEach(r => allRegions.add(r));
    });

    const currentVal = regionSelect.value;

    // Clear old options (except first)
    while (regionSelect.options.length > 1) {
        regionSelect.remove(1);
    }

    Array.from(allRegions).sort((a, b) => {
        if (a === 'Amman') return -1;
        if (b === 'Amman') return 1;
        return a.localeCompare(b);
    }).forEach(r => {
        const opt = document.createElement('option');
        opt.value = r;
        opt.textContent = window.translateValue ? window.translateValue('region', r) : r;
        regionSelect.appendChild(opt);
    });

    // Restore selection
    if (currentVal && Array.from(allRegions).includes(currentVal)) {
        regionSelect.value = currentVal;
    }
}

function updateDeliveryCompanies() {
    const region = document.getElementById('cx-region').value;
    const selectEl = document.getElementById('cx-company');

    const lang = localStorage.getItem('cr_lang') || 'en';
    const t = (window.translations && window.translations[lang]) ? window.translations[lang] : {
        chooseCompany: "-- Choose Company --",
        noPartners: "No delivery partners available"
    };

    // Clear and reset
    selectEl.innerHTML = `<option value="">${t.chooseCompany}</option>`;
    checkoutState.selectedRegion = region;
    checkoutState.selectedCompany = '';
    checkoutState.deliveryCost = 0;

    if (!region) return;

    // Find companies that serve this region
    const available = checkoutState.deliveryData.filter(c => c.regions[region] !== undefined);

    if (available.length === 0) {
        const opt = document.createElement('option');
        opt.textContent = t.noPartners;
        opt.disabled = true;
        selectEl.appendChild(opt);
        return;
    }

    available.forEach((comp, index) => {
        const cost = comp.regions[region];
        const opt = document.createElement('option');
        // Store cost in value or handle by lookup. 
        // Simple way: value="Name|Cost"
        opt.value = `${comp.name}|${cost}`;
        opt.textContent = `${comp.name} - ${window.formatPrice ? window.formatPrice(cost) : cost.toFixed(3) + ' JOD'}`;
        selectEl.appendChild(opt);

        // Auto select first one? User said "Choosing... then company", implying manual choice.
        // But maybe auto-select is fine. Let's NOT auto-select to force user choice as per "Choosing"
        // OR better UX: Select first one. 
        // Let's stick to manual selection to match "Choosing"
    });

    // If we wanted auto-select:
    // if (available.length > 0) {
    //    selectEl.selectedIndex = 1;
    //    selectCompanyFromDropdown(selectEl.value);
    // }
}

function selectCompanyFromDropdown(value) {
    if (!value) {
        checkoutState.selectedCompany = '';
        checkoutState.deliveryCost = 0;
    } else {
        const [name, costStr] = value.split('|');
        checkoutState.selectedCompany = name;
        checkoutState.deliveryCost = parseFloat(costStr);
    }
    updateCheckoutCalculations();
}

// Helper to get effective price
function getEffectivePrice(item, productQuantities) {
    const totalQty = productQuantities[item.no] || 0;
    const isWholesale = totalQty >= 10;
    const priceString = isWholesale && item.bulkPrice ? item.bulkPrice : item.price;

    // Safety check
    if (priceString === undefined || priceString === null) return 0;

    // If already number
    if (typeof priceString === 'number') return priceString;

    // If string, clean it
    // Handle cases like "12.500 JOD", "JD 12.5", "12,500"
    let cleanString = String(priceString).replace(/[^\d.]/g, '');
    // If multiple dots, keep only the first one (simple heuristic)
    if ((cleanString.match(/\./g) || []).length > 1) {
        // logic to handle multiple dots if necessary, but usually standard replace works for simple currency
    }
    // Return float with high precision, formatting happens at display time
    return parseFloat(cleanString) || 0;
}

function updateCheckoutCalculations() {
    // Recalculate cart total using global 'cart' logic
    let total = 0;

    // First calculate product quantities to determine pricing (bulk vs retail)
    const productQuantities = {};
    if (typeof cart !== 'undefined' && Array.isArray(cart)) {
        cart.forEach(item => {
            productQuantities[item.no] = (productQuantities[item.no] || 0) + item.quantity;
        });

        cart.forEach(item => {
            const price = getEffectivePrice(item, productQuantities);
            total += price * item.quantity;
        });
    }

    checkoutState.cartTotal = total;
    console.log("Checkout: Cart Total Calculated:", total);
}


function renderSummary() {
    const subtotalEl = document.getElementById('summary-subtotal');
    const deliveryEl = document.getElementById('summary-delivery');
    const totalEl = document.getElementById('summary-total');
    const nameEl = document.getElementById('summary-name');
    const phoneEl = document.getElementById('summary-phone');
    const methodEl = document.getElementById('summary-method');
    const paymentEl = document.getElementById('summary-payment');

    // Calculations
    const total = checkoutState.cartTotal + checkoutState.deliveryCost;

    subtotalEl.textContent = formatPrice(checkoutState.cartTotal);
    deliveryEl.textContent = formatPrice(checkoutState.deliveryCost);
    totalEl.textContent = formatPrice(total);

    const lang = localStorage.getItem('cr_lang') || 'en';
    const t = (window.translations && window.translations[lang]) ? window.translations[lang] : {
        methodSummaryPickup: "Method: Pick from the representative",
        methodSummaryDelivery: "Method: Delivery to {region} ({company})",
        nameSummary: "Name: {name}",
        phoneSummary: "Phone: +962 {phone}"
    };

    nameEl.textContent = t.nameSummary.replace('{name}', checkoutState.customerName);
    phoneEl.textContent = t.phoneSummary.replace('{phone}', checkoutState.customerPhone);

    if (checkoutState.deliveryMethod === 'pickup') {
        methodEl.innerHTML = t.methodSummaryPickup + `<br><span style="font-size:0.9em;color:grey">${t.pickupAddress || "Amman, Al-Hurriya Street, opposite the Department of Lands south of Amman"}</span>`;
    } else {
        methodEl.innerHTML = t.methodSummaryDelivery
            .replace('{region}', checkoutState.selectedRegion)
            .replace('{company}', checkoutState.selectedCompany) + `<br><span style="font-size:0.9em;color:grey">${checkoutState.address}</span>`;
    }

    if (paymentEl) {
        // Map the stored English value to the current language translation
        const paymentMap = {
            "Cash": t.paymentCash,
            "Cash on delivery": t.paymentCashDelivery,
            "CliQ payment": t.paymentCliQ,
            "CliQ payment on delivery": t.paymentCliQDelivery,
            "E-Wallets": t.paymentEWallet,
            "E-Wallets on delivery": t.paymentEWalletDelivery
        };
        const displayPayment = paymentMap[checkoutState.paymentMethod] || checkoutState.paymentMethod;
        paymentEl.textContent = (t.paymentLabel || "Payment:") + " " + displayPayment;
    }
}

// Initialize EmailJS
(function () {
    if (window.emailjs) {
        emailjs.init("ReYs8I_wiUao8xZ03"); // PLEASE REPLACE WITH YOUR ACTUAL PUBLIC KEY
    }
})();

let isSubmitting = false;

function submitOrder() {
    if (isSubmitting) return;
    isSubmitting = true;

    const submitBtn = document.getElementById('checkout-submit-btn');

    // UI Loading State
    const originalText = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span class="spinner-sm" style="width: 20px; height: 20px; border: 2px solid white; border-top-color: transparent; border-radius: 50%; display: inline-block; animation: spin 1s linear infinite; margin-right: 8px;"></span> Sending...`;

    // Calculate effective prices for order details
    const productQuantities = {};
    if (typeof cart !== 'undefined' && Array.isArray(cart)) {
        cart.forEach(item => {
            productQuantities[item.no] = (productQuantities[item.no] || 0) + item.quantity;
        });
    }

    // Prepare Data
    const orderDetails = cart.map((item, index) => {
        const effectivePrice = getEffectivePrice(item, productQuantities);
        // Requested format: Item No. then Color then Price and last thing the item name
        return `${index + 1}. [${item.no}] (${item.color || 'Default'}) - ${formatPrice(effectivePrice)} - ${item.name} (Qty: ${item.quantity})`;
    }).join('\\n');

    const deliveryCostFormatted = formatPrice(checkoutState.deliveryCost);
    const grandTotalFormatted = formatPrice(checkoutState.cartTotal + checkoutState.deliveryCost);

    // Combine delivery and total for the email field
    const totalDisplay = `Delivery: ${deliveryCostFormatted}\\nTotal: ${grandTotalFormatted}`;

    const templateParams = {
        to_email: 'Omarhj13702@yahoo.com',
        from_name: checkoutState.customerName,
        from_phone: checkoutState.customerPhone,
        from_email: checkoutState.customerEmail || 'Not provided',
        delivery_method: checkoutState.deliveryMethod,
        region: checkoutState.selectedRegion || 'N/A',
        company: checkoutState.selectedCompany || 'N/A',
        order_details: orderDetails,
        total_price: totalDisplay + `\\nPayment: ${checkoutState.paymentMethod}`,
        address: checkoutState.deliveryMethod === 'delivery' ? `${checkoutState.selectedRegion}, ${checkoutState.selectedCompany}\\nDetails: ${checkoutState.address}` : 'Pickup'
    };

    // Send Email
    if (window.emailjs) {
        emailjs.send('service_96sxr19', 'template_CrtvRaritiesO_1', templateParams)
            .then(function () {
                // Success

                const newOrder = {
                    id: Date.now().toString(),
                    date: new Date().toISOString(),
                    customerName: checkoutState.customerName,
                    customerPhone: checkoutState.customerPhone,
                    items: cart.map((item, index) => {
                        const effectivePrice = getEffectivePrice(item, productQuantities);
                        return `${index + 1}. [${item.no}] (${item.color || 'Default'}) - ${formatPrice(effectivePrice)} - ${item.name} (Qty: ${item.quantity})`;
                    }),
                    total: grandTotalFormatted, // e.g. "12.500 JOD" or "$17.65"
                    method: checkoutState.deliveryMethod,
                    selectedRegion: checkoutState.selectedRegion || '',
                    selectedCompany: checkoutState.selectedCompany || '',
                    address: checkoutState.address || '',
                    deliveryCost: deliveryCostFormatted, // Now formatted (e.g. "2.000 JOD" or "$2.82")
                    currency: window.currentCurrency || 'JOD',
                    paymentMethod: checkoutState.paymentMethod
                };

                // --- SUPABASE & GITHUB PAGES PERSISTENCE VIA GAS ---
                const saveOrderData = async () => {
                    // 1. Save to Supabase (Primary)
                    try {
                        if (window.supabaseClient) {
                            console.log("Saving order to Supabase...");
                            const { error } = await window.supabaseClient
                                .from('orders')
                                .insert([{
                                    id: newOrder.id,
                                    address: newOrder.address,
                                    currency: newOrder.currency,
                                    customerName: newOrder.customerName,
                                    customerPhone: newOrder.customerPhone,
                                    date: newOrder.date,
                                    items: JSON.stringify(newOrder.items),
                                    method: newOrder.method,
                                    paymentMethod: newOrder.paymentMethod,
                                    selectedCompany: newOrder.selectedCompany,
                                    selectedRegion: newOrder.selectedRegion,
                                    status: 'Open',
                                    timestamp: Date.now().toString(),
                                    total: newOrder.total
                                }]);
                            
                            if (error) console.error("Supabase order insert error:", error);
                            else console.log("Order saved to Supabase successfully.");
                        }
                    } catch (supErr) {
                        console.error("Failed to save to Supabase:", supErr);
                    }

                    // 2. Save to GAS (Fallback/Legacy Sync)
                    try {
                        // Using the global GAS_URL if available, otherwise fallback to the user's explicit URL
                        const gasUrl = window.GAS_URL || 'https://script.google.com/macros/s/AKfycbzzrf3GIJo4fS2nkJrBR4-LaEdYRh19QyrPXTgLA6_7Ya1iX0joKtwLSjWp9WU8CcJ_Fw/exec';
                        await fetch(gasUrl, {
                            method: 'POST',
                            mode: 'no-cors',
                            headers: {
                                'Content-Type': 'text/plain;charset=utf-8',
                            },
                            body: JSON.stringify({ action: 'placeOrder', order: newOrder })
                        });
                    } catch (e) {
                        console.error("Failed to save order to GAS:", e);
                    }
                };

                // Wait for sync then redirect
                saveOrderData().then(() => {
                    checkoutState.step = 1; // Reset navigation if needed

                    // Manually clear cart without triggering the confirmation modal
                    if (Array.isArray(window.cart)) {
                        window.cart.length = 0;
                        if (window.saveCart) window.saveCart();
                    }

                    window.location.href = 'index.html?orderSuccess=true'; // Return to store with success flag
                });
            })
            .catch(function (error) {
                // Error
                console.error('FAILED...', error);
                alert('Failed to send order. Please try again or contact us via WhatsApp.');

                // Fallback to WhatsApp
                if (window.checkoutWhatsApp) {
                    window.checkoutWhatsApp();
                }

                submitBtn.disabled = false;
                submitBtn.innerHTML = originalText;
                isSubmitting = false;
            });
    } else {
        console.error('EmailJS not loaded');
        alert('Internal Error: Email service not available.');
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
        isSubmitting = false;
    }
}

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
    initCheckout();
});

// Explicitly export to window
window.openCheckoutModal = openCheckoutModal;
window.checkoutNext = checkoutNext;
window.checkoutBack = checkoutBack;
window.submitOrder = submitOrder;
window.selectDeliveryMethod = selectDeliveryMethod;
window.updateDeliveryCompanies = updateDeliveryCompanies;
window.selectCompanyFromDropdown = selectCompanyFromDropdown;
window.initCheckout = initCheckout;
window.closeCheckout = closeCheckout;
window.checkoutNext = checkoutNext;
window.checkoutBack = checkoutBack;
window.selectDeliveryMethod = selectDeliveryMethod;
window.updateDeliveryCompanies = updateDeliveryCompanies;
window.updateCheckoutLanguage = updateCheckoutLanguage;
window.selectCompanyFromDropdown = selectCompanyFromDropdown;
window.submitOrder = submitOrder;
window.validateStep1 = validateStep1;
window.validateStep2 = validateStep2;
