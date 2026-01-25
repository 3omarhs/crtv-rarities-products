
function setupCart() {
    const cartSidebar = document.getElementById('cart-sidebar');
    const cartToggle = document.getElementById('cart-toggle'); // Nav icon
    const chatbotToggle = document.getElementById('chatbot-product-context') ? null : document.querySelector('.cart-btn'); // Fallback or secondary

    // Close Button
    document.getElementById('close-cart').addEventListener('click', () => {
        cartSidebar.classList.remove('open');
    });

    // Toggle Button (Mobile/Nav)
    if (cartToggle) {
        cartToggle.addEventListener('click', () => {
            cartSidebar.classList.add('open');
        });
    }

    // Secondary Toggle (if any)
    const secondaryToggle = document.querySelector('.cart-btn-secondary'); // Example class
    if (secondaryToggle) {
        secondaryToggle.addEventListener('click', () => {
            cartSidebar.classList.add('open');
        });
    }

    // Checkout Button Listener
    const checkoutBtn = document.getElementById('checkout-btn');
    if (checkoutBtn) {
        // Use onclick to overwrite any potentially bad listeners or just ensure clarity
        checkoutBtn.onclick = (e) => {
            e.preventDefault();
            if (window.openCheckoutModal) {
                window.openCheckoutModal();
            } else {
                console.error("openCheckoutModal not found");
            }
        };
    }
}
