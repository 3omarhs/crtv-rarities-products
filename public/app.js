const SHEET_ID = '1x3ExLPeQwSJtewUXQhYwdXO_I3Owhs6fenFc4UlbwPU';
// Override console// Product Catalog Logic - v4.1.6
console.log("Creative Rarities Storefront v4.1.6 (GAS v4.2 Sync)");
const GID = '897526080';
// API & Data Source Configuration
const CSV_URL = 'https://raw.githubusercontent.com/3omarhs/crtv-rarities-products/main/data/products.csv';

// IMPORTANT: Replace this URL with your new Google Apps Script Web App URL!
const GAS_URL = 'https://script.google.com/macros/s/AKfycbzzrf3GIJo4fS2nkJrBR4-LaEdYRh19QyrPXTgLA6_7Ya1iX0joKtwLSjWp9WU8CcJ_Fw/exec';
window.GAS_URL = GAS_URL;

// Assets Configuration
const ASSETS_BASE_URL = './assets/products/';

const productGrid = document.getElementById('product-grid');
const loadingEl = document.getElementById('loading');
const errorEl = document.getElementById('error-message');
const errorText = document.getElementById('error-text');
const controlsEl = document.getElementById('controls');
const searchInput = document.getElementById('search-input');
const sortSelect = document.getElementById('sort-select');
const categorySelect = document.getElementById('category-select');
const productCountEl = document.getElementById('product-count');
const backToTopBtn = document.getElementById('back-to-top');
const searchClear = document.getElementById('search-clear');

function normalizeArabic(text) {
    if (!text) return "";
    return String(text)
        .replace(/[أإآ]/g, "ا")
        .replace(/ة/g, "ه")
        .replace(/ى/g, "ي")
        .replace(/[ًٌٍَُِّ]/g, "") // Remove diacritics
        .toLowerCase()
        .trim();
}

function normalizeKey(key) {
    return key.toLowerCase().trim();
}

let allProducts = [];
let fuse = null;
try {
    window.cart = JSON.parse(localStorage.getItem('cr_cart') || '[]');
} catch (e) {
    console.error("Failed to parse cart", e);
    window.cart = [];
}
let cart = window.cart; // Keep local reference for existing code compatibility
let currentLang = localStorage.getItem('cr_lang') || null;
let currentCurrency = localStorage.getItem('cr_currency') || 'JOD';
let EXCHANGE_RATE = 1.41; // Default: 1 JOD = 1.41 USD (Updated dynamically)

function formatPrice(amountJOD) {
    if (amountJOD === null || amountJOD === undefined) return '';
    const numericAmount = parseFloat(String(amountJOD).replace(/[^\d.]/g, ''));
    if (isNaN(numericAmount)) return amountJOD;

    if (currentCurrency === 'USD') {
        return '$' + (numericAmount * EXCHANGE_RATE).toFixed(2);
    }
    return numericAmount.toFixed(3) + ' JOD'; // Ensure standard formatting
}

// Ensure global access
window.formatPrice = formatPrice;
window.currentCurrency = currentCurrency;

function setCurrency(curr) {
    currentCurrency = curr;
    localStorage.setItem('cr_currency', curr);

    // Update Toggle Button Text
    const currText = document.getElementById('curr-text');
    if (currText) currText.textContent = curr;

    // Re-render
    if (window.allProducts && window.allProducts.length > 0) {
        renderProducts(window.currentProducts || window.allProducts);
    }
    setupCart(); // Refreshes cart UI with new prices

    // If checkout is open/active, logic might be needed there too, 
    // but usually user selects currency before checkout.
}

function toggleCurrency() {
    setCurrency(currentCurrency === 'JOD' ? 'USD' : 'JOD');
}

// Modal Preference Handlers
window.tempPrefs = { lang: 'en', curr: 'JOD' };

function selectPref(type, val, btn) {
    window.tempPrefs[type] = val;
    // Update UI
    const group = btn.closest('.pref-options');
    group.querySelectorAll('.pref-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
}

function confirmPreferences() {
    setLanguage(window.tempPrefs.lang);
    setCurrency(window.tempPrefs.curr);
    document.getElementById('lang-modal').classList.remove('open');
}

const translations = {
    en: {
        langText: "العربية",
        headerWa: "Order via WhatsApp",
        storeTitle: "Creative Rarities Store",
        storeSubtitle: "Discover unique and premium products.",
        loadingText: "Loading Catalog...",
        searchPlaceholder: "Smart search: name, category, price, item number... ",
        categoryLabel: "Category:",
        allCategories: "All Categories",
        sortLabel: "Sort by:",
        sortDefault: "Default",
        sortNameAsc: "Name (A-Z)",
        sortNameDesc: "Name (Z-A)",
        sortPriceAsc: "Price (Low-High)",
        sortPriceDesc: "Price (High-Low)",
        sortCategoryAsc: "Category (A-Z)",
        sortCategoryDesc: "Category (Z-A)",
        sortArabicAsc: "Arabic Name (أ-ي)",
        sortArabicDesc: "Arabic Name (ي-أ)",
        footerText: "© 2026 Creative Rarities. Powered by 3omar.hs",
        cartTitle: "Your Cart",
        cartEmpty: "Your cart is empty.",
        totalLabel: "Total:",
        checkoutBtn: "Checkout",
        addToCart: "Add to Cart",
        added: "Added!",
        oos: "Out of Stock",
        inStock: "In Stock",
        copy: "Copy",
        copied: "Copied!",
        noPreview: "No Preview Available",
        retailPrice: "Retail Price:",
        priceLabel: "Price:",
        bulkSaving: "Wholesale Price (More than 10 pieces):",
        appliedRetail: "(Applied Retail Price)",
        appliedBulk: "(Applied Wholesale Price - More than 10 pieces)",
        viewDoc: "View Document",
        selectColor: "Available Colors:",
        noDesc: "No additional description available.",
        confirmClearTitle: "Empty Cart?",
        confirmClearMsg: "Are you sure you want to empty your cart? This will erase all selected items.",
        clearAll: "Clear All",
        keepItems: "Keep Items",
        cartClearedTitle: "Cart Cleared",
        cartClearedMsg: "All items have been removed from your cart successfully.",
        cartAlreadyEmptyMsg: "Your cart is already empty.",
        done: "Done",
        ok: "Ok",
        cartEmptyCheckoutTitle: "Cart is Empty",
        cartEmptyCheckoutMsg: "Please add some items to your cart before proceeding to checkout.",
        waOrderTotal: "Order Total:",
        qty: "Qty",
        pcs: "PCS",
        color: "Color",
        defaultColor: "Default",
        collectionLabel: "Collection:",
        dimensionsLabel: "Dimensions:",
        targetMarketLabel: "Target Market:",
        descriptionLabel: "Description:",
        detailedAddress: "Detailed Address",
        paymentCash: "Cash",
        paymentCliQ: "CliQ payment",
        paymentEWallet: "E-Wallets",
        paymentCashDelivery: "Cash on delivery",
        paymentCliQDelivery: "CliQ payment on delivery",
        paymentEWalletDelivery: "E-Wallets on delivery",
        enterAddress: "Enter your detailed address (City, Street, Building No., Landmark)",
        valAddress: "Please enter your detailed address.",

        // Checkout & Shared
        checkoutTitle: "Checkout",
        step1: "1. Info",
        step2: "2. Delivery",
        step3: "3. Review",
        contactInfo: "Contact Information",
        fullName: "Full Name",
        enterName: "Enter your name",
        phoneNumber: "Phone Number",
        emailAddr: "Email Address",
        optional: "(Optional)",
        waOrderBtn: "Place order using whatsapp to contact store manager",
        deliveryMethod: "Delivery Method",
        chooseMethod: "Choose Delivery Method",
        methodDelivery: "Choosing a delivery region then company",
        methodPickup: "Pick from the representative",
        selectRegion: "Select Region",
        chooseRegion: "-- Choose Region --",
        selectCompany: "Select Company",
        chooseCompany: "-- Choose Company --",
        noPartners: "No delivery partners available",
        orderSummary: "Order Summary",
        subtotal: "Subtotal:",
        delivery: "Delivery:",
        total: "Total:",
        back: "Back",
        next: "Next",
        placeOrder: "Place Order",
        placeOrder: "Place Order",
        pickupLocationLabel: "Pickup Location:",
        pickupAddress: "Amman, Al-Hurriya Street, opposite the Department of Lands south of Amman",
        valNamePhone: "Please enter a valid name and phone number.",
        valRegionCompany: "Please select a region and delivery company.",
        methodSummaryPickup: "Method: Pick from the representative",
        methodSummaryDelivery: "Method: Delivery to {region} ({company})",
        nameSummary: "Name: {name}",
        phoneSummary: "Phone: +962 {phone}",
        paymentLabel: "Payment Method:"
    },
    ar: {
        langText: "English",
        headerWa: "اطلب عبر واتساب",
        storeTitle: "متجر نوادر إبداعية",
        storeSubtitle: "اكتشف منتجات فريدة وفاخرة.",
        loadingText: "جاري تحميل الكتالوج...",
        searchPlaceholder: "بحث ذكي: الاسم بالتصنيف بالسعر برقم القطعة...",
        categoryLabel: "التصنيف:",
        allCategories: "جميع التصنيفات",
        sortLabel: "ترتيب حسب:",
        sortDefault: "الافتراضي",
        sortNameAsc: "الاسم (A-Z)",
        sortNameDesc: "الاسم (Z-A)",
        sortPriceAsc: "السعر (أقل-أعلى)",
        sortPriceDesc: "السعر (أعلى-أقل)",
        sortCategoryAsc: "التصنيف (A-Z)",
        sortCategoryDesc: "التصنيف (Z-A)",
        sortArabicAsc: "الاسم العربي (أ-ي)",
        sortArabicDesc: "الاسم العربي (ي-أ)",
        footerText: "© 2026 Creative Rarities. بدعم من 3omar.hs",
        cartTitle: "سلة التسوق",
        cartEmpty: "سلة التسوق فارغة.",
        totalLabel: "المجموع:",
        checkoutBtn: "إتمام الطلب",
        addToCart: "أضف للسلة",
        added: "تمت الإضافة!",
        oos: "نفدت الكمية",
        inStock: "متوفر",
        copy: "نسخ",
        copied: "تم النسخ!",
        noPreview: "لا يوجد معاينة",
        retailPrice: "سعر المفرق:",
        priceLabel: "السعر:",
        bulkSaving: "سعر الجملة (أكثر من 10 قطع):",
        appliedRetail: "(تم تطبيق سعر المفرق)",
        appliedBulk: "(تم تطبيق سعر الجملة - أكثر من 10 قطع)",
        viewDoc: "عرض الملف",
        selectColor: "الألوان المتاحة:",
        noDesc: "لا يوجد وصف إضافي متاح.",
        confirmClearTitle: "تفريغ السلة؟",
        confirmClearMsg: "هل أنت متأكد أنك تريد تفريغ سلة التسوق؟ سيتم مسح جميع العناصر المختارة.",
        clearAll: "مسح الكل",
        keepItems: "الإبقاء على العناصر",
        cartClearedTitle: "تم تفريغ السلة",
        cartClearedMsg: "تمت إزالة جميع العناصر من سلتك بنجاح.",
        cartAlreadyEmptyMsg: "سلة التسوق فارغة بالفعل.",
        done: "تم",
        ok: "حسناً",
        cartEmptyCheckoutTitle: "السلة فارغة",
        cartEmptyCheckoutMsg: "يرجى إضافة بعض العناصر إلى سلتك قبل المتابعة لإتمام الطلب.",
        waOrderHeader: "*Creative Rarities Store - طلب جديد*",
        waOrderTotal: "مجموع الطلب:",
        qty: "الكمية",
        pcs: "قطعة",
        color: "اللون",
        defaultColor: "افتراضي",
        collectionLabel: "المجموعة:",
        dimensionsLabel: "الأبعاد:",
        targetMarketLabel: "الجمهور المستهدف:",
        descriptionLabel: "الوصف:",
        detailedAddress: "العنوان بالتفصيل",
        enterAddress: "أدخل عنوانك بالتفصيل (المدينة، الشارع، رقم العمارة، معلم معروف)",
        valAddress: "يرجى إدخال تفاصيل العنوان.",

        // Checkout & Shared
        checkoutTitle: "إتمام الطلب",
        step1: "1. المعلومات",
        step2: "2. التوصيل",
        step3: "3. المراجعة",
        contactInfo: "معلومات الاتصال",
        fullName: "الاسم الكامل",
        enterName: "أدخل اسمك",
        phoneNumber: "رقم الهاتف",
        emailAddr: "البريد الإلكتروني",
        optional: "(اختياري)",
        waOrderBtn: "اطلب عبر واتساب للتواصل مع مدير المتجر",
        deliveryMethod: "طريقة التوصيل",
        chooseMethod: "اختر طريقة التوصيل",
        methodDelivery: "اختيار منطقة التوصيل ثم الشركة",
        methodPickup: "الاستلام من المندوب",
        selectRegion: "اختر المنطقة",
        chooseRegion: "-- اختر المنطقة --",
        selectCompany: "اختر الشركة",
        chooseCompany: "-- اختر الشركة --",
        noPartners: "لا يوجد شركاء توصيل متاحين",
        orderSummary: "ملخص الطلب",
        subtotal: "المجموع الفرعي:",
        delivery: "التوصيل:",
        total: "الإجمالي:",
        back: "رجوع",
        next: "التالي",
        placeOrder: "تأكيد الطلب",
        placeOrder: "تأكيد الطلب",
        pickupLocationLabel: "موقع الاستلام:",
        pickupAddress: "عمان، شارع الحرية، مقابل دائرة اراضي جنوب عمان",
        valNamePhone: "يرجى إدخال اسم ورقم هاتف صالحين.",
        valRegionCompany: "يرجى اختيار المنطقة وشركة التوصيل.",
        methodSummaryPickup: "الطريقة: الاستلام من المندوب",
        methodSummaryDelivery: "الطريقة: توصيل إلى {region} ({company})",
        nameSummary: "الاسم: {name}",
        phoneSummary: "الهاتف: +962 {phone}",
        paymentLabel: "طريقة الدفع:",
        paymentCash: "نقد",
        paymentCliQ: "دفع كليك",
        paymentEWallet: "محافظ إلكترونية",
        paymentCashDelivery: "الدفع عند الاستلام",
        paymentCliQDelivery: "دفع كليك عند الاستلام",
        paymentEWalletDelivery: "محافظ إلكترونية عند الاستلام"
    }
};

// Make translations globally accessible
window.translations = translations;

const aiValueTranslations = {
    ar: {
        categories: {
            "Pet Supplies - Aquarium Decor & Maintenance": "لوازم الحيوانات الأليفة - ديكور وصيانة الأحواض المائية",
            "Pet Supplies - Habitat Decor": "لوازم الحيوانات الأليفة - ديكور البيئة",
            "Pet Supplies - Cat Toys & Furniture": "لوازم الحيوانات الأليفة - ألعاب وأثاث القطط",
            "Pet Supplies - Reptile Habitats & Decor": "لوازم الحيوانات الأليفة - ديكور وبيئة الزواحف",
            "Pet Supplies - Bird Feeders & Toys": "لوازم الحيوانات الأليفة - مغذيات وألعاب الطيور",
            "Pet Supplies - Small Animal Habitats": "لوازم الحيوانات الأليفة - مساكن الحيوانات الصغيرة",
            "Pet Supplies - Feeding & Bedding": "لوازم الحيوانات الأليفة - التغذية والمفارش",
            "Home Decor & Organization - Indoor Gardening & Planters": "ديكور المنزل والتنظيم - البستنة الداخلية وأوعية الزرع",
            "Home Decor & Organization - Kitchen Accessories": "ديكور المنزل والتنظيم - إكسسوارات المطبخ",
            "Home Decor & Organization - Bathroom Accessories": "ديكور المنزل والتنظيم - إكسسوارات الحمام",
            "Home Decor & Fragrance - Incense Holders & Burners": "ديكور المنزل والعطور - حوامل ومباخر البخور",
            "Office Supplies & Desk Accessories - Perpetual Calendars": "لوازم مكتبية وإكسسوارات المكتب - تقاويم مستمرة",
            "Party Favors / Costume Accessories": "تجهيزات الحفلات / إكسسوارات التنكر",
            "Toys & Games - Novelty & Gag Toys": "الألعاب والترفيه - ألعاب مبتكرة وهدايا طريفة",
            "Electronics Accessories - Cell Phone Stands & Charging Docks": "إكسسوارات الإلكترونيات - حوامل الهواتف ومنصات الشحن",
            "Aquarium Decor & Maintenance": "ديكور وصيانة الأحواض المائية",
            "Gardening & Planters": "البستنة وأوعية الزرع",
            "Home Decor & Organization": "ديكور المنزل والتنظيم",
            "Jewelry Organizer": "منظمات المجوهرات",
            "Office Supplies & Desk Accessories - Perpetual Calendars": "لوازم مكتبية - تقاويم مستمرة",
            "Pet Supplies - Bird Feeders & Toys": "لوازم الطيور - مغذيات وألعاب",
            "Pet Supplies - Cat Toys & Furniture": "لوازم القطط - ألعاب وأثاث",
            "Pet Supplies - Feeding & Bedding": "لوازم الحيوانات - التغذية والمفارش",
            "Pets - Cat Tools": "أدوات القطط",
            "Pets - Hamster Tools": "أدوات الهامستر",
            "Phone Accessories": "إكسسوارات الهواتف",
            "Plants Care": "العناية بالنباتات",
            "Stands": "ستاندات",
            "Toys & Games - Novelty & Gag Toys": "ألعاب وهدايا طريفة",
            "Trending": "الأكثر رواجاً"
        },
        collections: {
            "The Aquascape Series": "سلسلة أكواسكيب",
            "Nature Scapes": "مناظر طبيعية",
            "Feline Fun & Comfort": "راحة ومرح القطط",
            "Reptile Realms": "عالم الزواحف",
            "The Modern Sanctuary Series": "سلسلة الملاذ الحديث",
            "Culinary Creations": "إبداعات الطهي",
            "The Party Starter Series": "سلسلة مبهجي الحفلات",
            "The Kinetic Timepiece Collection": "مجموعة الساعات الحركية",
            "The Serenity Flow Collection": "مجموعة تدفق الصفاء",
            "The Whimsical Menagerie Collection": "مجموعة الكائنات الطريفة",
            "The Playful Illusion Collection": "مجموعة الخدع المرحة",
            "The Bio-Kinetic Tech Collection": "مجموعة التقنية الحيوية الحركية",
            "Avian Adventures": "مغامرات الطيور",
            "Small Critter Comforts": "راحة المخلوقات الصغيرة",
            "Pet Care Essentials": "أساسيات العناية بالحيوانات الأليفة",
            "Bug World": "عالم الحشرات"
        },
        regions: {
            "Amman": "عمان",
            "Ajloon": "عجلون",
            "Al Fanadik": "الفنادق",
            "Al Hashmyeh": "الهاشمية",
            "Al Jafer": "الجفر",
            "Al Omari Borders": "حدود العمري",
            "Al Qaser": "القصر",
            "Al Qastal": "القسطل",
            "Al Rosaifa": "الرصيفة",
            "Al Sukhneh": "السخنة",
            "AAy": "أي",
            "Aqaba": "العقبة",
            "Azraq": "الأزرق",
            "Balqa": "البلقاء",
            "Bereian": "بيرين",
            "Der Allah": "دير علا",
            "Dulail": "الضليل",
            "Free Zone": "المنطقة الحرة",
            "Fuhais": "الفحيص",
            "Ghour": "الغور",
            "Ghour Al Safi": "غور الصافي",
            "Ghweria": "الغويرية",
            "Irbid": "إربد",
            "Jerash": "جرش",
            "Karak": "الكرك",
            "Khaldieh": "الخالدية",
            "MaAn / Maan": "معان",
            "Madaba": "مأدبا",
            "Mahes": "ماحص",
            "Moatah": "مؤتة",
            "Moghayam Hetein": "مخيم حطين",
            "Mwaqar": "الموقر",
            "Naour": "ناعور",
            "Petra": "البتراء",
            "Qwaireh": "القويرة",
            "Ramtha": "الرمثا",
            "Rashadyeh": "الرشادية",
            "Rwaished": "الرويشد",
            "Salt": "السلط",
            "Shoubak": "الشوبك",
            "Shouneh": "الشونة",
            "Tafileh": "الطفيلة",
            "Theban": "ذيبان",
            "Wadi Mousa": "وادي موسى",
            "Yajoz": "ياجوز",
            "Zarqa": "الزرقاء",
            "Zarqa Al Jadedeh": "الزرقاء الجديدة",
            "Zone 1": "المنطقة 1",
            "Zone 2": "المنطقة 2"
        },
        targetMarkets: {
            "Aquarium Hobbyists": "هواة أحواض السمك",
            "Aquarium & Reptile Enthusiasts": "محبي أحواض السمك والزواحف",
            "Cat Owners": "أصحاب القطط",
            "Reptile Keepers & Turtle Owners": "مربي الزواحف وأصحاب السلاحف",
            "Urban dwellers, wellness-focused professionals, and biophilic design enthusiasts seeking tranquility in small spaces": "سكان المدن، المحترفون المهتمون بالصحة، ومحبو التصميم الحيوي الباحثون عن الهدوء في المساحات الصغيرة",
            "Home chefs, organizers, and modern kitchen enthusiasts": "طهاة المنازل، المنظمون، ومحبو المطابخ الحديثة",
            "Event Organizers, Photo Booth Operators, and Party Guests": "منظمو الفعاليات، مشغلو كبائن التصوير، وضيوف الحفلات",
            "Office Professionals, Students, Kinetic Art Lovers, and Eco-Conscious Minimalists": "الموظفون، الطلاب، محبو الفن الحركي، والمحبون للبساطة المهتمون بالبيئة",
            "Meditation Practitioners, Tea Lovers, Spa Decorators, and Fans of Unique Aromatherapy": "ممارسو التأمل، محبو الشاي، مصممو المنتجعات الصحية، ومحبو العلاج العطري الفريد",
            "Cat Lovers, Families with Children, Novelty Gift Shoppers, and Bathroom Decor Enthusiasts": "محبو القطط، العائلات التي لديها أطفال، متسوقو الهدايا المبتكرة، ومحبو ديكورات الحمام",
            "Pranksters, Social Media Content Creators, and Party Enthusiasts": "محبي المقالب، صناع محتوى التواصل الاجتماعي، ومحبي الحفلات",
            "Tech Enthusiasts, Modern Workspace Designers, Gamers, and iPhone Users": "عشاق التقنية، مصممو مساحات العمل الحديثة، اللاعبون، ومستخدمو الآيفون",
            "Bird Watchers & Owners": "مراقبو ومربو الطيور",
            "Hamster & Small Pet Owners": "أصحاب الهامستر والحيوانات الأليفة الصغيرة",
            "Pet Owners": "أصحاب الحيوانات الأليفة",
            "Insect Keepers": "مربي الحشرات"
        },
        colors: {
            "Black": "أسود",
            "White": "أبيض",
            "Brown": "بني",
            "Blue": "أزرق",
            "Gray": "رمادي",
            "Green": "أخضر",
            "Red": "أحمر",
            "Pink": "وردي",
            "Purple": "أرجواني",
            "Yellow": "أصفر",
            "Orange": "برتقالي",
            "Silver": "فضي",
            "Gold": "ذهبي",
            "Beige": "بيج",
            "Black & White": "أسود وأبيض"
        },
        descriptions: {
            "Fool your friends with this Realistic Cigarette Style Bubble Wand. Modeled to look just like the real thing, this slender stick is actually a fun bubble blower. Perfect for pranks, photoshoots, or just breaking the ice at parties, it lets you blow whimsical bubbles instead of smoke. Please note: This product includes the bubble wand only; the box packaging shown in the display is not included.": "امزح مع أصدقائك باستخدام عصا الفقاعات المصممة بشكل سيجارة واقعية. تم تصميمها لتبدو تماماً مثل الشيء الحقيقي، ولكن هذا العصا الرفيعة هي في الواقع منفاخ فقاعات ممتع. مثالية للمقالب، أو جلسات التصوير، أو لكسر الجمود في الحفلات، فهي تتيح لك نفخ فقاعات خيالية بدلاً من الدخان. يرجى ملاحظة: يتضمن هذا المنتج عصا الفقاعات فقط؛ ولا يشمل صندوق التغليف الموضح في العرض.",
            "Elevate your relaxation ritual with this Levitating Teapot Backflow Incense Fountain. Featuring a glossy black finish and a surreal, gravity-defying design, this burner directs heavy incense smoke down the spout to mimic the act of pouring tea. The smoke pools elegantly in the cup below, creating a mesmerizing, water-like visual effect that calms the mind. Accented with a golden finial, it creates a tranquil atmosphere perfect for meditation corners or spa-inspired living spaces.": "ارتقِ بطقوس الاسترخاء الخاصة بك مع نافورة البخور ذات التدفق العكسي (إبريق الشاي الطائر). بفضل اللمسة النهائية السوداء اللامعة والتصميم السريالي الذي يتحدى الجاذبية، تقوم هذه المبخرة بتوجيه دخان البخور الكثيف إلى الأسفل عبر الفوهة ليحاكي عملية صب الشاي. يتجمع الدخان بأناقة في الكوب بالأسفل، مما يخلق تأثيراً بصرياً ساحراً يشبه الماء يهدئ العقل. مزينة بلمسة نهائية ذهبية، تخلق جواً هادئاً مثالياً لزوايا التأمل أو مساحات المعيشة المستوحاة من المنتجعات الصحية.",
            "Bring the calming rhythm of nature indoors with this gravity-fed watering system. Designed to simulate a gentle rainfall, it hydrates your plants evenly while providing a mesmerizing and serene visual experience. The sleek, modern open-frame architecture allows water to drip slowly from the upper reservoir, ensuring optimal soil moisture without over-saturation. A concealed bottom tray catches excess water, keeping your surfaces pristine. This piece is the perfect fusion of functional botany and modern art.": "أحضر الإيقاع الهادئ للطبيعة إلى الداخل مع نظام الري هذا الذي يعمل بالجاذبية. صُمم ليحاكي سقوط المطر اللطيف، فهو يروي نباتاتك بالتساوي مع توفير تجربة بصرية ساحرة وهادئة. تتيح البنية الحديثة ذات الإطار المفتوح للماء بالتقطير ببطء من الخزان العلوي، مما يضمن رطوبة تربة مثالية دون إشباع زائد. تلتقط الصينية السفلية المخفية المياه الزائدة، مما يحافظ على نظافة الأسطح. هذه القطعة هي الدمج المثالي بين علم النبات العملي والفن الحديث.",
            "Keep track of time with a playful twist using this Infinite Spin Manual Desktop Calendar. Featuring a vibrant yellow finish and a clever 3D-printed design, this perpetual calendar replaces disposable paper planners with an interactive, everlasting solution. Three independent rotating rings allow you to manually align the day, date, and month, turning your morning routine into a satisfying tactile ritual. Its compact, modern form makes it a functional conversation piece for any creative workspace or study desk.": "تتبع الوقت بلمسة مرحة مع هذا التقويم المكتبي اليدوي دائم الدوران. يتميز هذا التقويم الدائم بلمسة نهائية صفراء نابضة بالحياة وتصميم ذكي مطبوع ثلاثي الأبعاد، ويحل محل المخططات الورقية التي تستخدم لمرة واحدة بحل تفاعلي وأبدي. تتيح لك ثلاث حلقات دوارة مستقلة محاذاة اليوم والتاريخ والشهر يدوياً، مما يحول روتينك الصباحي إلى طقس ملموس وممتع. شكله الحديث والمدمج يجعله قطعة مميزة وعملية لأي مساحة عمل إبداعية أو مكتب دراسة.",
            "Transform your desk setup with this Articulated Vertebrae MagSafe Docking Stand. Featuring a bold, S-curved design reminiscent of a spinal column, this stand combines industrial aesthetics with functional stability. The segmented arm, accented with contrasting joints, creates a dynamic floating effect for your phone while securely housing your magnetic charger. With built-in cable management channels to keep wires hidden, this piece serves as both a high-tech charging station and a modern sculptural display.": "حول إعداد مكتبك مع قاعدة شحن MagSafe ذات الفقرات المفصّلة. تتميز هذه القاعدة بتصميم جريء على شكل حرف S يشبه العمود الفقري، وهي تجمع بين الجمال الصناعي والاستقرار الوظيفي. تخلق الذراع المجزأة، المزينة بمفاصل متباينة، تأثيراً عائماً ديناميكياً لهاتفك بينما تضم شاحنك المغناطيسي بأمان. مع قنوات إدارة الكابلات المدمجة لإبقاء الأسلاك مخفية، تعمل هذه القطعة كمحطة شحن متطورة وعرض نحتي حديث في آن واحد."
        },
        templates: {
            upgrade: "قم بترقية {area} الخاص بك باستخدام {product}.",
            expertly: "تم تصميمه باحتراف لـ {target}، ويوفر هذا الملحق عالي الجودة {benefit}.",
            durable: "يضمن هيكله المتين الاستدامة، مما يجعله مناسباً تماماً لأي {context}.",
            easy: "سهل الاستخدام والتنظيف، ويجمع بين الوظيفة والجمال الأنيق.",
            dimensions: "الأبعاد: {dims} مم."
        },
        benefits: {
            "enrichment for your aquatic life while beautifying the tank": "إثراء لحياتك المائية مع تجميل الحوض",
            "a realistic and engaging landscape for your pets": "منظراً طبيعياً واقعياً وجذاباً لحيواناتك الأليفة",
            "hours of entertainment and comfort for your feline friend": "ساعات من الترفيه والراحة لصديقك القط",
            "a naturalistic environment for rest and exploration": "بيئة طبيعية للراحة والاستكشاف",
            "optimal soil moisture without over-saturation": "رطوبة تربة مثالية دون إشباع زائد"
        }
    }
};

function translateValue(field, value) {
    if (currentLang !== 'ar') return value;
    if (!value) return value;

    const maps = aiValueTranslations.ar;

    switch (field) {
        case 'category':
            return maps.categories[value] || value;
        case 'region':
            return maps.regions ? (maps.regions[value] || value) : value;
        case 'collection':
            return maps.collections[value] || value;
        case 'targetMarket':
            return maps.targetMarkets[value] || value;
        case 'colors':
            if (Array.isArray(value)) {
                return value.map(c => maps.colors[c] || c);
            }
            return String(value).split(',').map(c => maps.colors[c.trim()] || c.trim()).join(', ');
        case 'dimensions':
            return String(value).replace(/(\d+)\s*[*x]\s*(\d+)\s*[*x]\s*(\d+)/g, '$1 × $2 × $3 مم');
        case 'description':
            let originalText = String(value);
            let normalizedText = originalText.replace(/\s+/g, ' ').trim();

            // Check descriptions map using normalized version
            if (maps.descriptions) {
                const translatedKey = Object.keys(maps.descriptions).find(key =>
                    key.replace(/\s+/g, ' ').trim() === normalizedText
                );
                if (translatedKey) return maps.descriptions[translatedKey];
            }

            let translated = originalText;
            // Template translation (Smart AI fallback)
            translated = translated.replace(/Upgrade your (.*?) with the (.*?)\./gi, (match, area, product) => {
                return maps.templates.upgrade.replace('{area}', area).replace('{product}', product);
            });
            translated = translated.replace(/Expertly designed for (.*?), this high-quality accessory provides (.*?)\./gi, (match, target, benefit) => {
                return maps.templates.expertly.replace('{target}', maps.targetMarkets[target.trim()] || target.trim()).replace('{benefit}', maps.benefits[benefit.trim()] || benefit.trim());
            });
            translated = translated.replace(/Its durable construction ensures longevity, making it a perfect fit for any (.*?)\./gi, (match, context) => {
                return maps.templates.durable.replace('{context}', context.trim());
            });
            translated = translated.replace(/Easy to use and clean, it combines functionality with a sleek aesthetic\./gi, maps.templates.easy);
            translated = translated.replace(/Dimensions: (.*?)\./gi, (match, dims) => {
                return maps.templates.dimensions.replace('{dims}', translateValue('dimensions', dims.trim()));
            });
        default:
            return value;
    }
}
window.translateValue = translateValue;

async function fetchCurrencyRate() {
    // Dynamic currency fetching removed for static GitHub Pages deployment.
    // Defaulting to 1.41.
    EXCHANGE_RATE = 1.41;
    window.EXCHANGE_RATE = EXCHANGE_RATE;
    console.log(`Using default static exchange rate: 1 USD = 0.7092 JOD. Exchange Rate (JOD->USD): ${EXCHANGE_RATE}`);
}

function getDeviceName() {
    const ua = navigator.userAgent;
    if (/android/i.test(ua)) {
        // Try to extract model like SM-G991B
        const match = ua.match(/\(([^)]+)\)/);
        if (match && match[1]) {
            const parts = match[1].split(';');
            const modelPart = parts.find(p => p.includes('Build/') || p.includes('Linux; Android'));
            if (parts.length > 2) return `Android (${parts[parts.length-1].trim().split(' Build/')[0]})`;
            return `Android Device`;
        }
        return "Android Device";
    }
    if (/iPhone/i.test(ua)) return "iPhone";
    if (/iPad/i.test(ua)) return "iPad";
    if (/Windows/i.test(ua)) return "Windows PC";
    if (/Macintosh/i.test(ua)) return "Mac";
    if (/Linux/i.test(ua)) return "Linux System";
    return "Unknown Device";
}

async function init() {
    await fetchCurrencyRate();

    if (!currentLang) {
        const langModal = document.getElementById('lang-modal');
        if (langModal) langModal.classList.add('open');
    } else {
        applyLanguage();
    }

    // Check for Order Success Flag
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('orderSuccess') === 'true') {
        // Clean URL
        const newUrl = window.location.pathname;
        window.history.replaceState({}, document.title, newUrl);

        // Show Success Modal
        const t = translations[currentLang || 'en'] || translations['en'];
        setTimeout(() => {
            showModal({
                title: currentLang === 'ar' ? 'تم استلام الطلب' : 'Order Received',
                message: currentLang === 'ar' ? 'تم استلام طلبك بنجاح! سنتواصل معك قريباً.' : 'Order placed successfully! We have received your order and will contact you soon.',
                type: 'success',
                confirmText: t.ok
            });
        }, 500); // Slight delay to ensure DOM is ready
    }

    // Only load products if we have a grid to put them in
    if (document.getElementById('product-grid')) {
        try {
            console.log("Grid found, calling fetchSheetData...");
            const data = await fetchSheetData();
            console.log("Data fetched, processing...");
            processData(data);
            setupSearch();
            setupSort();
            setupBackToTop();
        } catch (err) {
            showError(err.message);
        }
    }
    setupCart();

    // If on checkout page, ensure language is applied to form
    if (window.updateCheckoutLanguage && !document.getElementById('product-grid')) {
        window.updateCheckoutLanguage();
    }

    // --- TRACK VISITS (Server Side) ---
    // Only count unique sessions to prevent spamming stats on reload
    // MODIFIED: We are temporarily allowing multiple counts or ensuring it runs if not set
    // --- TRACK VISITS (Server Side / GAS) ---
    // Only count unique sessions to prevent spamming stats on reload
    // GAS_URL shared with admin
    const GAS_URL = "https://script.google.com/macros/s/AKfycbzWZpIq7pRLme0f-xLj2vSXqJ7hXz6Ru9ChRyKg0mi0AmEyNqED_AgSvHLt9B--WEj_Gg/exec";

    if (!sessionStorage.getItem('visited_session')) {
        sessionStorage.setItem('visited_session', 'true');
        const isStatic = window.location.hostname.includes('github.io');
        const deviceName = getDeviceName();
        
        // --- 1. Supabase Visit Tracking ---
        try {
            if (window.supabaseClient) {
                console.log("Tracking visit to Supabase...");
                // Get local date YYYY-MM-DD
                const today = new Date();
                const offset = today.getTimezoneOffset() * 60000;
                const localDate = new Date(today.getTime() - offset).toISOString().split('T')[0];
                
                window.supabaseClient
                    .from('visits')
                    .select('count')
                    .eq('date', localDate)
                    .single()
                    .then(({data, error}) => {
                        let newCount = 1;
                        if (data && data.count) {
                            newCount = parseInt(data.count, 10) + 1;
                        }
                        return window.supabaseClient.from('visits').upsert({ date: localDate, count: newCount }, { onConflict: 'date' });
                    })
                    .then(({error}) => {
                        if (error) console.error("Supabase visit track error:", error);
                        else console.log("Visit tracked to Supabase.");
                    });
            }
        } catch(e) {
            console.error("Supabase visit error:", e);
        }

        // --- 2. Fallbacks (GAS / Local API) ---
        if (isStatic) {
            console.log("Attempting to track visit via GAS (Static/GitHub)...");
            fetch(GAS_URL, {
                method: 'POST',
                mode: 'no-cors',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({ action: 'recordVisit', deviceName: deviceName })
            })
            .then(() => console.log("Visit recorded (GAS)."))
            .catch(e => console.error("Could not track visit via GAS:", e));
        } else {
            console.log("Attempting to track visit via Local API...");
            fetch('/api/visits', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'recordVisit', deviceName: deviceName })
            })
            .then(res => res.json())
            .then(data => console.log("Visit recorded (Local):", data))
            .catch(e => console.warn("Local visit tracking failed, trying GAS fallback:", e));
        }
    }
}

function setLanguage(lang) {
    currentLang = lang;
    localStorage.setItem('cr_lang', lang);
    document.getElementById('lang-modal').classList.remove('open');
    applyLanguage();
}

function skipLanguage() {
    if (!currentLang) {
        setLanguage('en');
    } else {
        document.getElementById('lang-modal').classList.remove('open');
    }
}

function toggleLanguage() {
    setLanguage(currentLang === 'en' ? 'ar' : 'en');
}

function applyLanguage() {
    try {
        console.log("App Trace: applyLanguage Start");
        window.currentLang = currentLang;
        const t = translations[currentLang];
        document.body.className = currentLang === 'ar' ? 'rtl' : '';
        document.documentElement.lang = currentLang;

        document.documentElement.lang = currentLang;

        try {
            if (window.updateChatbotLanguage) window.updateChatbotLanguage();
        } catch (e) { console.warn("Chatbot language update failed", e); }

        try {
            if (window.updateCheckoutLanguage) window.updateCheckoutLanguage();
        } catch (e) { console.warn("Checkout language update failed", e); }

        const setT = (id, text, prop = 'textContent') => {
            const el = document.getElementById(id);
            if (el) el[prop] = text;
        };

        setT('lang-text', t.langText);
        setT('header-wa-text', t.headerWa);

        const storeTitleEl = document.getElementById('store-title');
        if (storeTitleEl) {
            if (currentLang === 'en') {
                storeTitleEl.innerHTML = `Creative <span class="gradient-text">Rarities</span> Store`;
            } else {
                storeTitleEl.innerHTML = `متجر <span class="gradient-text">نوادر إبداعية</span>`;
            }
        }

        setT('store-subtitle', t.storeSubtitle);
        setT('loading-text', t.loadingText);
        setT('search-input', t.searchPlaceholder, 'placeholder');
        setT('category-label', t.categoryLabel);
        setT('all-categories-opt', t.allCategories);
        setT('sort-label', t.sortLabel);
        setT('sort-default', t.sortDefault);
        setT('sort-name-asc', t.sortNameAsc);
        setT('sort-name-desc', t.sortNameDesc);
        setT('sort-price-asc', t.sortPriceAsc);
        setT('sort-price-desc', t.sortPriceDesc);
        setT('sort-category-asc', t.sortCategoryAsc);
        setT('sort-category-desc', t.sortCategoryDesc);
        setT('sort-arabic-asc', t.sortArabicAsc);
        setT('sort-arabic-desc', t.sortArabicDesc);
        setT('footer-text', t.footerText);
        setT('cart-title', t.cartTitle);
        setT('cart-empty-msg', t.cartEmpty);
        setT('total-label', t.totalLabel);
        setT('checkout-text', t.checkoutBtn);

        if (allProducts.length > 0) {
            populateCategoryDropdown();
            renderProducts(currentProducts);
        }
        console.log("App Trace: applyLanguage End");
    } catch (e) {
        console.error("Critical: applyLanguage failed", e);
    }
}

async function fetchSheetData() {
    return new Promise((resolve, reject) => {
        if (typeof Papa === 'undefined') {
            reject(new Error("PapaParse not loaded"));
            return;
        }
        console.log("Fetching Product data from Google Sheets CSV...");
        Papa.parse(CSV_URL + '?v=' + Date.now(), {
            download: true,
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
                console.log("CSV load success:", results.data.length, "items");
                resolve(results.data);
            },
            error: (err) => {
                console.error("CSV load failed:", err);
                reject(err);
            }
        });
    });
}

function normalizeKey(key) {
    return key.toLowerCase().trim();
}

function extractDriveId(url) {
    if (!url) return null;

    // Only skip types that are definitely NOT images (docs, sheets, forms)
    if (url.includes('docs.google.com/document') ||
        url.includes('docs.google.com/spreadsheet') ||
        url.includes('docs.google.com/presentation') ||
        url.includes('docs.google.com/forms')) {
        return null; 
    }

    let match = url.match(/\/(?:file\/)?d\/([a-zA-Z0-9_-]+)/);
    if (match) return match[1];

    match = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (match) return match[1];

    if (url.length > 20 && /^[a-zA-Z0-9_-]+$/.test(url)) return url;

    return null;
}



function populateCategoryDropdown() {
    const categorySelect = document.getElementById('category-select');
    if (!categorySelect || !window.allProducts) return;

    const currentVal = categorySelect.value;
    const categories = [...new Set(window.allProducts.map(p => p.category).filter(Boolean))].sort();
    const t = translations[currentLang || 'en'] || translations['en'];

    categorySelect.innerHTML = `<option value="all" id="all-categories-opt">${t.allCategories}</option>` +
        categories.map(c => {
            const diplayText = window.translateValue ? window.translateValue('category', c) : c;
            return `<option value="${c}">${diplayText}</option>`;
        }).join('');

    // Restore selection if possible, otherwise default to all
    if (currentVal && (currentVal === 'all' || categories.includes(currentVal))) {
        categorySelect.value = currentVal;
    } else {
        categorySelect.value = 'all';
    }
}

function processData(data) {
    if (!data || data.length === 0) {
        showError("No data found in the spreadsheet.");
        return;
    }

    const firstItem = data[0];
    const keys = Object.keys(firstItem);

    const productKey = keys.find(k => normalizeKey(k) === 'product name') ||
        keys.find(k => normalizeKey(k).includes('product') && normalizeKey(k).includes('name')) ||
        keys.find(k => normalizeKey(k) === 'name') ||
        keys.find(k => normalizeKey(k) === 'title');

    const noKey = keys.find(k => normalizeKey(k).includes('no')) ||
        keys.find(k => normalizeKey(k).includes('number')) ||
        keys.find(k => normalizeKey(k) === 'id');

    const imageKey = keys.find(k => normalizeKey(k).includes('image')) ||
        keys.find(k => normalizeKey(k).includes('photo')) ||
        keys.find(k => normalizeKey(k).includes('url'));

    const linkKey = keys.find(k => normalizeKey(k) === 'document link') ||
        keys.find(k => normalizeKey(k).includes('document') && normalizeKey(k).includes('link')) ||
        keys.find(k => normalizeKey(k) === 'link');

    const retailPriceKey = keys.find(k => normalizeKey(k) === 'price_low_qty') ||
        keys.find(k => k.includes('<')) ||
        keys.find(k => normalizeKey(k).includes('retail')) ||
        keys.find(k => normalizeKey(k) === 'price');

    const wholesalePriceKey = keys.find(k => normalizeKey(k) === 'price_high_qty') ||
        keys.find(k => k.includes('>')) ||
        keys.find(k => normalizeKey(k).includes('wholesale')) ||
        keys.find(k => normalizeKey(k).includes('bulk'));

    const priceKey = keys.find(k => normalizeKey(k).includes('price') && !k.includes('<') && !k.includes('>') && !k.includes('low') && !k.includes('high')) ||
        keys.find(k => normalizeKey(k).includes('cost'));

    const categoryKey = keys.find(k => normalizeKey(k).includes('category')) ||
        keys.find(k => normalizeKey(k).includes('type'));

    const arabicNameKey = keys.find(k => normalizeKey(k).includes('arabic') && normalizeKey(k).includes('name')) ||
        keys.find(k => normalizeKey(k) === 'arabic name');

    const descriptionKey = keys.find(k => normalizeKey(k).includes('description')) ||
        keys.find(k => normalizeKey(k).includes('details')) ||
        keys.find(k => normalizeKey(k).includes('about'));

    const dimensionsKey = keys.find(k => normalizeKey(k).includes('dimension'));
    const collectionKey = keys.find(k => normalizeKey(k).includes('collection'));
    const targetMarketKey = keys.find(k => normalizeKey(k).includes('target') && normalizeKey(k).includes('market')) || keys.find(k => normalizeKey(k).includes('target'));
    const bulkDiscountKey = keys.find(k => normalizeKey(k).includes('discount') && (normalizeKey(k).includes('25') || normalizeKey(k).includes('>')));
    const availableKey = keys.find(k => normalizeKey(k).includes('availab'));
    const hiddenKey = keys.find(k => normalizeKey(k) === 'hidden');
    const colorsKey = keys.find(k => normalizeKey(k).includes('color'));
    const galleryKey = keys.find(k => normalizeKey(k) === 'gallery');

    if (!productKey) {
        showError("Could not find a 'Product Name' column.");
        return;
    }

    allProducts = data.map((item, index) => {
        let extractedImage = imageKey ? item[imageKey] : null;

        // Handle hidden JSON payloads in empty column names
        if (!extractedImage || String(extractedImage).trim() === '') {
            for (let key in item) {
                if (item[key] && typeof item[key] === 'string' && item[key].includes('{"action"')) {
                    try {
                        let parsed = JSON.parse(item[key]);
                        if (parsed.image) {
                            extractedImage = parsed.image;
                            break;
                        }
                    } catch (e) { }
                }
            }
        }

        const product = {
            name: item[productKey],
            no: noKey ? item[noKey] : `ITEM-${index + 1}`,
            image: extractedImage,
            link: linkKey ? item[linkKey] : null,
            price: (retailPriceKey ? item[retailPriceKey] : null) || item[priceKey] || null,
            category: categoryKey ? item[categoryKey] : null,
            arabicName: arabicNameKey ? item[arabicNameKey] : null,
            description: descriptionKey ? item[descriptionKey] : null,
            dimensions: dimensionsKey ? item[dimensionsKey] : null,
            collection: collectionKey ? item[collectionKey] : null,
            targetMarket: targetMarketKey ? item[targetMarketKey] : null,
            bulkPrice: wholesalePriceKey ? item[wholesalePriceKey] : null,
            bulkDiscount: bulkDiscountKey ? item[bulkDiscountKey] : null,
            available: (availableKey && item[availableKey] && String(item[availableKey]).trim() !== '') ? item[availableKey] : 'Yes',
            hidden: hiddenKey ? (String(item[hiddenKey]).toLowerCase() === 'yes' || String(item[hiddenKey]).toLowerCase() === 'true' || String(item[hiddenKey]) === '1') : false,
            colors: (colorsKey && item[colorsKey]) ? String(item[colorsKey]).split(',').map(c => c.trim()).filter(c => c) : [],
            gallery: (function() {
                try {
                    const raw = (galleryKey && item[galleryKey]) ? String(item[galleryKey]).trim() : '';
                    return raw.startsWith('{') ? JSON.parse(raw) : {};
                } catch(e) { return {}; }
            })(),
            index: index
        };

        // Calculate discount percentage if both prices are available (Retail > Wholesale)
        if (product.price && product.bulkPrice) {
            const pRetail = parseFloat(String(product.price).replace(/[^\d.]/g, ''));
            const pWholesale = parseFloat(String(product.bulkPrice).replace(/[^\d.]/g, ''));
            if (!isNaN(pRetail) && !isNaN(pWholesale) && pRetail > pWholesale) {
                product.calculatedDiscount = Math.round(((pRetail - pWholesale) / pRetail) * 100);
            }
        }

        product._searchData = {
            name: (product.name || '').toLowerCase(),
            arabicName: normalizeArabic(product.arabicName),
            no: String(product.no || '').toLowerCase(),
            category: (product.category || '').toLowerCase(),
        };
        return product;
    }).filter(p => {
        if (p.hidden) return false;
        if (!p.name || p.name === '-' || p.name.toLowerCase().includes('placeholder')) return false;

        const avail = String(p.available || 'yes').trim().toLowerCase();
        if (['no', 'false', '0', 'inactive', 'hidden'].includes(avail)) return false;

        return true;
    }).reverse();

    window.allProducts = allProducts;
    if (window.setChatbotProducts) {
        window.setChatbotProducts(allProducts);
    }
    window.lastRawData = data; // Save for language switch re-processing

    const fuseOptions = {
        keys: [
            { name: 'name', weight: 1.0 },
            { name: 'arabicName', weight: 1.0 },
            { name: 'no', weight: 0.8 },
            { name: 'category', weight: 0.6 },
            { name: 'price', weight: 0.4 },
            { name: '_searchData.name', weight: 0.9 },
            { name: '_searchData.arabicName', weight: 0.9 }
        ],
        threshold: 0.4,
        ignoreLocation: true,
        useExtendedSearch: true,
        distance: 100
    };
    fuse = new Fuse(allProducts, fuseOptions);

    fuse = new Fuse(allProducts, fuseOptions);

    populateCategoryDropdown();

    renderProducts(allProducts);

    loadingEl.classList.add('hidden');
    controlsEl.classList.remove('hidden');
    productGrid.classList.remove('hidden');
    setupFilter();
}

let currentlyRendered = 0;
const BATCH_SIZE = 10;
let currentProducts = [];
let renderTimeouts = [];

function renderProducts(products) {
    // Clear any pending render timeouts to prevent duplication
    renderTimeouts.forEach(clearTimeout);
    renderTimeouts = [];

    productGrid.innerHTML = '';
    currentProducts = products;
    currentlyRendered = 0;

    if (products.length === 0) {
        productGrid.innerHTML = '<p class="stats" style="grid-column: 1/-1; text-align: center; padding: 2rem;">No products found.</p>';
        productCountEl.textContent = '0 items';
        return;
    }

    productCountEl.textContent = `${products.length} item${products.length !== 1 ? 's' : ''}`;
    renderBatch();
    setupLazyLoading();
}

function renderBatch() {
    if (currentlyRendered >= currentProducts.length) return;

    const start = currentlyRendered;
    const end = Math.min(start + BATCH_SIZE, currentProducts.length);
    const batch = currentProducts.slice(start, end);

    currentlyRendered = end; // Increment immediately to prevent duplicate batch calls

    batch.forEach((product, index) => {
        const timeoutId = setTimeout(() => {
            const card = createCard(product, start + index);
            productGrid.appendChild(card);

            if (index === batch.length - 1) {
                if (window.lucide) lucide.createIcons();
                setupSentinel();
            }
        }, index * 150);
        renderTimeouts.push(timeoutId);
    });
}

function setupSentinel() {
    const oldSentinel = document.getElementById('lazy-load-sentinel');
    if (oldSentinel) oldSentinel.remove();

    if (currentlyRendered < currentProducts.length) {
        const sentinel = document.createElement('div');
        sentinel.id = 'lazy-load-sentinel';
        sentinel.style.gridColumn = '1/-1';
        sentinel.style.height = '60px';
        sentinel.style.margin = '2rem 0';
        productGrid.appendChild(sentinel);

        if (lazyLoadObserver) {
            lazyLoadObserver.observe(sentinel);
        }
    }
}

let lazyLoadObserver = null;

function setupLazyLoading() {
    if (lazyLoadObserver) {
        lazyLoadObserver.disconnect();
    }

    lazyLoadObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting && currentlyRendered < currentProducts.length) {
                const sentinel = document.getElementById('lazy-load-sentinel');
                if (sentinel) {
                    sentinel.remove();
                }
                renderBatch();
            }
        });
    }, {
        rootMargin: '400px'
    });

    const sentinel = document.getElementById('lazy-load-sentinel');
    if (sentinel) {
        lazyLoadObserver.observe(sentinel);
    }
}

function createCard(product, uiIndex) {
    const t = translations[currentLang || 'en'];
    const article = document.createElement('article');
    article.className = 'card fade-in-up';
    article.style.animationDelay = `${Math.min(uiIndex * 0.05, 1)}s`;

    // Image Prioritization: 
    // 1. Google Drive ID (Instant access for new products)
    // 2. Base64 (Rare/Immediate)
    // 3. GitHub Assets (Standard naming convention)
    const driveId = extractDriveId(product.image);
    let imageSrc = `${ASSETS_BASE_URL}${product.no}.jpg`;

    if (driveId) {
        imageSrc = `https://lh3.googleusercontent.com/d/${driveId}`;
    } else if (product.image && product.image.length > 200 && !product.image.startsWith('http')) {
        let cleanBase64 = product.image.replace(/\s+/g, '');
        imageSrc = cleanBase64.startsWith('data:') ? cleanBase64 : `data:image/jpeg;base64,${cleanBase64}`;
    }

    const imgId = `img-${product.index}`;
    const noLinkPlaceholder = `data:image/svg+xml;charset=UTF-8,%3Csvg%20width%3D%22800%22%20height%3D%22600%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Crect%20width%3D%22100%25%22%20height%3D%22100%25%22%20fill%3D%22%23f1f5f9%22%2F%3E%3Ctext%20x%3D%2250%25%22%20y%3D%2250%25%22%20font-family%3D%22sans-serif%22%20font-size%3D%2220%22%20font-weight%3D%22bold%22%20fill%3D%22%2394a3b8%22%20text-anchor%3D%22middle%22%20dy%3D%22.3em%22%3E${encodeURIComponent(t.noPreview)}%3C%2Ftext%3E%3C%2Fsvg%3E`;

    // Image Fallbacks logic
    const secondaryFallback = driveId ? `https://lh3.googleusercontent.com/d/${driveId}` : `${ASSETS_BASE_URL}${product.no}.jpg`;

    const displayName = (currentLang === 'ar' && product.arabicName) ? product.arabicName : product.name;
    const secondaryName = (currentLang === 'ar') ? product.name : product.arabicName;

    const displayCategory = translateValue('category', product.category);
    const displayCollection = translateValue('collection', product.collection);
    const displayDimensions = translateValue('dimensions', product.dimensions);
    const displayTargetMarket = translateValue('targetMarket', product.targetMarket);
    const displayDescription = (translateValue('description', product.description) || '').trim();

    article.innerHTML = `
        <div class="collapsed-view">
            <div class="card-image-container">
                <img 
                    src="${imageSrc}" 
                    alt="${product.name}" 
                    class="product-image"
                    id="${imgId}"
                    loading="lazy"
                    referrerpolicy="no-referrer"
                    onerror="handleImageError(this, '${secondaryFallback}', '${product.name}', '${product.no}', '${driveId || ''}')"
                >
            </div>
            <div class="card-content">
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 0.5rem;">
                    <span class="card-number" style="font-size: 0.75rem; color: var(--text-secondary); background: #f1f5f9; padding: 2px 6px; border-radius: 4px;">#${product.no}</span>
                    <button 
                        class="add-to-cart-btn-mini ${String(product.available).toLowerCase() === 'no' ? 'disabled' : ''}" 
                        onclick="event.stopPropagation(); ${String(product.available).toLowerCase() === 'no' ? '' : `addToCart(${product.index}, this)`}" 
                        title="${String(product.available).toLowerCase() === 'no' ? t.oos : t.addToCart}"
                        ${String(product.available).toLowerCase() === 'no' ? 'disabled' : ''}
                    >
                        <i data-lucide="${String(product.available).toLowerCase() === 'no' ? 'x-circle' : 'shopping-cart'}" style="width: 14px;"></i> 
                        ${String(product.available).toLowerCase() === 'no' ? ' ' + t.oos : ' + ' + t.addToCart}
                    </button>
                </div>
                <h2 class="card-title">${displayName}</h2>
                ${secondaryName ? `<p class="card-arabic-name">${secondaryName}</p>` : ''}
                ${displayCategory ? `<div class="card-category"><i data-lucide="tag" style="width: 14px;"></i> ${displayCategory}</div>` : ''}
            </div>
            <div class="card-footer">
        ${(() => {
            return `<span class="card-price"><small style="font-size:0.65rem; color:var(--text-secondary); display:block; line-height:1;">${t.priceLabel}</small>${formatPrice(product.price)}</span>`;
        })()}
                ${String(product.available).toLowerCase() !== 'no' ?
            `<span class="stock-badge in-stock"><i data-lucide="package" style="width: 14px;"></i> ${t.inStock}</span>` :
            `<span class="stock-badge out-stock"><i data-lucide="x-circle" style="width: 14px;"></i> ${t.oos}</span>`}
                <i data-lucide="shield-check" style="margin-left: auto; width: 16px; color: var(--accent);"></i>
            </div>
        </div>

        <div class="expanded-content">
            <div class="expanded-info">
                <button class="expanded-close" title="Close Details" onclick="event.stopPropagation(); this.closest('.card').classList.remove('expanded');"><i data-lucide="x"></i></button>
                
                <div class="expanded-image-container">
                    <div class="zoom-controls">
                        <button class="zoom-btn" onclick="changeZoom(this, 0.2)" title="Zoom In"><i data-lucide="plus"></i></button>
                        <button class="zoom-btn" onclick="changeZoom(this, -0.2)" title="Zoom Out"><i data-lucide="minus"></i></button>
                        <button class="zoom-btn" onclick="resetZoom(this)" title="Reset Zoom"><i data-lucide="maximize"></i></button>
                        <button class="zoom-btn" onclick="openLightbox(this)" title="Show Full Image"><i data-lucide="expand"></i></button>
                    </div>
                    <img 
                        src="${imageSrc}" 
                        alt="${product.name}" 
                        class="expanded-image"
                        data-zoom="1"
                        onerror="handleImageError(this, '${secondaryFallback}', '${product.name}', '${product.no}', '${driveId || ''}')"
                    >
                </div>
                
                <div class="expanded-gallery">
                    <div class="gallery-thumb active" onclick="switchGalleryImage(this)">
                        <img src="${imageSrc}" onerror="handleGalleryImageError(this, '${product.no}', '')">
                    </div>
                    ${[1, 2, 3, 4, 5].map(num => `
                        <div class="gallery-thumb" onclick="switchGalleryImage(this)">
                            <img src="${ASSETS_BASE_URL}${product.no}_${num}.jpg" 
                                 data-suffix="_${num}"
                                 data-gallery='${JSON.stringify(product.gallery)}'
                                 onerror="handleGalleryImageError(this, '${product.no}', '_${num}')">
                        </div>
                    `).join('')}
                </div>

                <div style="display: flex; align-items: baseline; gap: 1rem; flex-wrap: wrap; margin-bottom: 0.5rem;">
                    <h2 class="expanded-title" style="margin: 0;">${displayName}</h2>
                    ${String(product.available).toLowerCase() !== 'no' ?
            `<span class="stock-badge in-stock"><i data-lucide="package" style="width: 14px;"></i> ${t.inStock}</span>` :
            `<span class="stock-badge out-stock"><i data-lucide="x-circle" style="width: 14px;"></i> ${t.oos}</span>`}
                </div>
                <div style="display: flex; align-items: center; gap: 0.8rem; margin-bottom: 1rem;">
                    <span class="card-number" style="font-size: 1rem; padding: 0.4rem 0.8rem; background: #f1f5f9; border-radius: 8px; color: var(--text-primary);">No: ${product.no}</span>
                    <button class="copy-btn" onclick="event.stopPropagation(); copyToClipboard('${product.no}', this)" title="Copy Item Number">
                        <i data-lucide="copy" style="width: 14px;"></i> ${t.copy}
                    </button>
                    ${product.link ? `<a href="${product.link}" target="_blank" class="view-doc-btn" title="${t.viewDoc}"><i data-lucide="file-text"></i></a>` : ''}
                </div>
                ${secondaryName ? `<p class="expanded-arabic-name">${secondaryName}</p>` : ''}
                
                <div class="expanded-grid">
                    ${displayCategory ? `<div class="expanded-meta"><strong>${t.categoryLabel}</strong> <span>${displayCategory}</span></div>` : ''}
                    ${displayCollection ? `<div class="expanded-meta"><strong>${t.collectionLabel}</strong> <span>${displayCollection}</span></div>` : ''}
                    ${displayDimensions ? `<div class="expanded-meta"><strong>${t.dimensionsLabel}</strong> <span>${displayDimensions}</span></div>` : ''}
                    ${displayTargetMarket ? `<div class="expanded-meta"><strong>${t.targetMarketLabel}</strong> <span>${displayTargetMarket}</span></div>` : ''}
                </div>

                <div class="expanded-description">
                    <strong style="display: block; margin-bottom: 0.5rem; color: var(--text-primary);">${t.descriptionLabel}</strong>${displayDescription || t.noDesc}
                </div>
                
                ${product.colors && product.colors.length > 0 ? `
                <div class="colors-section" style="margin: 2rem 0; padding: 1.5rem; background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%); border-radius: 20px; border: 1px solid var(--card-border); position: relative; overflow: hidden; box-shadow: inset 0 2px 4px rgba(0,0,0,0.02);">
                    <div class="colors-title" style="display: flex; align-items: center; gap: 0.6rem; font-size: 0.85rem; font-weight: 800; color: var(--text-primary); margin-bottom: 1.2rem; text-transform: uppercase; letter-spacing: 0.12em;">
                        <i data-lucide="palette" style="width: 16px; color: var(--accent);"></i> ${t.selectColor}
                    </div>
                    <div class="color-list" style="display: flex; flex-wrap: wrap; gap: 1rem; position: relative; z-index: 1;">
                        ${product.colors.map((color, idx) => {
                const cssColor = color.toLowerCase().replace(/\s+/g, '');
                const isWhite = cssColor === 'white' || cssColor === '#ffffff';
                const isFirst = idx === 0;
                if (isFirst) article.dataset.selectedColor = color;
                const displayColorName = translateValue('colors', color);
                const badgeStyle = `
                                    display: flex;
                                    align-items: center;
                                    gap: 0.8rem;
                                    padding: 0.6rem 1.2rem;
                                    background: #ffffff;
                                    border: 1px solid var(--card-border);
                                    border-left: 5px solid ${isWhite ? '#e2e8f0' : cssColor};
                                    border-radius: 12px;
                                    font-size: 0.95rem;
                                    font-weight: 800;
                                    color: ${isWhite ? '#475569' : cssColor};
                                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
                                    cursor: pointer;
                                    transition: all 0.3s ease;
                                `;
                return `
                                <div class="color-badge ${isFirst ? 'selected' : ''}" 
                                     style="${badgeStyle.replace(/\n\s*/g, ' ')} --badge-color: ${isWhite ? '#94a3b8' : cssColor}" 
                                     onclick="event.stopPropagation(); selectColor(this, '${color}')"
                                     onmouseover="if(!this.classList.contains('selected')) this.style.transform='translateY(-5px)';" 
                                     onmouseout="if(!this.classList.contains('selected')) this.style.transform='none';">
                                    <span class="color-dot" style="width: 24px; height: 24px; border-radius: 6px; background-color: ${cssColor}; box-shadow: 0 2px 4px rgba(0,0,0,0.1); flex-shrink: 0; position: relative;"></span>
                                    <span class="color-name">${displayColorName}</span>
                                </div>
                            `;
            }).join('')}
                    </div>
                </div>
                ` : ''}
                
                <div class="expanded-pricing">
                    ${(() => {
            const pRetail = parseFloat(String(product.price).replace(/[^\d.]/g, '')) || 0;
            const pWholesale = parseFloat(String(product.bulkPrice).replace(/[^\d.]/g, '')) || 0;
            const hasWholesale = pWholesale > 0 && pWholesale < pRetail;
            const activePriceLabel = hasWholesale ? t.retailPrice : t.priceLabel;

            let pricingHtml = `
                        <div class="main-price">
                            <div class="price-info-block">
                                <span class="label">${activePriceLabel}</span>
                                <span class="value">${product.price ? formatPrice(product.price) : 'Price on request'}</span>
                            </div>
                        </div>
                    `;

            if (hasWholesale) {
                pricingHtml += `
                            <div class="bulk-price">
                                <div class="price-info-block">
                                    <span class="label">${t.bulkSaving}</span>
                                    <span class="value">${formatPrice(product.bulkPrice)}</span>
                                </div>
                                ${product.calculatedDiscount ? `
                                    <div class="discount-badge">
                                        <span class="discount-percent">${product.calculatedDiscount}%</span>
                                        <span class="discount-off">OFF</span>
                                    </div>
                                ` : ''}
                            </div>
                        `;
            }
            return pricingHtml;
        })()}
                    ${product.bulkDiscount ? `
                        <div class="bulk-discount">
                            <span class="label">Bulk Discount:</span>
                            <span class="value">${product.bulkDiscount}</span>
                        </div>
                    ` : ''}
                </div>

                <div class="expanded-footer" style="display: flex; justify-content: space-between; align-items: center; width: 100%; gap: 1rem;">
                    <button 
                        class="add-to-cart-btn ${String(product.available).toLowerCase() === 'no' ? 'disabled' : ''}" 
                        onclick="${String(product.available).toLowerCase() === 'no' ? '' : `addToCart(${product.index}, this)`}"
                        ${String(product.available).toLowerCase() === 'no' ? 'disabled' : ''}
                    >
                        <i data-lucide="${String(product.available).toLowerCase() === 'no' ? 'x-circle' : 'shopping-cart'}" style="width: 18px;"></i> 
                        ${String(product.available).toLowerCase() === 'no' ? t.oos : t.addToCart}
                    </button>
                    <!-- Link moved up and shrunk as requested -->
                </div>
            </div>
        </div>
    `;

    article.addEventListener('click', (e) => {
        if (e.target.closest('.copy-btn') || e.target.closest('.view-doc-btn') || e.target.closest('.add-to-cart-btn-mini') || e.target.closest('.add-to-cart-btn')) return;

        const isCloseBtn = e.target.closest('.expanded-close');
        const isExpanded = article.classList.contains('expanded');

        if (isCloseBtn || (isExpanded && !e.target.closest('.expanded-content'))) {
            article.classList.remove('expanded');
            article.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            return;
        }

        if (!isExpanded) {
            document.querySelectorAll('.card.expanded').forEach(c => c.classList.remove('expanded'));
            article.classList.add('expanded');
            if (window.lucide) lucide.createIcons();
            setTimeout(() => {
                const headerOffset = 100;
                const elementPosition = article.getBoundingClientRect().top;
                const offsetPosition = elementPosition + window.pageYOffset - headerOffset;
                window.scrollTo({
                    top: offsetPosition,
                    behavior: "smooth"
                });
            }, 100);
        }
    });

    return article;
}

window.handleImageError = function (img, fallback, productName, itemNo, driveId) {
    if (!img.dataset.retries) img.dataset.retries = 0;
    let retryCount = parseInt(img.dataset.retries);

    // 1. Try alternate local extensions
    if (retryCount === 0) {
        img.dataset.retries = 1;
        img.src = `${ASSETS_BASE_URL}${itemNo}.png`;
        img.onerror = () => {
            img.dataset.retries = 2;
            img.src = `${ASSETS_BASE_URL}${itemNo}.webp`;
            img.onerror = () => {
                // If .webp fails, proceed to cloud fallback logic (retryCount 2 in original logic)
                // This will now be handled by the next `if` block, as `retryCount` is 2.
                handleImageError(img, fallback, productName, itemNo, driveId);
            };
        };
        return;
    }

    // 2. Cloud Fallback: Try stable LH3 link for product images
    if (retryCount === 2) {
        img.dataset.retries = 3;
        const currentDriveId = driveId || extractDriveId(fallback);
        if (currentDriveId) {
            img.src = `https://lh3.googleusercontent.com/d/${currentDriveId}`;
            return;
        }
        img.src = fallback;
        return;
    }

    // 3. Last backup: Drive Thumbnail
    if (retryCount === 3) {
        img.dataset.retries = 4;
        const currentDriveId = driveId || extractDriveId(img.src) || extractDriveId(fallback);
        if (currentDriveId) {
            img.src = `https://drive.google.com/thumbnail?id=${currentDriveId}&sz=w1000`;
            return;
        }
    }

    // 4. Ultimate Failure SVG
    img.onerror = null;
    img.src = 'data:image/svg+xml;charset=UTF-8,%3Csvg%20width%3D%22800%22%20height%3D%22600%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Crect%20width%3D%22100%25%22%20height%3D%22100%25%22%20fill%3D%22%23fee2e2%22%2F%3E%3Ctext%20x%3D%2250%25%22%20y%3D%2250%25%22%20font-family%3D%22sans-serif%22%20font-size%3D%2220%22%20fill%3D%22%23ef4444%22%20text-anchor%3D%22middle%22%20dy%3D%22.3em%22%3EAccess%20Denied%20/%20Private%3C%2Ftext%3E%3C%2Fsvg%3E';
    img.style.objectFit = 'contain';
    img.parentElement.style.padding = '1.5rem';
    console.warn(`Persistent preview error for: ${productName}.`);
};

window.switchGalleryImage = function (btn) {
    const card = btn.closest('.card');
    const mainImg = card.querySelector('.expanded-image');
    const thumbImg = btn.querySelector('img');
    if (mainImg && thumbImg) {
        mainImg.style.opacity = '0';
        setTimeout(() => {
            mainImg.src = thumbImg.src;
            mainImg.style.transform = 'scale(1)';
            mainImg.dataset.zoom = '1';
            mainImg.style.opacity = '1';
        }, 150);
    }
    // Update active state
    card.querySelectorAll('.gallery-thumb').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
};

window.handleGalleryImageError = function (img, itemNo, suffix) {
    if (!img.dataset.retries) img.dataset.retries = '0';
    let retries = parseInt(img.dataset.retries);

    // 1. Try alternate formats
    if (retries === 0) {
        img.dataset.retries = '1';
        img.src = `${ASSETS_BASE_URL}${itemNo}${suffix}.png`;
        return;
    } 
    if (retries === 1) {
        img.dataset.retries = '2';
        img.src = `${ASSETS_BASE_URL}${itemNo}${suffix}.webp`;
        return;
    }

    // 2. Try Google Drive Fallback (Instant access)
    if (retries === 2) {
        img.dataset.retries = '3';
        try {
            const galleryData = JSON.parse(img.dataset.gallery || '{}');
            const index = suffix.replace(/[^0-9]/g, '');
            const driveId = galleryData[index];
            if (driveId) {
                img.src = `https://lh3.googleusercontent.com/d/${driveId}`;
                return;
            }
        } catch(e) {}
    }

    // 3. Hide if all fail
    if (suffix !== '') {
        const thumb = img.closest('.gallery-thumb');
        if (thumb) thumb.style.display = 'none';
    }
};

function updateDisplay() {
    const term = searchInput.value;
    const sortBy = sortSelect.value;
    const categoryFilter = categorySelect.value;

    let filtered = [...allProducts];

    if (categoryFilter !== 'all') {
        filtered = filtered.filter(p => p.category === categoryFilter);
    }

    if (term.trim() !== '') {
        const fuseInstance = new Fuse(filtered, fuse.options);
        const searchResults = fuseInstance.search(term);
        filtered = searchResults.map(result => result.item);

        if (filtered.length === 0) {
            const lowerTerm = term.toLowerCase().trim();
            const normalizedTerm = normalizeArabic(term);
            const subFilter = (categoryFilter === 'all' ? allProducts : allProducts.filter(p => p.category === categoryFilter));
            filtered = subFilter.filter(p =>
                p.name.toLowerCase().includes(lowerTerm) ||
                String(p.no).toLowerCase().includes(lowerTerm) ||
                (p.arabicName && normalizeArabic(p.arabicName).includes(normalizedTerm)) ||
                (p.category && p.category.toLowerCase().includes(lowerTerm))
            );
        }
    }

    const sorted = sortProducts(filtered, sortBy);
    renderProducts(sorted);
}

function setupFilter() {
    categorySelect.addEventListener('change', () => {
        updateDisplay();
    });
}

function setupSearch() {
    if (searchInput && searchClear) {
        searchInput.addEventListener('input', () => {
            if (searchInput.value.trim() !== '') {
                searchClear.classList.add('visible');
            } else {
                searchClear.classList.remove('visible');
            }
            updateDisplay();
        });

        searchClear.addEventListener('click', () => {
            searchInput.value = '';
            searchClear.classList.remove('visible');
            searchInput.focus();
            updateDisplay();
        });
    }
}

window.copyToClipboard = function (text, btn) {
    const t = translations[currentLang || 'en'];
    navigator.clipboard.writeText(text).then(() => {
        const originalHtml = btn.innerHTML;
        btn.classList.add('copied');
        btn.innerHTML = `<i data-lucide="check" style="width: 14px;"></i> ${t.copied}`;
        if (window.lucide) lucide.createIcons();
        setTimeout(() => {
            btn.classList.remove('copied');
            btn.innerHTML = originalHtml;
            if (window.lucide) lucide.createIcons();
        }, 2000);
    }).catch(err => {
        console.error('Failed to copy:', err);
    });
};

function showError(msg) {
    loadingEl.classList.add('hidden');
    controlsEl.classList.add('hidden');
    errorEl.classList.remove('hidden');
    errorText.textContent = msg;
    console.error(msg);
}

// Initialize the application after all functions are defined
// Moved to bottom to ensure all hoisted/global functions are available


function sortProducts(products, sortBy) {
    const sorted = [...products];
    switch (sortBy) {
        case 'name-asc':
            sorted.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
            break;
        case 'name-desc':
            sorted.sort((a, b) => (b.name || '').localeCompare(a.name || ''));
            break;
        case 'price-asc':
            sorted.sort((a, b) => (parseFloat(a.price) || 0) - (parseFloat(b.price) || 0));
            break;
        case 'price-desc':
            sorted.sort((a, b) => (parseFloat(b.price) || 0) - (parseFloat(a.price) || 0));
            break;
        case 'category-asc':
            sorted.sort((a, b) => (a.category || '').localeCompare(b.category || ''));
            break;
        case 'category-desc':
            sorted.sort((a, b) => (b.category || '').localeCompare(a.category || ''));
            break;
        case 'arabic-asc':
            sorted.sort((a, b) => (a.arabicName || '').localeCompare(b.arabicName || '', 'ar'));
            break;
        case 'arabic-desc':
            sorted.sort((a, b) => (b.arabicName || '').localeCompare(a.arabicName || '', 'ar'));
            break;
    }
    return sorted;
}

function setupSort() {
    sortSelect.addEventListener('change', () => {
        updateDisplay();
    });
}

function setupBackToTop() {
    window.addEventListener('scroll', () => {
        if (window.scrollY > 500) {
            backToTopBtn.classList.remove('hidden');
        } else {
            backToTopBtn.classList.add('hidden');
        }
    });

    backToTopBtn.addEventListener('click', () => {
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    });
}

// Cart Logic
function setupCart() {
    const floatingCart = document.getElementById('floating-cart');
    const closeCart = document.getElementById('close-cart');
    const cartOverlay = document.getElementById('cart-overlay');
    const clearCartBtn = document.getElementById('clear-cart-btn-header'); // Fixed ID from index.html
    const checkoutBtn = document.getElementById('checkout-btn');

    if (floatingCart) floatingCart.addEventListener('click', toggleCart);
    if (closeCart) closeCart.addEventListener('click', toggleCart);
    if (cartOverlay) cartOverlay.addEventListener('click', toggleCart);

    // Checkout button logic is now handled directly via onclick in index.html for reliability

    if (clearCartBtn) {
        clearCartBtn.addEventListener('click', () => {
            emptyCart();
        });
    }

    updateCartUI();
}

function toggleCart() {
    document.getElementById('cart-drawer').classList.toggle('open');
    document.getElementById('cart-overlay').classList.toggle('open');
}

function closeCart() {
    document.getElementById('cart-drawer').classList.remove('open');
    document.getElementById('cart-overlay').classList.remove('open');
}
window.closeCart = closeCart;

window.addToCart = function (productIndex, btn) {
    const t = translations[currentLang || 'en'];
    const product = allProducts.find(p => p.index === productIndex);
    if (!product || String(product.available).toLowerCase() === 'no') return;

    const card = btn.closest('.card');
    const selectedColor = card.dataset.selectedColor || null;

    const existingItem = cart.find(item => item.index === productIndex && item.color === selectedColor);
    if (existingItem) {
        existingItem.quantity += 1;
    } else {
        cart.push({
            index: product.index,
            name: product.name,
            no: product.no,
            price: product.price,       // Retail Price
            bulkPrice: product.bulkPrice, // Wholesale Price
            image: product.image,
            color: selectedColor,
            quantity: 1
        });
    }

    saveCart();
    updateCartUI();

    // Visual feedback
    const originalContent = btn.innerHTML;
    btn.innerHTML = `<i data-lucide="check" style="width: 14px;"></i> ${t.added}`;
    if (btn.classList.contains('add-to-cart-btn-mini')) {
        btn.innerHTML = `<i data-lucide="check" style="width: 14px;"></i>`;
    }
    btn.classList.add('added');
    if (window.lucide) lucide.createIcons();

    setTimeout(() => {
        btn.innerHTML = originalContent;
        btn.classList.remove('added');
        if (window.lucide) lucide.createIcons();
    }, 2000);
};

window.updateQty = function (index, delta, color) {
    const item = cart.find(i => i.index === index && (i.color || "") === color);
    if (!item) return;

    item.quantity += delta;
    if (item.quantity <= 0) {
        cart = cart.filter(i => !(i.index === index && (i.color || "") === color));
    }

    saveCart();
    updateCartUI();
};

window.removeFromCart = function (index, color) {
    cart = cart.filter(i => !(i.index === index && (i.color || "") === color));
    saveCart();
    updateCartUI();
};

function saveCart() {
    localStorage.setItem('cr_cart', JSON.stringify(cart));
}

/**
 * Shows a custom premium modal
 * @param {string} title 
 * @param {string} message 
 * @param {object} options { type: 'success'|'warning', confirmText: string, cancelText: string, onConfirm: function }
 */
function showModal({ title, message, type = 'warning', confirmText = 'Confirm', cancelText = 'Cancel', onConfirm = null }) {
    const modal = document.getElementById('confirm-modal');
    const titleEl = document.getElementById('modal-title');
    const messageEl = document.getElementById('modal-message');
    const confirmBtn = document.getElementById('modal-confirm-btn');
    const cancelBtn = document.getElementById('modal-cancel-btn');
    const iconBox = document.getElementById('modal-icon-box');

    titleEl.textContent = title;
    messageEl.textContent = message;
    confirmBtn.textContent = confirmText;

    // Reset classes
    iconBox.className = 'modal-icon-container ' + type;
    confirmBtn.className = 'modal-btn primary ' + (type === 'success' ? 'success-btn' : '');

    // Set Icon
    const iconName = type === 'success' ? 'check' : 'x-circle';
    iconBox.innerHTML = `<i data-lucide="${iconName}" id="modal-icon"></i>`;

    if (onConfirm) {
        cancelBtn.style.display = 'block';
        cancelBtn.textContent = cancelText;
    } else {
        cancelBtn.style.display = 'none';
    }

    const closeModal = () => {
        modal.classList.remove('open');
    };

    const handleConfirm = () => {
        if (onConfirm) onConfirm();
        closeModal();
    };

    // Remove old listeners to avoid duplicates
    const newConfirmBtn = confirmBtn.cloneNode(true);
    const newCancelBtn = cancelBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
    cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);

    newConfirmBtn.addEventListener('click', handleConfirm);
    newCancelBtn.addEventListener('click', closeModal);
    modal.onclick = (e) => {
        if (e.target === modal) closeModal();
    };

    modal.classList.add('open');
    if (window.lucide) lucide.createIcons();
}



function emptyCart() {
    const t = translations[currentLang || 'en'];
    if (cart.length === 0) {
        showModal({
            title: t.cartAlreadyEmptyMsg,
            message: t.cartAlreadyEmptyMsg, // Simplified
            type: "success",
            confirmText: t.ok
        });
        return;
    }

    showModal({
        title: t.confirmClearTitle,
        message: t.confirmClearMsg,
        type: "warning",
        confirmText: t.clearAll,
        cancelText: t.keepItems,
        onConfirm: () => {
            cart.length = 0;
            saveCart();
            updateCartUI();

            // Show success modal after clearing
            setTimeout(() => {
                showModal({
                    title: t.cartClearedTitle,
                    message: t.cartClearedMsg,
                    type: "success",
                    confirmText: t.done
                });
            }, 400);
        }
    });
}
window.emptyCart = emptyCart;



function updateCartUI() {
    const t = translations[currentLang || 'en'];
    const cartItemsContainer = document.getElementById('cart-items');
    const cartCount = document.getElementById('cart-count');
    const cartTotalValue = document.getElementById('cart-total-value');

    const totalCount = cart.reduce((sum, item) => sum + item.quantity, 0);
    if (cartCount) {
        cartCount.textContent = totalCount;
        cartCount.style.display = totalCount > 0 ? 'flex' : 'none';
    }

    if (cart.length === 0) {
        if (cartItemsContainer) cartItemsContainer.innerHTML = `<p id="cart-empty-msg" style="text-align: center; color: var(--text-secondary); margin-top: 2rem;">${t.cartEmpty}</p>`;
        if (cartTotalValue) cartTotalValue.textContent = formatPrice(0);
        return;
    }

    let total = 0;

    // Group quantities by product Item Number (no) to determine tiered pricing across variants (colors)
    const productQuantities = {};
    cart.forEach(item => {
        productQuantities[item.no] = (productQuantities[item.no] || 0) + item.quantity;
    });

    cartItemsContainer.innerHTML = cart.map(item => {
        const totalQtyForProduct = productQuantities[item.no];
        const isWholesale = totalQtyForProduct >= 10;

        // Use bulkPrice (Wholesale) if qty >= 10, otherwise use price (Retail)
        const priceString = isWholesale && item.bulkPrice ? item.bulkPrice : item.price;
        const unitPrice = parseFloat(String(priceString).replace(/[^\d.]/g, '')) || 0;

        const subtotal = unitPrice * item.quantity;
        total += subtotal;

        // Image Logic: Try local first, then cloud fallbacks
        let localImg = `${ASSETS_BASE_URL}${item.no}.jpg`;
        let driveId = extractDriveId(item.image);
        const placeholder = `data:image/svg+xml;charset=UTF-8,%3Csvg%20width%3D%22200%22%20height%3D%22200%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Crect%20width%3D%22100%25%22%20height%3D%22100%25%22%20fill%3D%22%23f1f5f9%22%2F%3E%3C%2Fsvg%3E`;
        let cloudFallback = driveId ? `https://lh3.googleusercontent.com/d/${driveId}=w200` : placeholder;

        // Translate Product Name and Color
        let displayName = item.name;
        let displayColor = item.color; // Keep as is if English or undefined

        if (currentLang === 'ar') {
            // Find the original product to get Arabic name
            // Use 'no' (Item Number) as unique key
            const originalProduct = allProducts.find(p => p.no === item.no);
            if (originalProduct && originalProduct.arabicName) {
                displayName = originalProduct.arabicName;
            }
            // Translate Color
            if (item.color && typeof aiValueTranslations !== 'undefined' && aiValueTranslations.ar && aiValueTranslations.ar.colors) {
                displayColor = aiValueTranslations.ar.colors[item.color] || item.color;
            }
        }

        // Determine if we should show the "Applied" message
        const pRetail = parseFloat(String(item.price).replace(/[^\d.]/g, '')) || 0;
        const pWholesale = parseFloat(String(item.bulkPrice).replace(/[^\d.]/g, '')) || 0;
        const hasPriceDifference = pWholesale > 0 && Math.abs(pRetail - pWholesale) > 0.0001;

        return `
            <div class="cart-item">
                <img 
                    src="${localImg}" 
                    class="cart-item-img" 
                    alt="${displayName}"
                    referrerpolicy="no-referrer"
                    onerror="handleImageError(this, '${cloudFallback}', '${displayName.replace(/'/g, "\\'")}', '${item.no}', '${driveId || ''}')"
                >
                <div class="cart-item-info">
                    <div class="cart-item-title">${displayName} ${displayColor ? `<small style="color: var(--text-secondary);">(${displayColor})</small>` : ''}</div>
                    <div class="cart-item-price">
                        ${formatPrice(unitPrice)}  
                        ${hasPriceDifference ? (isWholesale && item.bulkPrice ? `<small style="display:block; font-size:0.7rem; color:#b45309;">${t.appliedBulk}</small>` : (item.price && !isWholesale ? `<small style="display:block; font-size:0.7rem; color:#059669;">${t.appliedRetail}</small>` : '')) : ''}
                    </div>
                    <div class="cart-item-controls">
                        <button class="qty-btn" onclick="updateQty(${item.index}, -1, '${item.color || ""}')"><i data-lucide="minus" style="width: 14px;"></i></button>
                        <span>${item.quantity}</span>
                        <button class="qty-btn" onclick="updateQty(${item.index}, 1, '${item.color || ""}')"><i data-lucide="plus" style="width: 14px;"></i></button>
                        <button class="remove-item" onclick="removeFromCart(${item.index}, '${item.color || ""}')"><i data-lucide="trash-2" style="width: 18px;"></i></button>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    cartTotalValue.textContent = formatPrice(total);
    if (window.lucide) lucide.createIcons();
}

function checkoutWhatsApp() {
    const t = translations[currentLang || 'en'];
    if (cart.length === 0) {
        showModal({
            title: t.cartEmptyCheckoutTitle,
            message: t.cartEmptyCheckoutMsg,
            type: "warning",
            confirmText: t.ok
        });
        return;
    }

    let message = `${t.waOrderHeader}\n\n`;
    let total = 0;

    // First calculate product quantities to determine pricing (bulk vs retail)
    const productQuantities = {};
    cart.forEach(item => {
        productQuantities[item.no] = (productQuantities[item.no] || 0) + item.quantity;
    });

    cart.forEach((item) => {
        const totalQtyForProduct = productQuantities[item.no];
        const isWholesale = totalQtyForProduct >= 10;
        const priceString = isWholesale && item.bulkPrice ? item.bulkPrice : item.price;
        const unitPrice = parseFloat(String(priceString).replace(/[^\d.]/g, '')) || 0;
        const subtotal = unitPrice * item.quantity;
        total += subtotal;

        message += `*${item.name}*\n`;
        message += `ID: ${item.no} | ${t.color}: ${item.color || t.defaultColor}\n`;
        message += `${t.qty}: ${item.quantity} ${t.pcs} x ${formatPrice(unitPrice)} = ${formatPrice(subtotal)}\n\n`;
    });

    message += `--------------------------\n`;
    message += `*${t.waOrderTotal} ${formatPrice(total)}*`;

    const encodedMessage = encodeURIComponent(message);

    // Original whatsapp link template that works better on mobile
    const whatsappUrl = `https://wa.me/962795965910?text=${encodedMessage}`;

    window.open(whatsappUrl, '_blank');
}
window.checkoutWhatsApp = checkoutWhatsApp;

window.openCardByNumber = function (itemNo) {
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.value = itemNo;
        // Trigger the input event to update display
        const event = new Event('input', { bubbles: true });
        searchInput.dispatchEvent(event);

        // Wait for search result to appear
        setTimeout(() => {
            const cards = document.querySelectorAll('.card');
            cards.forEach(card => {
                const title = card.querySelector('.card-title');
                // Check if card title contains the item number in brackets or similar pattern
                // Most cards show as "Name (No)" or have data-no
                if (card.innerHTML.includes(`ITEM #${itemNo}`) || card.innerHTML.includes(`#${itemNo}`)) {
                    card.click(); // Expand the card
                    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            });
        }, 300);
    }
};

window.selectColor = function (badge, color) {
    const section = badge.closest('.color-list');
    section.querySelectorAll('.color-badge').forEach(b => {
        b.classList.remove('selected');
        b.style.transform = 'none';
    });
    badge.classList.add('selected');
    badge.closest('.card').dataset.selectedColor = color;
};

window.changeZoom = function (btn, delta) {
    const container = btn.closest('.expanded-image-container');
    const img = container.querySelector('.expanded-image');
    if (!img) return;

    let currentScale = parseFloat(img.dataset.zoom || '1');
    let newScale = currentScale + delta;

    // Bounds check: 0.5x to 4x
    if (newScale < 0.5) newScale = 0.5;
    if (newScale > 4) newScale = 4;

    img.style.transform = `scale(${newScale})`;
    img.dataset.zoom = newScale;
};

window.resetZoom = function (btn) {
    const container = btn.closest('.expanded-image-container');
    const img = container.querySelector('.expanded-image');
    if (!img) return;

    img.style.transform = 'scale(1)';
    img.dataset.zoom = '1';
};

window.openLightbox = function (btn) {
    console.log("Attempting to open lightbox...");
    const container = btn.closest('.expanded-image-container');
    const mainImg = container ? container.querySelector('.expanded-image') : null;

    if (!mainImg) {
        console.error("Lightbox Error: Could not find main image.");
        return;
    }

    let lightbox = document.getElementById('image-lightbox');
    if (!lightbox) {
        console.log("Creating lightbox overlay...");
        const html = `
            <div id="image-lightbox" class="lightbox-overlay" onclick="closeLightbox()">
                <div class="lightbox-content" onclick="event.stopPropagation()">
                    <button class="lightbox-close" onclick="closeLightbox()"><i data-lucide="x"></i></button>
                    <img id="lightbox-img" class="lightbox-image" src="" alt="Full Image">
                    <div id="lightbox-caption" class="lightbox-caption"></div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', html);
        lightbox = document.getElementById('image-lightbox');
        if (window.lucide) lucide.createIcons();
    }

    const lightboxImg = document.getElementById('lightbox-img');
    const lightboxCaption = document.getElementById('lightbox-caption');
    const card = btn.closest('.card');
    const titleEl = card ? card.querySelector('.card-title') : null;
    const title = titleEl ? titleEl.innerText : 'Product Image';

    console.log("Lightbox Image Source:", mainImg.src);
    lightboxImg.src = mainImg.src;
    lightboxCaption.innerText = title;
    lightbox.classList.add('open');
    document.body.style.overflow = 'hidden';
};

window.closeLightbox = function () {
    const lightbox = document.getElementById('image-lightbox');
    if (lightbox) {
        lightbox.classList.remove('open');
        document.body.style.overflow = ''; // Restore scrolling
    }
};

// Initialize after all definitions
// Initialize after all definitions

// Expose currency utilities globally
window.formatPrice = formatPrice;
window.setCurrency = setCurrency;
// We also need to ensure currentCurrency is up to date when accessed
Object.defineProperty(window, 'currentCurrency', {
    get: function () { return currentCurrency; },
    set: function (val) { currentCurrency = val; }
});
window.EXCHANGE_RATE = EXCHANGE_RATE;

document.addEventListener('DOMContentLoaded', () => {
    init();
    setupCart(); // Ensure cart listeners are attached immediately
});





