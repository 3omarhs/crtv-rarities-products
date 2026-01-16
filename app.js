const SHEET_ID = '1x3ExLPeQwSJtewUXQhYwdXO_I3Owhs6fenFc4UlbwPU';
console.log("App.js version 1.1 loaded");
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
const categorySelect = document.getElementById('category-select');
const productCountEl = document.getElementById('product-count');
const backToTopBtn = document.getElementById('back-to-top');

let allProducts = [];
let fuse = null;
let cart = JSON.parse(localStorage.getItem('cr_cart') || '[]');

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
    setupCart();
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
    let match = url.match(/\/(?:file\/)?d\/([a-zA-Z0-9_-]+)/);
    if (match) return match[1];

    match = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (match) return match[1];

    if (url.length > 20 && /^[a-zA-Z0-9_-]+$/.test(url)) return url;

    return null;
}

function processData(data) {
    if (!data || data.length === 0) {
        showError("No data found in the spreadsheet.");
        return;
    }

    const firstItem = data[0];
    const keys = Object.keys(firstItem);

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

    const retailPriceKey = keys.find(k => k.includes('>=') && k.includes('25')) ||
        keys.find(k => normalizeKey(k).includes('retail'));

    const bulkPriceKey = keys.find(k => k.includes('<') && k.includes('25')) ||
        keys.find(k => normalizeKey(k).includes('bulk'));

    const priceKey = keys.find(k => normalizeKey(k) === 'price') ||
        keys.find(k => normalizeKey(k).includes('price') && !k.includes('25')) ||
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

    if (!productKey) {
        showError("Could not find a 'Product Name' column.");
        return;
    }

    allProducts = data.map((item, index) => {
        const product = {
            name: item[productKey],
            no: noKey ? item[noKey] : `ITEM-${index + 1}`,
            image: imageKey ? item[imageKey] : null,
            link: linkKey ? item[linkKey] : null,
            price: (retailPriceKey ? item[retailPriceKey] : null) || item[priceKey] || null,
            category: categoryKey ? item[categoryKey] : null,
            arabicName: arabicNameKey ? item[arabicNameKey] : null,
            description: descriptionKey ? item[descriptionKey] : null,
            dimensions: dimensionsKey ? item[dimensionsKey] : null,
            collection: collectionKey ? item[collectionKey] : null,
            targetMarket: targetMarketKey ? item[targetMarketKey] : null,
            bulkPrice: bulkPriceKey ? item[bulkPriceKey] : null,
            bulkDiscount: bulkDiscountKey ? item[bulkDiscountKey] : null,
            available: (availableKey && item[availableKey] && String(item[availableKey]).trim() !== '') ? item[availableKey] : 'Yes',
            hidden: hiddenKey ? String(item[hiddenKey]).toLowerCase() === 'yes' : false,
            colors: (colorsKey && item[colorsKey]) ? String(item[colorsKey]).split(',').map(c => c.trim()).filter(c => c) : [],
            index: index
        };

        // Calculate discount percentage if both prices are available
        if (product.price && product.bulkPrice) {
            const p1 = parseFloat(product.price.replace(/[^\d.]/g, ''));
            const p2 = parseFloat(product.bulkPrice.replace(/[^\d.]/g, ''));
            if (!isNaN(p1) && !isNaN(p2) && p2 > p1) {
                product.calculatedDiscount = Math.round(((p2 - p1) / p2) * 100);
            }
        }

        product._searchData = {
            name: (product.name || '').toLowerCase(),
            arabicName: normalizeArabic(product.arabicName),
            no: String(product.no || '').toLowerCase(),
            category: (product.category || '').toLowerCase(),
            price: String(product.price || '').toLowerCase()
        };

        return product;
    }).filter(p => !p.hidden).filter(p => p.name).reverse();

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

    const categories = [...new Set(allProducts.map(p => p.category).filter(Boolean))].sort();
    categorySelect.innerHTML = '<option value="all">All Categories</option>' +
        categories.map(c => `<option value="${c}">${c}</option>`).join('');

    renderProducts(allProducts);

    loadingEl.classList.add('hidden');
    controlsEl.classList.remove('hidden');
    productGrid.classList.remove('hidden');
    setupFilter();
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
    renderBatch();
    setupLazyLoading();
}

function renderBatch() {
    const end = Math.min(currentlyRendered + BATCH_SIZE, currentProducts.length);
    const batch = currentProducts.slice(currentlyRendered, end);

    batch.forEach((product, index) => {
        setTimeout(() => {
            const card = createCard(product, currentlyRendered + index);
            productGrid.appendChild(card);

            if (index === batch.length - 1) {
                currentlyRendered = end;
                if (window.lucide) lucide.createIcons();
                setupSentinel();
            }
        }, index * 150);
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
    const article = document.createElement('article');
    article.className = 'card fade-in-up';
    article.style.animationDelay = `${Math.min(uiIndex * 0.05, 1)}s`;

    let driveId = null;
    let directImageSrc = null;

    if (product.image) {
        driveId = extractDriveId(product.image);
        if (!driveId && (product.image.startsWith('http') || product.image.startsWith('data:'))) {
            directImageSrc = product.image;
        }
    }

    if (!driveId && !directImageSrc && product.link) {
        driveId = extractDriveId(product.link);
    }

    if (!driveId && !directImageSrc && window.DRIVE_MAPPING) {
        driveId = window.DRIVE_MAPPING[product.no] || null;
    }

    const imgId = `img-${product.index}`;
    const noLinkPlaceholder = 'data:image/svg+xml;charset=UTF-8,%3Csvg%20width%3D%22800%22%20height%3D%22600%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Crect%20width%3D%22100%25%22%20height%3D%22100%25%22%20fill%3D%22%23f1f5f9%22%2F%3E%3Ctext%20x%3D%2250%25%22%20y%3D%2250%25%22%20font-family%3D%22sans-serif%22%20font-size%3D%2220%22%20font-weight%3D%22bold%22%20fill%3D%22%2394a3b8%22%20text-anchor%3D%22middle%22%20dy%3D%22.3em%22%3ENo%20Preview%20Available%3C%2Ftext%3E%3C%2Fsvg%3E';

    let imageSrc = directImageSrc || (driveId
        ? `https://lh3.googleusercontent.com/d/${driveId}=w800`
        : noLinkPlaceholder);

    const secondaryFallback = driveId ? `https://drive.google.com/thumbnail?id=${driveId}&sz=w800` : imageSrc;
    const isPlaceholder = !driveId && !directImageSrc;
    const largeImageSrc = driveId ? `https://lh3.googleusercontent.com/d/${driveId}=w1000` : imageSrc;

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
            <div style="display: flex; justify-content: flex-end; align-items: start; margin-bottom: 0.5rem;">
                <button 
                    class="add-to-cart-btn-mini ${String(product.available).toLowerCase() === 'no' ? 'disabled' : ''}" 
                    onclick="event.stopPropagation(); ${String(product.available).toLowerCase() === 'no' ? '' : `addToCart(${product.index}, this)`}" 
                    title="${String(product.available).toLowerCase() === 'no' ? 'Out of Stock' : 'Add to Cart'}"
                    ${String(product.available).toLowerCase() === 'no' ? 'disabled' : ''}
                >
                    <i data-lucide="${String(product.available).toLowerCase() === 'no' ? 'x-circle' : 'shopping-cart'}" style="width: 14px;"></i> 
                    ${String(product.available).toLowerCase() === 'no' ? ' OOS' : ' + Cart'}
                </button>
            </div>
            <h2 class="card-title">${product.name}</h2>
            ${product.arabicName ? `<p class="card-arabic-name">${product.arabicName}</p>` : ''}
            ${product.category ? `<div class="card-category"><i data-lucide="tag" style="width: 14px;"></i> ${product.category}</div>` : ''}
        </div>
        <div class="card-footer">
            ${product.bulkPrice ? `<span class="card-price">${product.bulkPrice} JOD</span>` : (product.price ? `<span class="card-price">${product.price} JOD</span>` : '')}
            ${String(product.available).toLowerCase() !== 'no' ?
            `<span class="stock-badge in-stock"><i data-lucide="package" style="width: 14px;"></i> In Stock</span>` :
            `<span class="stock-badge out-stock"><i data-lucide="x-circle" style="width: 14px;"></i> Out of Stock</span>`}
            <i data-lucide="shield-check" style="margin-left: auto; width: 16px; color: var(--accent);"></i>
        </div>

        <div class="expanded-content">
            <div class="expanded-info">
                <button class="expanded-close" title="Close Details"><i data-lucide="x"></i></button>
                <div style="display: flex; align-items: baseline; gap: 1rem; flex-wrap: wrap; margin-bottom: 0.5rem;">
                    <h2 class="expanded-title" style="margin: 0;">${product.name}</h2>
                    ${String(product.available).toLowerCase() !== 'no' ?
            `<span class="stock-badge in-stock"><i data-lucide="package" style="width: 14px;"></i> In Stock</span>` :
            `<span class="stock-badge out-stock"><i data-lucide="x-circle" style="width: 14px;"></i> Out of Stock</span>`}
                </div>
                <div style="display: flex; align-items: center; gap: 0.8rem; margin-bottom: 1rem;">
                    <span class="card-number" style="font-size: 1rem; padding: 0.4rem 0.8rem; background: #f1f5f9; border-radius: 8px; color: var(--text-primary);">No: ${product.no}</span>
                    <button class="copy-btn" onclick="event.stopPropagation(); copyToClipboard('${product.no}', this)" title="Copy Item Number">
                        <i data-lucide="copy" style="width: 14px;"></i> Copy
                    </button>
                </div>
                ${product.arabicName ? `<p class="expanded-arabic-name">${product.arabicName}</p>` : ''}
                
                <div class="expanded-grid">
                    ${product.category ? `<div class="expanded-meta"><strong>Category:</strong> <span>${product.category}</span></div>` : ''}
                    ${product.collection ? `<div class="expanded-meta"><strong>Collection:</strong> <span>${product.collection}</span></div>` : ''}
                    ${product.dimensions ? `<div class="expanded-meta"><strong>Dimensions:</strong> <span>${product.dimensions}</span></div>` : ''}
                    ${product.targetMarket ? `<div class="expanded-meta"><strong>Target Market:</strong> <span>${product.targetMarket}</span></div>` : ''}
                </div>

                <div class="expanded-description">${product.description || 'No additional description available.'}</div>
                
                ${product.colors && product.colors.length > 0 ? `
                <div class="colors-section" style="margin: 2rem 0; padding: 1.5rem; background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%); border-radius: 20px; border: 1px solid var(--card-border); position: relative; overflow: hidden; box-shadow: inset 0 2px 4px rgba(0,0,0,0.02);">
                    <div class="colors-title" style="display: flex; align-items: center; gap: 0.6rem; font-size: 0.85rem; font-weight: 800; color: var(--text-primary); margin-bottom: 1.2rem; text-transform: uppercase; letter-spacing: 0.12em;">
                        <i data-lucide="palette" style="width: 16px; color: var(--accent);"></i> Select Color
                    </div>
                    <div class="color-list" style="display: flex; flex-wrap: wrap; gap: 1rem; position: relative; z-index: 1;">
                        ${product.colors.map((color, idx) => {
                const cssColor = color.toLowerCase().replace(/\s+/g, '');
                const isWhite = cssColor === 'white' || cssColor === '#ffffff';
                const isFirst = idx === 0;
                if (isFirst) article.dataset.selectedColor = color;
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
                                    <span class="color-name">${color}</span>
                                </div>
                            `;
            }).join('')}
                    </div>
                </div>
                ` : ''}
                
                <div class="expanded-pricing">
                    <div class="main-price">
                        <div class="main-price-info">
                            <span class="label">Retail Price (>= 25 QTY):</span>
                            <span class="value">${product.price ? `${product.price} JOD` : 'Price on request'}</span>
                        </div>
                        ${product.calculatedDiscount ? `
                            <div class="discount-badge">
                                <span class="discount-percent">${product.calculatedDiscount}%</span>
                                <span class="discount-off">OFF</span>
                            </div>
                        ` : ''}
                    </div>
                    ${product.bulkPrice ? `
                        <div class="bulk-price">
                            <span class="label">Bulk Saving (< 25 QTY):</span>
                            <span class="value">${product.bulkPrice} JOD</span>
                        </div>
                    ` : ''}
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
                        ${String(product.available).toLowerCase() === 'no' ? 'Out of Stock' : 'Add to Cart'}
                    </button>
                    ${product.link ? `<a href="${product.link}" target="_blank" class="view-doc-btn"><i data-lucide="file-text"></i> View Document</a>` : ''}
                </div>
            </div>
        </div>
    `;

    article.addEventListener('click', (e) => {
        if (e.target.closest('.copy-btn') || e.target.closest('.view-doc-btn')) return;

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

window.handleImageError = function (img, fallback, productName) {
    if (!img.dataset.retries) img.dataset.retries = 0;
    let retryCount = parseInt(img.dataset.retries);

    if (retryCount === 0) {
        img.dataset.retries = 1;
        img.src = fallback;
        return;
    }

    if (retryCount === 1) {
        img.dataset.retries = 2;
        setTimeout(() => {
            img.src = fallback + '&retry=' + Date.now();
        }, 1000);
        return;
    }

    if (retryCount === 2) {
        img.dataset.retries = 3;
        const driveId = extractDriveId(img.src);
        if (driveId) {
            img.src = `https://drive.google.com/uc?export=view&id=${driveId}`;
            return;
        }
    }

    img.onerror = null;
    img.src = 'data:image/svg+xml;charset=UTF-8,%3Csvg%20width%3D%22800%22%20height%3D%22600%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Crect%20width%3D%22100%25%22%20height%3D%22100%25%22%20fill%3D%22%23fee2e2%22%2F%3E%3Ctext%20x%3D%2250%25%22%20y%3D%2250%25%22%20font-family%3D%22sans-serif%22%20font-size%3D%2220%22%20fill%3D%22%23ef4444%22%20text-anchor%3D%22middle%22%20dy%3D%22.3em%22%3EAccess%20Denied%20/%20Private%3C%2Ftext%3E%3C%2Fsvg%3E';
    img.style.objectFit = 'contain';
    img.parentElement.style.padding = '1.5rem';
    console.warn(`Persistent preview error for: ${productName}.`);
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
    searchInput.addEventListener('input', () => {
        updateDisplay();
    });
}

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
    const clearCartBtn = document.getElementById('clear-cart-btn');
    const checkoutBtn = document.getElementById('checkout-btn');

    floatingCart.addEventListener('click', toggleCart);
    closeCart.addEventListener('click', toggleCart);
    cartOverlay.addEventListener('click', toggleCart);
    checkoutBtn.addEventListener('click', checkoutWhatsApp);

    if (clearCartBtn) {
        clearCartBtn.addEventListener('click', () => {
            console.log("Clear cart button clicked (via listener)");
            emptyCart();
        });
    }


    updateCartUI();
}

function toggleCart() {
    document.getElementById('cart-drawer').classList.toggle('open');
    document.getElementById('cart-overlay').classList.toggle('open');
}

window.addToCart = function (productIndex, btn) {
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
            price: product.price,       // Retail Price (>= 25)
            bulkPrice: product.bulkPrice, // Bulk Price (< 25)
            image: product.image,
            color: selectedColor,
            quantity: 1
        });
    }

    saveCart();
    updateCartUI();

    // Visual feedback
    const originalContent = btn.innerHTML;
    btn.innerHTML = `<i data-lucide="check" style="width: 14px;"></i> Added!`;
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
    if (cart.length === 0) {
        showModal({
            title: "Cart Empty",
            message: "Your cart is already empty.",
            type: "success",
            confirmText: "Ok"
        });
        return;
    }

    showModal({
        title: "Empty Cart?",
        message: "Are you sure you want to empty your cart? This will erase all selected items.",
        type: "warning",
        confirmText: "Clear All",
        cancelText: "Keep Items",
        onConfirm: () => {
            cart.length = 0;
            saveCart();
            updateCartUI();

            // Show success modal after clearing
            setTimeout(() => {
                showModal({
                    title: "Cart Cleared",
                    message: "All items have been removed from your cart successfully.",
                    type: "success",
                    confirmText: "Done"
                });
            }, 400);
        }
    });
}
window.emptyCart = emptyCart;



function updateCartUI() {
    const cartItemsContainer = document.getElementById('cart-items');
    const cartCount = document.getElementById('cart-count');
    const cartTotalValue = document.getElementById('cart-total-value');

    const totalCount = cart.reduce((sum, item) => sum + item.quantity, 0);
    cartCount.textContent = totalCount;
    cartCount.style.display = totalCount > 0 ? 'flex' : 'none';

    if (cart.length === 0) {
        cartItemsContainer.innerHTML = '<p style="text-align: center; color: var(--text-secondary); margin-top: 2rem;">Your cart is empty.</p>';
        cartTotalValue.textContent = '0.000 JOD';
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
        const isBulk = totalQtyForProduct < 25;

        // Use bulkPrice if qty < 25, otherwise use retail price
        const priceString = isBulk && item.bulkPrice ? item.bulkPrice : item.price;
        const unitPrice = parseFloat(String(priceString).replace(/[^\d.]/g, '')) || 0;

        const subtotal = unitPrice * item.quantity;
        total += subtotal;

        let driveId = extractDriveId(item.image);
        let imgSrc = (item.image && !driveId) ? item.image : (driveId ? `https://lh3.googleusercontent.com/d/${driveId}=w200` : 'data:image/svg+xml;charset=UTF-8,%3Csvg%20width%3D%22200%22%20height%3D%22200%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Crect%20width%3D%22100%25%22%20height%3D%22100%25%22%20fill%3D%22%23f1f5f9%22%2F%3E%3C%2Fsvg%3E');

        return `
            <div class="cart-item">
                <img src="${imgSrc}" class="cart-item-img" alt="${item.name}">
                <div class="cart-item-info">
                    <div class="cart-item-title">${item.name} ${item.color ? `<small style="color: var(--text-secondary);">(${item.color})</small>` : ''}</div>
                    <div class="cart-item-price">
                        ${unitPrice.toFixed(3)} JOD 
                        ${item.bulkPrice && isBulk ? `<small style="display:block; font-size:0.7rem; color:#b45309;">(Applied Bulk Saving Price for <25 qty)</small>` : (item.price && !isBulk ? `<small style="display:block; font-size:0.7rem; color:#059669;">(Applied Retail Price for >=25 qty)</small>` : '')}
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

    cartTotalValue.textContent = `${total.toFixed(3)} JOD`;
    if (window.lucide) lucide.createIcons();
}

function checkoutWhatsApp() {
    if (cart.length === 0) {
        showModal({
            title: "Cart is Empty",
            message: "Please add some items to your cart before proceeding to checkout.",
            type: "warning",
            confirmText: "Ok"
        });
        return;
    }

    let message = "*Creative Rarities Store - New Order*\n\n";
    let total = 0;

    // First calculate product quantities to determine pricing (bulk vs retail)
    const productQuantities = {};
    cart.forEach(item => {
        productQuantities[item.no] = (productQuantities[item.no] || 0) + item.quantity;
    });

    cart.forEach((item) => {
        const totalQtyForProduct = productQuantities[item.no];
        const isBulk = totalQtyForProduct < 25;
        const priceString = isBulk && item.bulkPrice ? item.bulkPrice : item.price;
        const unitPrice = parseFloat(String(priceString).replace(/[^\d.]/g, '')) || 0;
        const subtotal = unitPrice * item.quantity;
        total += subtotal;

        message += `*${item.name}*\n`;
        message += `ID: ${item.no} | Color: ${item.color || 'Default'}\n`;
        message += `Qty: ${item.quantity} PCS x ${unitPrice.toFixed(3)} JOD = ${subtotal.toFixed(3)} JOD\n\n`;
    });

    message += `--------------------------\n`;
    message += `*Order Total: ${total.toFixed(3)} JOD*`;

    const encodedMessage = encodeURIComponent(message);
    const whatsappUrl = `https://web.whatsapp.com/send/?phone=962795965910&text=${encodedMessage}&type=phone_number&app_absent=0`;


    window.open(whatsappUrl, '_blank');
}

window.selectColor = function (badge, color) {
    const section = badge.closest('.color-list');
    section.querySelectorAll('.color-badge').forEach(b => {
        b.classList.remove('selected');
        b.style.transform = 'none';
    });
    badge.classList.add('selected');
    badge.closest('.card').dataset.selectedColor = color;
};

// Initialize after all definitions
init();

