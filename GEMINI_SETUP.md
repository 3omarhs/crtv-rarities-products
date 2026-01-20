# 🤖 Nawaderna AI Assistant Setup

I have integrated the **Nawaderna AI Assistant** into your store. This assistant is powered by **Google Gemini (1.5 Flash)** and is fully aware of your store's identity.

## 🛠 How it Works

1.  **Direct API Integration**: The chatbot connects directly to Google Generative AI using the key provided in `geminiCredintials.txt`.
2.  **Store Awareness**: On every load, the assistant reads `storedetails.txt`. It uses this information as its "System Instructions" to ensure it understands your brand, links, and product themes.
3.  **Bilingual Support**: It automatically detects the user's language and replies accordingly (English or Arabic/Jordanian).
4.  **Contextual Memory**: The assistant remembers the conversation during the session, allowing for natural follow-up questions.

## 📂 Implementation Details

- **`chatbot.js`**: Contains the Gemini API logic and UI injection.
- **`chatbot-styles.css`**: Contains the premium, glassmorphism-inspired design for the chat window.
- **`index.html`**: Updated to include the new script and styles.

## 🚀 Deployment Notes

- Ensure `storedetails.txt` remains in the root directory, as the bot fetches it to stay updated on your store's info.
- **Load Balancing**: You can add multiple `Gemini API Key:` lines to `geminiCredintials.txt`. The chatbot will automatically rotate between them and retry if one hits its quota limit.
- The API key is dynamically loaded from `geminiCredintials.txt`. Ensure this file is present and correctly formatted. For better security in production, consider moving the key to a secure backend proxy or environment variables.

---
*Created by Antigravity AI Assistant*
