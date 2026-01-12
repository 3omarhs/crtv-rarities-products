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
const productCountEl = document.getElementById('product-count');

let allProducts = [];

async function init() {
    try {
        const data = await fetchSheetData();
        processData(data);
        setupSearch();
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
    // Matches /d/ID/ or id=ID patterns
    const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/id=([a-zA-Z0-9_-]+)/);
    return match ? match[1] : null;
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

    if (!productKey) {
        showError("Could not find a 'Product Name' column.");
        return;
    }

    // Map data to clean structure
    allProducts = data.map((item, index) => {
        return {
            name: item[productKey],
            no: noKey ? item[noKey] : `ITEM-${index + 1}`,
            image: imageKey ? item[imageKey] : null,
            link: linkKey ? item[linkKey] : null,
            index: index
        };
    }).filter(p => p.name); // Filter empty names

    renderProducts(allProducts);

    loadingEl.classList.add('hidden');
    controlsEl.classList.remove('hidden');
    productGrid.classList.remove('hidden');
}

function renderProducts(products) {
    productGrid.innerHTML = '';

    if (products.length === 0) {
        productGrid.innerHTML = '<p class="stats" style="grid-column: 1/-1; text-align: center; padding: 2rem;">No products found.</p>';
        productCountEl.textContent = '0 items';
        return;
    }

    productCountEl.textContent = `${products.length} item${products.length !== 1 ? 's' : ''}`;

    products.forEach((product, i) => {
        const card = createCard(product, i);
        productGrid.appendChild(card);
    });

    if (window.lucide) {
        lucide.createIcons();
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
        }
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
                onerror="this.onerror=null; this.src='baseImage.png'; this.style.objectFit='contain'; this.parentElement.style.padding='1rem';"
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
        </div>
        <div class="card-footer">
            <span style="display: flex; align-items: center; gap: 0.5rem;">
                <i data-lucide="package" style="width: 16px;"></i>
                In Stock
            </span>
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

function setupSearch() {
    searchInput.addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();

        const filtered = allProducts.filter(p =>
            p.name.toLowerCase().includes(term) ||
            String(p.no).toLowerCase().includes(term)
        );

        renderProducts(filtered);
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
