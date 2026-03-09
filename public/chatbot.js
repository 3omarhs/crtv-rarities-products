let GEMINI_API_KEYS = [];
let currentKeyIndex = 0;
const GEMINI_MODEL = "gemini-flash-latest";

let chatHistory = [];
let storeInfo = "";
let productListInfo = "";

window.productListInfo = "";

const chatbotTranslations = {
    en: {
        suggestions: [
            "Show me best sellers",
            "How to order?",
            "Do you have aquarium decor?",
            "What are the latest items?"
        ],
        placeholder: "Type your message...",
        aiAssistant: "AI Assistant",
        online: "Online",
        titleSuffix: " AI",
        fullTitle: null
    },
    ar: {
        suggestions: [
            "أرني المنتجات الأكثر مبيعاً",
            "كيف يمكنني الطلب؟",
            "هل لديكم ديكورات أحواض سمك؟",
            "ما هي آخر المنتجات؟"
        ],
        placeholder: "اكتب رسالتك...",
        aiAssistant: "المساعد الذكي",
        online: "متصل",
        titleSuffix: " الذكي",
        fullTitle: "مساعد نوادرنا الذكي"
    }
};

window.setChatbotProducts = function (products) {
    if (!products || products.length === 0) {
        console.warn("Chatbot: Received empty product list.");
        return;
    }

    console.log(`Chatbot: Received ${products.length} products.`);

    // Create a concise list of products for the AI
    // Format: #[No]: [Name] ([Price] JOD) - [Category]
    // We reverse to match the "Last item" logic where the last in CSV is first in the list if we use .reverse() in app.js
    window.productListInfo = "\nCURRENT PRODUCT CATALOG:\n" + products.map(p => {
        let text = `ITEM #${p.no}: ${p.name}`;
        if (p.arabicName) text += ` / ${p.arabicName}`;
        if (p.price) text += ` (Price: ${p.price} JOD)`;
        if (p.category) text += ` - Category: ${p.category}`;
        return text;
    }).join('\n');
};

// Load store details from the file
async function loadStoreDetails() {
    try {
        const response = await fetch('/api/settings');
        if (!response.ok) throw new Error("Could not load settings");
        const settings = await response.json();
        storeInfo = settings.store_details_raw || "";
    } catch (error) {
        console.error("Error loading store details:", error);
        // Fallback info if file is missing
        storeInfo = "Creative Rarities (نوادر إبداعية) - A premium store for unique gadgets and decor.";
    }
}

// Load credentials from the file
async function loadCredentials() {
    try {
        console.log("Chatbot: Fetching credentials...");

        // Fetch keys from new endpoint
        try {
            const keysRes = await fetch('/api/gemini-keys');
            if (keysRes.ok) {
                const keysData = await keysRes.json();
                if (keysData.keys && Array.isArray(keysData.keys)) {
                    keysData.keys.forEach(k => {
                        if (k && !GEMINI_API_KEYS.includes(k)) GEMINI_API_KEYS.push(k);
                    });
                }
            }
        } catch (e) {
            console.warn("Could not fetch /api/gemini-keys", e);
        }

        // Fetch settings for fallback keys and name
        const response = await fetch('/api/settings');
        if (!response.ok) throw new Error("Could not load settings");
        const settings = await response.json();
        const text = settings.gemini_credentials_raw || "";

        // Parse the text
        const lines = text.split(/\r?\n/);
        lines.forEach(line => {
            const cleanLine = line.trim();
            if (cleanLine.toLowerCase().includes('gemini api key:')) {
                const key = cleanLine.split(/gemini api key:/i)[1].trim();
                // Add key only if we didn't get it from the other endpoint
                if (key && !GEMINI_API_KEYS.includes(key)) {
                    // GEMINI_API_KEYS.push(key); // We skip these old expired keys from settings.csv to be safe
                }
            }
            if (cleanLine.toLowerCase().startsWith('name:')) {
                const nameValue = cleanLine.split(/name:/i)[1].trim();
                window.CHATBOT_NAME = nameValue;
            }
        });

        if (GEMINI_API_KEYS.length === 0) {
            console.error("Chatbot: No API Keys found.");
            appendMessage("⚠️ System: No Gemini API Keys found. Please configure them in the admin dashboard.", 'bot');
        } else {
            console.log(`Chatbot: ${GEMINI_API_KEYS.length} credentials loaded successfully.`);
        }
    } catch (error) {
        console.error("Error loading credentials:", error);
        appendMessage("⚠️ System Error: Failed to load credentials file. " + error.message, 'bot');
    }
}


window.updateChatbotLanguage = function () {
    const lang = document.documentElement.lang === 'ar' ? 'ar' : 'en';
    const t = chatbotTranslations[lang];

    const input = document.getElementById('chatbot-input');
    if (input) input.placeholder = t.placeholder;

    const label = document.querySelector('.chatbot-label');
    if (label) label.textContent = t.aiAssistant;

    const status = document.querySelector('.online-status');
    if (status) status.textContent = t.online;

    const title = document.getElementById('chatbot-title');
    if (title) title.textContent = t.fullTitle || ((window.CHATBOT_NAME || 'Nawaderna') + t.titleSuffix);

    renderSuggestions(t.suggestions);
};

// Inject Chatbot HTML
function injectChatbot() {
    // Check if it already exists to prevent duplicates
    if (document.getElementById('ai-chatbot-container')) return;

    const lang = document.documentElement.lang === 'ar' ? 'ar' : 'en';
    const t = chatbotTranslations[lang];

    const chatbotHTML = `
        <div id="ai-chatbot-container" class="ai-chatbot-container">
            <div id="chatbot-window" class="chatbot-window hidden">
                <div class="chatbot-header">
                    <div class="chatbot-header-info">
                        <div class="chatbot-avatar">✨</div>
                        <div>
                            <h3 id="chatbot-title">${t.fullTitle || (window.CHATBOT_NAME || 'Nawaderna') + t.titleSuffix}</h3>
                            <span class="online-status">${t.online}</span>
                        </div>
                    </div>
                    <button id="close-chatbot" class="close-chatbot" onclick="toggleChatbot()">
                        <i data-lucide="x"></i>
                    </button>
                </div>
                <div id="chatbot-messages" class="chatbot-messages">
                    <div class="message bot-message">
                        Hello! How can I help you discover something rare today? ✨
                        <br>أهلاً بك! كيف يمكنني مساعدتك في اكتشاف شيء فريد اليوم؟
                    </div>
                </div>
                <div id="chatbot-suggestions" class="chatbot-suggestions">
                    <!-- Suggestions will be injected here -->
                </div>
                <div id="chatbot-typing" class="chatbot-typing hidden">
                    Agent is thinking <div class="typing-dots"><span></span><span></span><span></span></div>
                </div>
                <div class="chatbot-input-area">
                    <input type="text" id="chatbot-input" placeholder="${t.placeholder}" onkeypress="handleKeyPress(event)">
                    <button id="send-chat" onclick="sendMessage()">
                        <i data-lucide="send"></i>
                    </button>
                </div>
            </div>
            <button id="chatbot-toggle" class="chatbot-toggle" onclick="toggleChatbot()">
                <div class="chatbot-toggle-icon">
                    <i data-lucide="message-square"></i>
                </div>
                <span class="chatbot-label">${t.aiAssistant}</span>
            </button>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', chatbotHTML);
    if (window.lucide) lucide.createIcons();

    // Add default suggestions based on current language
    renderSuggestions(t.suggestions);

    // Auto-scroll to bottom
    const messages = document.getElementById('chatbot-messages');
    if (messages) messages.scrollTop = messages.scrollHeight;
}

function renderSuggestions(suggestions) {
    const container = document.getElementById('chatbot-suggestions');
    if (!container) return;

    container.innerHTML = suggestions.map(s =>
        `<button class="suggestion-chip" onclick="sendSuggestion('${s}')">${s}</button>`
    ).join('');
}

window.sendSuggestion = function (text) {
    const input = document.getElementById('chatbot-input');
    input.value = text;
    sendMessage();
};

function toggleChatbot() {
    const windowEl = document.getElementById('chatbot-window');
    windowEl.classList.toggle('hidden');

    const container = document.getElementById('ai-chatbot-container');
    if (document.body.classList.contains('rtl') || document.dir === 'rtl') {
        container.classList.add('rtl');
    } else {
        container.classList.remove('rtl');
    }
}

function handleKeyPress(e) {
    if (e.key === 'Enter') {
        sendMessage();
    }
}

async function sendMessage() {
    const input = document.getElementById('chatbot-input');
    const text = input.value.trim();
    if (!text) return;

    if (GEMINI_API_KEYS.length === 0) {
        appendMessage("System error: Chatbot credentials are not loaded. Please ensure geminiCredintials.txt is present and contains valid API Keys.", 'bot');
        return;
    }

    // Add user message to UI
    appendMessage(text, 'user');
    input.value = '';

    // Hide suggestions
    const suggestionsBox = document.getElementById('chatbot-suggestions');
    if (suggestionsBox) suggestionsBox.style.display = 'none';

    // Show typing indicator
    const typing = document.getElementById('chatbot-typing');
    typing.classList.remove('hidden');

    // Prepare history for API (Gemini expects specific role format)
    const userMessage = { role: "user", parts: [{ text: text }] };

    // Prepare context: System instructions as the first message
    const systemPrompt = `You are the Nawaderna Smart Agent (المساعد الذكي نوادرنا). 
            Follow these rules:
            1. Store Context: ${storeInfo}
            2. PRODUCT CATALOG: ${window.productListInfo || "Catalog loading..."}
            3. Respond in the user's language (English or Arabic/Jordanian).
            4. Be helpful, artistic, and premium.
            5. MANDATORY: You must end EVERY single response by offering the WhatsApp number for orders/support: +962795965910. This is required for every message.
            6. CRITICAL: Use the "PRODUCT CATALOG" to answer about availability and prices. 
            7. If asked about the "last item", refer to the item with the highest number or the one at the start of the catalog list.
            8. Formatting: You can use **bold**, *italic*, and - bullet points.
            9. When mentioning a product, ALWAYS use the format ITEM #[Number] (e.g., ITEM #TRND-1225) so the UI can create a direct link button.`;

    const contents = [
        { role: "user", parts: [{ text: `CONTEXT & RULES: ${systemPrompt}\n\nPlease keep these rules in mind for all following messages. Respond only with 'OK, I am ready' if you understand.` }] },
        { role: "model", parts: [{ text: "OK, I am ready. I will follow all rules and use the provided product catalog to assist you." }] },
        ...chatHistory,
        userMessage
    ];

    const payload = {
        contents: contents
    };

    let success = false;
    let attempts = 0;
    const maxAttempts = GEMINI_API_KEYS.length;

    while (attempts < maxAttempts && !success) {
        const currentKey = GEMINI_API_KEYS[currentKeyIndex];
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

        try {
            console.log(`Chatbot: Requesting with key #${currentKeyIndex + 1} (${attempts + 1}/${maxAttempts})...`);
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${currentKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            const data = await response.json();

            if (data.error) {
                console.error("DEBUG API ERROR:", data.error);
                if (data.error.code === 429) {
                    currentKeyIndex = (currentKeyIndex + 1) % GEMINI_API_KEYS.length;
                    attempts++;
                    continue;
                }
                throw new Error(data.error.message || "Unknown API Error");
            }

            const botResponse = data.candidates && data.candidates[0].content
                ? data.candidates[0].content.parts[0].text
                : "I'm sorry, I couldn't formulate a response. Please try again.";

            // Update local history (Keep last 10 turns for stability)
            chatHistory.push(userMessage);
            chatHistory.push({ role: "model", parts: [{ text: botResponse }] });
            if (chatHistory.length > 20) chatHistory = chatHistory.slice(-20);

            typing.classList.add('hidden');
            appendMessage(botResponse, 'bot');
            success = true;

        } catch (error) {
            clearTimeout(timeoutId);
            console.error(`Attempt with key #${currentKeyIndex + 1} failed:`, error);

            let displayError = error.message;
            if (error.name === 'AbortError') displayError = "Request timed out after 15 seconds.";

            if (attempts >= maxAttempts - 1) {
                typing.classList.add('hidden');
                let errorMsg = `API Error: ${displayError}`;

                if (displayError.toLowerCase().includes('quota') || displayError.includes('429')) {
                    errorMsg = "Limit reached on all available keys! Please try again in 1 minute.";
                } else if (displayError.includes('403')) {
                    errorMsg = "Access Denied: Your API key has been reported as leaked or disabled.";
                }

                appendMessage(errorMsg, 'bot');
                success = false; // Mark as failed
                break; // Exit loop
            } else {
                currentKeyIndex = (currentKeyIndex + 1) % GEMINI_API_KEYS.length;
                attempts++;
            }
        }
    }

    // Final cleanup if everything failed and loop ended naturally (e.g. all 429s)
    if (!success && attempts >= maxAttempts) {
        typing.classList.add('hidden');
        appendMessage("Limit reached on all available keys! Please try again in 1 minute.", 'bot');
    }
}

function appendMessage(text, side) {
    const container = document.getElementById('chatbot-messages');
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${side}-message`;

    // Advanced Markdown to HTML conversion
    let formattedText = text
        .replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>') // Bold Italic
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')             // Bold
        .replace(/\*(.*?)\*/g, '<em>$1</em>')                         // Italic
        .replace(/^\s*[\-\*]\s+(.*)/gm, '• $1')                       // Bullets at start of lines
        .replace(/\n/g, '<br>');                                      // New lines

    // 1. Make URLs clickable
    const urlRegex = /(https?:\/\/[^\s<]+)/g;
    formattedText = formattedText.replace(urlRegex, '<a href="$1" target="_blank" class="chatbot-link">$1</a>');

    // 2. Make WhatsApp Number Clickable
    const waRegex = /(\+?962795965910)/g;
    formattedText = formattedText.replace(waRegex, (match) => {
        const message = encodeURIComponent("Hi, I would Like to order. May I get your assestant.");
        return `<a href="https://wa.me/962795965910?text=${message}" target="_blank" class="chatbot-link" style="color:#25d366; font-weight:bold; text-decoration:none;">${match} <i data-lucide="message-circle" style="width:14px; vertical-align:middle;"></i></a>`;
    });

    // 3. Make Item Numbers Copyable and add "View Product" buttons
    // Format: ITEM #123 or ITEM #TRND-1225- (Support hyphens and letters)
    const itemRegex = /ITEM\s*#([a-zA-Z0-9-]+)/gi;
    formattedText = formattedText.replace(itemRegex, (match, itemNo) => {
        return `
            <div class="item-number-wrapper">
                <span style="font-weight:bold; color:var(--accent);">ITEM #${itemNo}</span>
                <button class="copy-item-num" onclick="copyToClipboard('${itemNo}', this)" title="Copy Item Number">
                    <i data-lucide="copy"></i>
                </button>
                <button class="chatbot-item-btn" onclick="openCardByNumber('${itemNo}')">
                    <i data-lucide="external-link"></i> ${document.body.classList.contains('rtl') ? 'عرض المنتج' : 'View Product'}
                </button>
            </div>
        `;
    });

    msgDiv.innerHTML = formattedText;
    container.appendChild(msgDiv);

    // Initialize icons for the new message
    if (window.lucide) lucide.createIcons();

    container.scrollTop = container.scrollHeight;
}

window.copyToClipboard = function (text, btn) {
    navigator.clipboard.writeText(text).then(() => {
        const icon = btn.querySelector('i');
        const originalInner = btn.innerHTML;
        btn.innerHTML = '<i data-lucide="check" style="color:#10b981;"></i>';
        if (window.lucide) lucide.createIcons();
        setTimeout(() => {
            btn.innerHTML = originalInner;
            if (window.lucide) lucide.createIcons();
        }, 2000);
    });
};

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
                // Check if the card content contains the item number
                // We added a .card-number span in app.js, so we can check that or innerText
                const cardText = card.innerText || "";
                if (cardText.includes(itemNo) || cardText.includes(`#${itemNo}`)) {

                    // Force Expand Logic
                    if (!card.classList.contains('expanded')) {
                        // If we have a direct reference to the open logic, use it, otherwise simulate click
                        // Since app.js handles the click, we can simulate it. 
                        // However, we must ensure we don't click a sub-element.
                        card.click();
                    } else {
                        // Already expanded, just scroll
                    }

                    // Smooth scroll to it
                    setTimeout(() => {
                        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }, 100);
                }
            });
        }, 500); // Increased timeout slightly to ensure render
    }
};

// Watch for RTL changes
const observer = new MutationObserver(() => {
    const container = document.getElementById('ai-chatbot-container');
    if (container) {
        if (document.body.classList.contains('rtl')) {
            container.classList.add('rtl');
        } else {
            container.classList.remove('rtl');
        }
    }
});
observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });

// Initialize
Promise.all([loadStoreDetails(), loadCredentials()]).then(() => {
    injectChatbot();
});
