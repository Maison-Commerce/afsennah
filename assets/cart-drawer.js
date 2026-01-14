/* global SideDrawer */

class CartDrawer extends SideDrawer {
  connectedCallback() {
    this.bindEvents();
    this.initUpsellButtons();
  }

  bindEvents() {
    this.openDrawerViaEventHandler = this.handleDrawerOpenViaEvent.bind(this);
    this.closeDrawerViaEventHandler = this.close.bind(this, null);
    document.addEventListener('dispatch:cart-drawer:open', this.openDrawerViaEventHandler);
    document.addEventListener('dispatch:cart-drawer:close', this.closeDrawerViaEventHandler);
    document.addEventListener('dispatch:cart-drawer:refresh', this.cartRefreshHandler);
    this.addEventListener('on:cart-drawer:before-open', () => {
      theme.manuallyLoadImages(this);
      this.querySelectorAll('cc-cart-cross-sell').forEach((el) => el.init());
    });
    this.addEventListener('on:cart:after-merge', () => {
      theme.manuallyLoadImages(this);
      this.querySelectorAll('cc-cart-cross-sell').forEach((el) => el.init());
      // Re-initialize upsell buttons after cart merge
      this.initUpsellButtons();
      // Update button states
      this.updateUpsellButtonStates();
    });
  }

  disconnectedCallback() {
    document.removeEventListener('dispatch:cart-drawer:refresh', this.cartRefreshHandler);
    document.removeEventListener('dispatch:cart-drawer:open', this.openDrawerViaEventHandler);
    document.removeEventListener('dispatch:cart-drawer:close', this.closeDrawerViaEventHandler);
    
    // Cleanup upsell button handlers
    if (this.upsellClickHandler) {
      document.removeEventListener('click', this.upsellClickHandler);
    }
    if (this.upsellObserver) {
      this.upsellObserver.disconnect();
    }
  }

  /**
   * Handle when the drawer is opened via an event
   * @param {object} evt - Event object.
   */
  handleDrawerOpenViaEvent(evt) {
    this.open(evt.detail ? evt.detail.opener : null);
  }

  /**
   * Trigger refresh of contents
   */
  cartRefreshHandler() {
    this.querySelector('cart-form').refresh();
  }

  /**
   * Update section's cart-form element with new contents
   * @param {string} html - Whole-section HTML.
   */
  updateFromCartChange(html) {
    this.querySelector('cart-form').refreshFromHtml(html);
  }

  /**
   * Initialize upsell product buttons handler
   */
  initUpsellButtons() {
    console.log('[Cart Upsell] Initializing upsell buttons handler');
    
    // Remove existing handler if any
    if (this.upsellClickHandler) {
      document.removeEventListener('click', this.upsellClickHandler);
    }
    
    // Create click handler for upsell buttons
    this.upsellClickHandler = (e) => {
      const addBtn = e.target.closest('.cart-upsell-product__add-btn');
      
      if (!addBtn) {
        return;
      }
      
      // Only handle clicks within cart drawer
      if (!this.contains(addBtn)) {
        return;
      }
      
      console.log('[Cart Upsell] ===== ADD BUTTON CLICKED =====');
      
      e.preventDefault();
      const productCard = addBtn.closest('.cart-upsell-product');
      const variantId = addBtn.dataset.variantId;
      const productId = productCard ? productCard.dataset.productId : null;
      
      console.log('[Cart Upsell] Starting add to cart:', { variantId, productId });
      
      if (!variantId) {
        console.warn('[Cart Upsell] No variantId found, aborting');
        return;
      }
      
      // Check if product requires quiz
      const requiresQuiz = addBtn.dataset.requiresQuiz === 'true';
      
      if (requiresQuiz) {
        // Get quiz URL and redirect
        const quizUrl = addBtn.dataset.quizUrl || productCard?.dataset.quizUrl || '/pages/get-your-formula';
        console.log('[Cart Upsell] Product requires quiz, redirecting to:', quizUrl);
        window.location.href = quizUrl;
        return;
      }
      
      // Get product tags to verify
      const productTagsJson = productCard?.dataset.productTags;
      let productTags = [];
      try {
        productTags = productTagsJson ? JSON.parse(productTagsJson) : [];
      } catch (e) {
        console.warn('[Cart Upsell] Error parsing product tags:', e);
      }
      
      // Check if product has "no consult" tag
      const hasNoConsultTag = productTags.some(tag =>
        tag.toLowerCase() === 'no consult' || tag.toLowerCase() === 'no-consult'
      );
      
      // Check if quiz is completed
      const quizCompleted = localStorage.getItem('quiz_completed') === 'true';
      
      // If product doesn't have "no consult" tag and quiz is not completed, redirect to quiz
      if (!hasNoConsultTag && !quizCompleted) {
        const quizUrl = productCard?.dataset.quizUrl || '/pages/get-your-formula';
        console.log('[Cart Upsell] Quiz not completed, redirecting to:', quizUrl);
        window.location.href = quizUrl;
        return;
      }
      
      // Disable button during request
      addBtn.classList.add('loading');
      addBtn.disabled = true;
      
      console.log('[Cart Upsell] Sending request to /cart/add.js');
      
      // Add to cart using /cart/add.js
      fetch('/cart/add.js', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: variantId,
          quantity: 1
        })
      })
      .then(response => {
        console.log('[Cart Upsell] Response received:', { ok: response.ok, status: response.status, statusText: response.statusText });
        if (!response.ok) {
          return response.json().then(data => {
            console.error('[Cart Upsell] Response error:', data);
            throw new Error(data.description || data.message || `HTTP error! Status: ${response.status}`);
          });
        }
        return response.json();
      })
      .then(data => {
        console.log('[Cart Upsell] Response data:', data);
        
        // Check for errors in response
        if (data.status) {
          const error = typeof data.description === 'string' ? data.description : data.message;
          console.error('[Cart Upsell] Error in response data:', error);
          addBtn.classList.remove('loading');
          addBtn.disabled = false;
          return;
        }
        
        console.log('[Cart Upsell] Successfully added to cart, dispatching events');
        
        // Dispatch cart add event first (for compatibility)
        const addEvent = new CustomEvent('on:cart:add', {
          bubbles: true,
          detail: {
            variantId: data.variant_id || variantId
          }
        });
        console.log('[Cart Upsell] Dispatching on:cart:add event:', addEvent.detail);
        document.dispatchEvent(addEvent);
        
        // Dispatch cart drawer refresh event
        const refreshEvent = new CustomEvent('dispatch:cart-drawer:refresh', { bubbles: true, cancelable: false });
        console.log('[Cart Upsell] Dispatching dispatch:cart-drawer:refresh event');
        document.dispatchEvent(refreshEvent);
        
        // Also dispatch cart change event for CartForm
        const changeEvent = new CustomEvent('on:cart:change', { bubbles: true, cancelable: false });
        console.log('[Cart Upsell] Dispatching on:cart:change event');
        document.dispatchEvent(changeEvent);
        
        // Check cart drawer state
        const cartDrawer = document.querySelector('cart-drawer');
        const cartForm = cartDrawer ? cartDrawer.querySelector('cart-form') : null;
        console.log('[Cart Upsell] Cart drawer state:', {
          cartDrawerExists: !!cartDrawer,
          cartFormExists: !!cartForm,
          cartFormHasRefresh: cartForm && typeof cartForm.refresh === 'function',
          cartDrawerOpen: cartDrawer && cartDrawer.hasAttribute('open')
        });
        
        // Check for UpCart
        console.log('[Cart Upsell] UpCart check:', {
          upcartRefreshCartExists: typeof window.upcartRefreshCart === 'function',
          upcartRefreshCartType: typeof window.upcartRefreshCart
        });
        
        // Re-enable button
        addBtn.classList.remove('loading');
        addBtn.disabled = false;
        console.log('[Cart Upsell] Add to cart completed successfully');
      })
      .catch(error => {
        console.error('[Cart Upsell] Error adding to cart:', error);
        console.error('[Cart Upsell] Error details:', {
          message: error.message,
          stack: error.stack,
          name: error.name
        });
        addBtn.classList.remove('loading');
        addBtn.disabled = false;
      });
    };
    
    // Add click handler
    document.addEventListener('click', this.upsellClickHandler);
    console.log('[Cart Upsell] Click handler attached');
    
    // Setup MutationObserver to watch for dynamically added upsell products
    if (this.upsellObserver) {
      this.upsellObserver.disconnect();
    }
    
    const observeTarget = this.querySelector('.cart-item-upsells') || this;
    console.log('[Cart Upsell] Setting up MutationObserver on:', observeTarget);
    
    this.upsellObserver = new MutationObserver((mutations) => {
      let hasNewButtons = false;
      
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === 1) { // Element node
            // Check if the added node is a button or contains buttons
            if (node.matches && node.matches('.cart-upsell-product__add-btn')) {
              hasNewButtons = true;
              console.log('[Cart Upsell] New button added:', node);
            } else if (node.querySelector && node.querySelector('.cart-upsell-product__add-btn')) {
              hasNewButtons = true;
              const buttons = node.querySelectorAll('.cart-upsell-product__add-btn');
              console.log('[Cart Upsell] New buttons added in container:', buttons.length, node);
            }
          }
        });
      });
      
      if (hasNewButtons) {
        console.log('[Cart Upsell] New upsell buttons detected');
        // Update button states for new buttons
        this.updateUpsellButtonStates();
      }
    });
    
    this.upsellObserver.observe(observeTarget, {
      childList: true,
      subtree: true
    });
    
    console.log('[Cart Upsell] MutationObserver active');
    
    // Check existing buttons
    const buttons = this.querySelectorAll('.cart-upsell-product__add-btn');
    console.log('[Cart Upsell] Found buttons in cart drawer:', buttons.length);
    
    // Initialize button states (check quiz status and update button text)
    this.updateUpsellButtonStates();
  }
  
  /**
   * Update upsell button states based on quiz completion and product tags
   */
  updateUpsellButtonStates() {
    const productCards = this.querySelectorAll('.cart-upsell-product');
    
    productCards.forEach(productCard => {
      const addBtn = productCard.querySelector('.cart-upsell-product__add-btn');
      const btnText = productCard.querySelector('.cart-upsell-product__btn-text');
      
      if (!addBtn || !btnText) return;
      
      // Get product tags
      const productTagsJson = productCard.dataset.productTags;
      let productTags = [];
      try {
        productTags = productTagsJson ? JSON.parse(productTagsJson) : [];
      } catch (e) {
        console.warn('[Cart Upsell] Error parsing product tags:', e);
      }
      
      // Check if product has "no consult" tag
      const hasNoConsultTag = productTags.some(tag =>
        tag.toLowerCase() === 'no consult' || tag.toLowerCase() === 'no-consult'
      );
      
      // Check if quiz is completed
      const quizCompleted = localStorage.getItem('quiz_completed') === 'true';
      
      // Get quiz URL and text from data attributes
      const quizUrl = productCard.dataset.quizUrl || '/pages/get-your-formula';
      const quizText = productCard.dataset.quizText || 'Get Your Formula';
      
      // Update button state
      if (!hasNoConsultTag && !quizCompleted) {
        // Show "Get Your Formula" button
        btnText.textContent = quizText;
        addBtn.dataset.requiresQuiz = 'true';
        addBtn.dataset.quizUrl = quizUrl;
      } else {
        // Show regular "Add" button
        btnText.textContent = 'Add';
        addBtn.dataset.requiresQuiz = 'false';
      }
    });
  }
}

window.customElements.define('cart-drawer', CartDrawer);
