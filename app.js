const SHEET_ID = '1x3ExLPeQwSJtewUXQhYwdXO_I3Owhs6fenFc4UlbwPU';
const GID = '897526080';
// Using the direct publish link provided by the user for better access
const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSTejg41yuaKcYa0CbOodUP9osmE5DIv8ZNQyMXlHJLLh2pQUZ5EoMT93UgV3LZfhAJcPEL8uEfK9Y4/pub?gid=897526080&single=true&output=csv';

const productGrid = document.getElementById('product-grid');
const loadingEl = document.getElementById('loading');
const errorEl = document.getElementById('error-message');
const errorText = document.getElementById('error-text');
const controlsEl = document.getElementById('controls');
const searchInput = document.getElementById('search-input');
const sortSelect = document.getElementById('sort-select');
const productCountEl = document.getElementById('product-count');

let allProducts = [];
let fuse = null;

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

async function init() {
    try {
        const data = await fetchSheetData();
        processData(data);
        setupSearch();
        setupSort();
    } catch (err) {
        showError(err.message);
    }
}

function fetchSheetData() {
    return new Promise((resolve, reject) => {
        Papa.parse(CSV_URL, {
            download: true,
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
                if (results.errors.length) {
                    console.warn('Parse errors:', results.errors);
                }
                resolve(results.data);
            },
            error: (err) => {
                reject(new Error(`Failed to load spreadsheet: ${err.message}`));
            }
        });
    });
}

function normalizeKey(key) {
    return key.toLowerCase().trim();
}

function extractDriveId(url) {
    if (!url) return null;

    // Try multiple patterns to extract Drive ID
    // Pattern 1: /file/d/ID/ or /d/ID/
    let match = url.match(/\/(?:file\/)?d\/([a-zA-Z0-9_-]+)/);
    if (match) return match[1];

    // Pattern 2: id=ID or ?id=ID
    match = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (match) return match[1];

    // Pattern 3: /open?id=ID
    match = url.match(/\/open\?id=([a-zA-Z0-9_-]+)/);
    if (match) return match[1];

    // Pattern 4: uc?id=ID (direct download links)
    match = url.match(/uc\?id=([a-zA-Z0-9_-]+)/);
    if (match) return match[1];

    return null;
}

function processData(data) {
    if (!data || data.length === 0) {
        showError("No data found in the spreadsheet.");
        return;
    }

    // Identify keys
    const firstItem = data[0];
    const keys = Object.keys(firstItem);

    // Fuzzy matching for columns
    const productKey = keys.find(k => normalizeKey(k).includes('product') && normalizeKey(k).includes('name')) ||
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

    const priceKey = keys.find(k => normalizeKey(k).includes('price')) ||
        keys.find(k => normalizeKey(k).includes('cost'));

    const categoryKey = keys.find(k => normalizeKey(k).includes('category')) ||
        keys.find(k => normalizeKey(k).includes('type'));

    const arabicNameKey = keys.find(k => normalizeKey(k).includes('arabic') && normalizeKey(k).includes('name')) ||
        keys.find(k => normalizeKey(k) === 'arabic name');

    if (!productKey) {
        showError("Could not find a 'Product Name' column.");
        return;
    }

    // Map data to clean structure
    allProducts = data.map((item, index) => {
        const product = {
            name: item[productKey],
            no: noKey ? item[noKey] : `ITEM-${index + 1}`,
            image: imageKey ? item[imageKey] : null,
            link: linkKey ? item[linkKey] : null,
            price: priceKey ? item[priceKey] : null,
            category: categoryKey ? item[categoryKey] : null,
            arabicName: arabicNameKey ? item[arabicNameKey] : null,
            index: index
        };

        // Pre-normalize fields for better searching
        product._searchData = {
            name: (product.name || '').toLowerCase(),
            arabicName: normalizeArabic(product.arabicName),
            no: String(product.no || '').toLowerCase(),
            category: (product.category || '').toLowerCase(),
            price: String(product.price || '').toLowerCase()
        };

        return product;
    }).filter(p => p.name); // Filter empty names

    // Initialize Fuse.js
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
        threshold: 0.4, // Adjust for fuzziness (0.0 exact, 1.0 matches anything)
        ignoreLocation: true,
        useExtendedSearch: true,
        distance: 100
    };
    fuse = new Fuse(allProducts, fuseOptions);

    renderProducts(allProducts);

    loadingEl.classList.add('hidden');
    controlsEl.classList.remove('hidden');
    productGrid.classList.remove('hidden');
}

let currentlyRendered = 0;
const BATCH_SIZE = 20;
let currentProducts = [];

function renderProducts(products) {
    productGrid.innerHTML = '';
    currentProducts = products;
    currentlyRendered = 0;

    if (products.length === 0) {
        productGrid.innerHTML = '<p class="stats" style="grid-column: 1/-1; text-align: center; padding: 2rem;">No products found.</p>';
        productCountEl.textContent = '0 items';
        return;
    }

    productCountEl.textContent = `${products.length} item${products.length !== 1 ? 's' : ''}`;

    // Render first batch immediately
    renderBatch();

    // Setup intersection observer for lazy loading
    setupLazyLoading();
}

function renderBatch() {
    const end = Math.min(currentlyRendered + BATCH_SIZE, currentProducts.length);

    for (let i = currentlyRendered; i < end; i++) {
        const card = createCard(currentProducts[i], i);
        productGrid.appendChild(card);
    }

    currentlyRendered = end;

    if (window.lucide) {
        lucide.createIcons();
    }

    // Add sentinel if there are more items to load
    if (currentlyRendered < currentProducts.length) {
        const sentinel = document.createElement('div');
        sentinel.id = 'lazy-load-sentinel';
        sentinel.style.gridColumn = '1/-1';
        sentinel.style.height = '1px';
        productGrid.appendChild(sentinel);
    }
}

let lazyLoadObserver = null;

function setupLazyLoading() {
    // Disconnect previous observer if exists
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
        rootMargin: '200px' // Start loading 200px before reaching the sentinel
    });

    const sentinel = document.getElementById('lazy-load-sentinel');
    if (sentinel) {
        lazyLoadObserver.observe(sentinel);
    }
}

function createCard(product, uiIndex) {
    const article = document.createElement('article');
    article.className = 'card fade-in-up';
    article.style.animationDelay = `${Math.min(uiIndex * 0.05, 1)}s`;

    // Add click handler for Document Link
    if (product.link) {
        article.style.cursor = 'pointer';
        article.title = "View Document";
        article.addEventListener('click', (e) => {
            // Prevent navigation if clicking the copy button or its children
            if (e.target.closest('.copy-btn')) return;
            window.open(product.link, '_blank');
        });
    }

    // Image Handling: Use the PDF's first page thumbnail from the Document Link
    const imgId = `img-${product.index}`;
    let imageSrc = 'baseImage.png';
    let driveId = null;

    if (product.link) {
        driveId = extractDriveId(product.link);
        if (driveId) {
            // Use Google Drive thumbnail endpoint which generates a preview of the first page of the PDF
            imageSrc = `https://drive.google.com/thumbnail?id=${driveId}&sz=w800`;
        } else {
            console.warn(`Could not extract Drive ID from link for product: ${product.name}`, product.link);
        }
    } else {
        console.warn(`No document link found for product: ${product.name}`);
    }

    // Special handling for placeholder to style it differently if needed
    const isPlaceholder = !driveId;

    article.innerHTML = `
        <div class="card-image-container" style="${isPlaceholder ? 'padding: 1rem; background: #f8fafc;' : ''}">
            <img 
                src="${imageSrc}" 
                alt="${product.name}" 
                class="product-image"
                id="${imgId}"
                loading="lazy"
                style="${isPlaceholder ? 'object-fit: contain;' : 'object-fit: cover;'}"
                onerror="this.onerror=null; this.src='baseImage.png'; this.style.objectFit='contain'; this.parentElement.style.padding='1rem'; console.error('Failed to load image for ${product.name}', '${imageSrc}');"
            >
        </div>
        <div class="card-content">
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 0.5rem;">
                <div class="card-number">${product.no}</div>
                <button class="copy-btn" onclick="copyToClipboard('${product.no}', this)" title="Copy Item Number">
                    <i data-lucide="copy" style="width: 14px;"></i> Copy
                </button>
            </div>
            <h2 class="card-title">${product.name}</h2>
            ${product.arabicName ? `<p class="card-arabic-name">${product.arabicName}</p>` : ''}
            ${product.category ? `<div class="card-category"><i data-lucide="tag" style="width: 14px;"></i> ${product.category}</div>` : ''}
        </div>
        <div class="card-footer">
            ${product.price ? `
                <span class="card-price">
                    ${product.price} JOD
                </span>
            ` : `
                <span style="display: flex; align-items: center; gap: 0.5rem;">
                    <i data-lucide="package" style="width: 16px;"></i>
                    In Stock
                </span>
            `}
            <i data-lucide="shield-check" style="margin-left: auto; width: 16px; color: var(--accent);"></i>
        </div>
    `;

    return article;
}

// Global handler for image errors (cascading fallback)
window.handleImageError = function (img, productNo) {
    const currentSrc = img.src;

    // If we failed on PNG, try JPG
    if (currentSrc.endsWith('.png') && !currentSrc.includes('baseImage')) {
        img.src = `images/${productNo}.jpg`;
        return;
    }

    // If we failed on JPG (or CSV URL), fall back to base image
    if (!currentSrc.includes('baseImage.png')) {
        img.src = 'baseImage.png';
        img.style.objectFit = 'contain';
        img.style.padding = '1rem';
        img.style.background = '#f1f5f9';
    }
};

// Smart search is now handled by Fuse.js in updateDisplay()

function updateDisplay() {
    const term = searchInput.value;
    const sortBy = sortSelect.value;

    let filtered = [];
    if (term.trim() === '') {
        filtered = [...allProducts];
    } else {
        // Search using Fuse.js
        const searchResults = fuse.search(term);
        filtered = searchResults.map(result => result.item);

        // If no fuzzy matches, try a simple manual include for reliability
        if (filtered.length === 0) {
            const lowerTerm = term.toLowerCase().trim();
            const normalizedTerm = normalizeArabic(term);
            filtered = allProducts.filter(p =>
                p.name.toLowerCase().includes(lowerTerm) ||
                String(p.no).toLowerCase().includes(lowerTerm) ||
                (p.arabicName && normalizeArabic(p.arabicName).includes(normalizedTerm)) ||
                (p.category && p.category.toLowerCase().includes(lowerTerm))
            );
        }
    }

    // Apply sorting
    const sorted = sortProducts(filtered, sortBy);
    renderProducts(sorted);
}

function setupSearch() {
    searchInput.addEventListener('input', () => {
        updateDisplay();
    });
}

// Global scope for onclick
window.copyToClipboard = function (text, btn) {
    navigator.clipboard.writeText(text).then(() => {
        const originalHtml = btn.innerHTML;
        btn.classList.add('copied');
        btn.innerHTML = `<i data-lucide="check" style="width: 14px;"></i> Copied`;

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

// Start
init();

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
            sorted.sort((a, b) => {
                const priceA = parseFloat(a.price) || 0;
                const priceB = parseFloat(b.price) || 0;
                return priceA - priceB;
            });
            break;
        case 'price-desc':
            sorted.sort((a, b) => {
                const priceA = parseFloat(a.price) || 0;
                const priceB = parseFloat(b.price) || 0;
                return priceB - priceA;
            });
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
        default:
            // Keep original order
            break;
    }

    return sorted;
}

function setupSort() {
    sortSelect.addEventListener('change', () => {
        updateDisplay();
    });
}
