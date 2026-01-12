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
const backToTopBtn = document.getElementById('back-to-top');

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
        setupBackToTop();
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

    // Pattern 2: id=ID or ?id=ID or uc?id=ID or open?id=ID
    match = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (match) return match[1];

    // Pattern 3: direct ID (if the whole string looks like an ID)
    if (url.length > 20 && /^[a-zA-Z0-9_-]+$/.test(url)) return url;

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
    }).filter(p => p.name).reverse(); // Filter empty names and REVERSE to show latest first

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
const BATCH_SIZE = 10;
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
    const batch = currentProducts.slice(currentlyRendered, end);

    // Staggered loading: Add cards one by one with a tiny delay to avoid hitting Google's rate limit
    batch.forEach((product, index) => {
        setTimeout(() => {
            const card = createCard(product, currentlyRendered + index);
            productGrid.appendChild(card);

            // Re-observe if this is the last item in the batch
            if (index === batch.length - 1) {
                currentlyRendered = end;
                if (window.lucide) lucide.createIcons();
                setupSentinel();
            }
        }, index * 150); // 150ms gap between each card
    });
}

function setupSentinel() {
    // Remove old sentinel
    const oldSentinel = document.getElementById('lazy-load-sentinel');
    if (oldSentinel) oldSentinel.remove();

    // Add new sentinel if needed
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
        rootMargin: '400px' // Increased margin to start loading earlier
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
            if (e.target.closest('.copy-btn')) return;
            window.open(product.link, '_blank');
        });
    }

    // Advanced Image Strategy
    let driveId = null;
    let directImageSrc = null;

    // 1. Try Image column (could be a Drive Link or a Direct URL)
    if (product.image) {
        driveId = extractDriveId(product.image);
        if (!driveId && (product.image.startsWith('http') || product.image.startsWith('data:'))) {
            directImageSrc = product.image;
        }
    }

    // 2. Try Document Link column if no ID found yet
    if (!driveId && !directImageSrc && product.link) {
        driveId = extractDriveId(product.link);
    }

    // 3. Try Global Drive Mapping as final fallback for ID
    if (!driveId && !directImageSrc && window.DRIVE_MAPPING) {
        driveId = window.DRIVE_MAPPING[product.no] || null;
    }

    const imgId = `img-${product.index}`;

    // Default placeholder for missing document/image
    const noLinkPlaceholder = 'data:image/svg+xml;charset=UTF-8,%3Csvg%20width%3D%22800%22%20height%3D%22600%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Crect%20width%3D%22100%25%22%20height%3D%22100%25%22%20fill%3D%22%23f1f5f9%22%2F%3E%3Ctext%20x%3D%2250%25%22%20y%3D%2250%25%22%20font-family%3D%22sans-serif%22%20font-size%3D%2220%22%20font-weight%3D%22bold%22%20fill%3D%22%2394a3b8%22%20text-anchor%3D%22middle%22%20dy%3D%22.3em%22%3ENo%20Preview%20Available%3C%2Ftext%3E%3C%2Fsvg%3E';

    // Cleaner Drive URL for better compatibility
    let imageSrc = directImageSrc || (driveId
        ? `https://lh3.googleusercontent.com/d/${driveId}=w800`
        : noLinkPlaceholder);

    // Reliable fallback endpoint
    const secondaryFallback = driveId ? `https://drive.google.com/thumbnail?id=${driveId}&sz=w800` : imageSrc;

    const isPlaceholder = !driveId && !directImageSrc;

    article.innerHTML = `
        <div class="card-image-container" style="${isPlaceholder ? 'padding: 2rem; background: #f8fafc;' : ''}">
            <img 
                src="${imageSrc}" 
                alt="${product.name}" 
                class="product-image"
                id="${imgId}"
                loading="lazy"
                style="${isPlaceholder ? 'object-fit: contain; opacity: 0.5;' : 'object-fit: cover;'}"
                onerror="handleImageError(this, '${secondaryFallback}', '${product.name}')"
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

// Global handler for image errors with Retry Logic
window.handleImageError = function (img, fallback, productName) {
    if (!img.dataset.retries) img.dataset.retries = 0;
    let retryCount = parseInt(img.dataset.retries);

    // Attempt 1: Try the secondary fallback endpoint immediately
    if (retryCount === 0) {
        img.dataset.retries = 1;
        img.src = fallback;
        return;
    }

    // Attempt 2: If fallback fails, wait 1s and try again (handles temporary Google API spikes)
    if (retryCount === 1) {
        img.dataset.retries = 2;
        setTimeout(() => {
            img.src = fallback + '&retry=' + Date.now();
        }, 1000);
        return;
    }

    // Attempt 3: Switch to the third-party "open" proxy for Drive images
    if (retryCount === 2) {
        img.dataset.retries = 3;
        const driveId = extractDriveId(img.src);
        if (driveId) {
            img.src = `https://drive.google.com/uc?export=view&id=${driveId}`;
            return;
        }
    }

    // Final failure: Show the Access Denied placeholder
    img.onerror = null;
    img.src = 'data:image/svg+xml;charset=UTF-8,%3Csvg%20width%3D%22800%22%20height%3D%22600%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Crect%20width%3D%22100%25%22%20height%3D%22100%25%22%20fill%3D%22%23fee2e2%22%2F%3E%3Ctext%20x%3D%2250%25%22%20y%3D%2250%25%22%20font-family%3D%22sans-serif%22%20font-size%3D%2220%22%20fill%3D%22%23ef4444%22%20text-anchor%3D%22middle%22%20dy%3D%22.3em%22%3EAccess%20Denied%20/%20Private%3C%2Ftext%3E%3C%2Fsvg%3E';
    img.style.objectFit = 'contain';
    img.parentElement.style.padding = '1.5rem';
    console.warn(`Persistent preview error for: ${productName}. File is likely private or Google's thumbnailer is temporarily down.`);
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
