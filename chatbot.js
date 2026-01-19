const GEMINI_API_KEY = "AIzaSyDBOrQ8O6CJiNqlmmazKmbv1yqJPHt_Xo0";
const GEMINI_MODEL = "gemini-flash-latest";

let chatHistory = [];
let storeInfo = "";
let productListInfo = "";

// Set product list for AI context
window.productListInfo = "";
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
        const response = await fetch('storedetails.txt');
        if (!response.ok) throw new Error("Could not load storedetails.txt");
        storeInfo = await response.text();
    } catch (error) {
        console.error("Error loading store details:", error);
        // Fallback info if file is missing
        storeInfo = "Creative Rarities (نوادر إبداعية) - A premium store for unique gadgets and decor.";
    }
}

// Inject Chatbot HTML
function injectChatbot() {
    // Check if it already exists to prevent duplicates
    if (document.getElementById('ai-chatbot-container')) return;

    const chatbotHTML = `
        <div id="ai-chatbot-container" class="ai-chatbot-container">
            <div id="chatbot-window" class="chatbot-window hidden">
                <div class="chatbot-header">
                    <div class="chatbot-header-info">
                        <div class="chatbot-avatar">✨</div>
                        <div>
                            <h3 id="chatbot-title">Nawaderna AI</h3>
                            <span class="online-status">Online</span>
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
                <div id="chatbot-typing" class="chatbot-typing hidden">
                    Agent is thinking <div class="typing-dots"><span></span><span></span><span></span></div>
                </div>
                <div class="chatbot-input-area">
                    <input type="text" id="chatbot-input" placeholder="Type your message..." onkeypress="handleKeyPress(event)">
                    <button id="send-chat" onclick="sendMessage()">
                        <i data-lucide="send"></i>
                    </button>
                </div>
            </div>
            <button id="chatbot-toggle" class="chatbot-toggle" onclick="toggleChatbot()">
                <div class="chatbot-toggle-icon">
                    <i data-lucide="message-square"></i>
                </div>
                <span class="chatbot-label">AI Assistant</span>
            </button>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', chatbotHTML);
    if (window.lucide) lucide.createIcons();

    // Auto-scroll to bottom
    const messages = document.getElementById('chatbot-messages');
    if (messages) messages.scrollTop = messages.scrollHeight;
}

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

    // Add user message to UI
    appendMessage(text, 'user');
    input.value = '';

    // Show typing indicator
    const typing = document.getElementById('chatbot-typing');
    typing.classList.remove('hidden');

    // Prepare history for API (Gemini expects specific role format)
    const userMessage = { role: "user", parts: [{ text: text }] };

    // Construct the payload
    const payload = {
        contents: [...chatHistory, userMessage],
        system_instruction: {
            parts: [{
                text: `You are the Nawaderna Smart Agent (المساعد الذكي نوادرنا). 
            Follow these rules:
            1. Store Context: ${storeInfo}
            2. PRODUCT CATALOG: ${window.productListInfo || "Catalog loading..."}
            3. Respond in the user's language (English or Arabic/Jordanian).
            4. Be helpful, artistic, and premium.
            5. If the user wants to buy, tell them to use WhatsApp: +962795965910.
            6. CRITICAL: Use the "PRODUCT CATALOG" to answer about availability and prices. 
            7. If asked about the "last item", refer to the item with the highest number or the one at the start of the catalog list.
            8. Formatting: You can use **bold**, *italic*, and - bullet points.` }]
        }
    };

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (data.error) {
            throw new Error(data.error.message);
        }

        const botResponse = data.candidates[0].content.parts[0].text;

        // Update local history
        chatHistory.push(userMessage);
        chatHistory.push({ role: "model", parts: [{ text: botResponse }] });

        typing.classList.add('hidden');
        appendMessage(botResponse, 'bot');

    } catch (error) {
        console.error("Gemini Error:", error);
        typing.classList.add('hidden');
        const errorMsg = error.message && error.message.includes('not found')
            ? "Server error: The AI model configuration is currently being updated. Please try again in a few minutes."
            : "I'm having trouble connecting to the AI. Please check your internet or try again later.";
        appendMessage(errorMsg, 'bot');
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

    msgDiv.innerHTML = formattedText;
    container.appendChild(msgDiv);
    container.scrollTop = container.scrollHeight;
}

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
loadStoreDetails().then(() => {
    injectChatbot();
});
