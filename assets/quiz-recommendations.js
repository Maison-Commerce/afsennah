(function() {
    let cartItems = [];
    let initialized = false;
    let productStates = {};

    // BOGO configuration
    let bogoEnabled = false;
    let bogoProductHandles = [];
    let bogoBadgeText = 'BUY 1 GET 1 FREE';
    let bogoCartText = 'Buy 1 Get 1 Free';

    // Tiered Gift System configuration
    let giftTiersEnabled = false;
    let giftTiers = []; // Array of { tier, threshold, femaleHandle, maleHandle, bannerText, description, product: null, unlocked: false }
    let giftProgressText = '';
    let giftCompleteText = '';
    let currentGiftProducts = {}; // Track which gift products are in cart by tier
    let userGender = 'female'; // Default to female, will be set from quiz answers

    function initGiftTiers() {
        console.log('initGiftTiers called');
        const container = document.querySelector('[data-gift-tiers-enabled]');
        console.log('Gift tiers container found:', !!container);

        if (!container || container.dataset.giftTiersEnabled !== 'true') {
            console.log('Gift tiers NOT enabled');
            giftTiersEnabled = false;
            return;
        }

        console.log('Gift tiers ENABLED');
        giftTiersEnabled = true;
        giftProgressText = container.dataset.progressText || 'Spend [[remaining]] more to unlock your next gift!';
        giftCompleteText = container.dataset.completeText || 'You have unlocked all free gifts!';

        // Get user gender from QuizManager
        if (window.QuizManager && window.QuizManager.answers && window.QuizManager.answers.gender) {
            userGender = window.QuizManager.answers.gender.value === 'male' ? 'male' : 'female';
        }
        console.log('Gift tiers - User gender:', userGender);

        // Parse tier configurations
        giftTiers = [];
        for (let i = 1; i <= 3; i++) {
            const threshold = parseInt(container.dataset[`tier${i}Threshold`]) || 0;
            const femaleHandle = container.dataset[`tier${i}Female`] || '';
            const femaleVariantId = container.dataset[`tier${i}VariantFemale`] || '';
            const maleHandle = container.dataset[`tier${i}Male`] || '';
            const maleVariantId = container.dataset[`tier${i}VariantMale`] || '';
            const bannerText = container.dataset[`tier${i}Banner`] || `Tier ${i} Gift`;
            const description = container.dataset[`tier${i}Description`] || '';

            console.log(`Tier ${i}: threshold=${threshold}, femaleHandle=${femaleHandle}, maleHandle=${maleHandle}`);

            // Only add tier if threshold > 0 and at least one product is set
            if (threshold > 0 && (femaleHandle || maleHandle)) {
                giftTiers.push({
                    tier: i,
                    threshold,
                    femaleHandle,
                    femaleVariantId: femaleVariantId ? parseInt(femaleVariantId) : null,
                    maleHandle,
                    maleVariantId: maleVariantId ? parseInt(maleVariantId) : null,
                    bannerText,
                    description,
                    product: null,
                    variantId: null, // Will be set when product is fetched
                    unlocked: false
                });
            }
        }

        // Sort by threshold ascending
        giftTiers.sort((a, b) => a.threshold - b.threshold);
        console.log('Gift tiers configured:', giftTiers);
        console.log('Number of tiers:', giftTiers.length);

        // Fetch gift products
        giftTiers.forEach(tier => {
            const isMale = userGender === 'male' && tier.maleHandle;
            const handle = isMale ? tier.maleHandle : tier.femaleHandle;
            const specifiedVariantId = isMale ? tier.maleVariantId : tier.femaleVariantId;

            if (handle) {
                fetch(`/products/${handle}.js`)
                    .then(res => res.ok ? res.json() : null)
                    .then(product => {
                        if (product) {
                            tier.product = product;
                            // Use specified variant ID or default to first variant
                            if (specifiedVariantId) {
                                const variant = product.variants.find(v => v.id === specifiedVariantId);
                                tier.variantId = variant ? variant.id : product.variants[0].id;
                            } else {
                                tier.variantId = product.variants[0].id;
                            }
                            console.log(`Tier ${tier.tier} gift: ${product.title}, variant ID: ${tier.variantId}`);
                            renderGiftTiers();
                        }
                    })
                    .catch(err => console.error(`Error fetching gift product ${handle}:`, err));
            }
        });

        // Initial render
        renderGiftTiers();

        // Setup mobile toggle for gift cards (only once)
        const toggleBtn = document.querySelector('[data-gift-toggle]');
        const giftCardsContainer = document.querySelector('[data-gift-cards-container]');

        if (toggleBtn && giftCardsContainer && !toggleBtn.hasAttribute('data-toggle-initialized')) {
            toggleBtn.setAttribute('data-toggle-initialized', 'true');
            toggleBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const isExpanded = toggleBtn.getAttribute('aria-expanded') === 'true';
                toggleBtn.setAttribute('aria-expanded', String(!isExpanded));
                giftCardsContainer.classList.toggle('expanded', !isExpanded);
            });
        }
    }

    function getCartTotalForGifts() {
        // Calculate cart total for non-gift, non-bogo-free items
        // IMPORTANT: Returns total in shop's BASE currency (EUR) for threshold comparison
        let total = 0;
        cartItems.forEach(item => {
            if (item.isGift || item.isBogoFree) return;

            // Get price from the correct variant (this is in user's selected currency)
            let variantPrice;
            if (item.product.selectedVariant) {
                variantPrice = item.product.selectedVariant.price;
            } else {
                const variant = item.product.variants.find(v => v.id === parseInt(item.variantId));
                variantPrice = variant ? variant.price : item.product.variants[0].price;
            }

            // Apply subscription discount if applicable
            if (item.sellingPlanId && item.product.selling_plan_groups) {
                const sellingPlanGroup = item.product.selling_plan_groups[0];
                const sellingPlan = sellingPlanGroup?.selling_plans?.find(sp => sp.id == item.sellingPlanId);
                if (sellingPlan) {
                    variantPrice = calculateSubscriptionPrice(variantPrice, sellingPlan);
                }
            }

            total += variantPrice * item.quantity;
        });

        // Convert from cents to whole units
        let totalInCurrency = total / 100;

        // Convert back to base currency (EUR) if user is viewing in a different currency
        // Shopify.currency.rate is the conversion rate FROM base currency TO active currency
        // So to convert back to base currency, we divide by the rate
        const shopBaseCurrency = 'EUR';

        if (typeof Shopify !== 'undefined' && Shopify.currency && Shopify.currency.rate) {
            const rate = parseFloat(Shopify.currency.rate);
            const activeCurrency = Shopify.currency.active;

            // Only convert if rate is not 1 (meaning user is not viewing in base currency)
            if (rate && rate !== 1) {
                const originalTotal = totalInCurrency;
                totalInCurrency = totalInCurrency / rate;
                console.log(`Cart total converted: ${originalTotal.toFixed(2)} ${activeCurrency} -> ${totalInCurrency.toFixed(2)} ${shopBaseCurrency} (rate: ${rate})`);
            }
        }

        return totalInCurrency;
    }

    function updateGiftTiers() {
        if (!giftTiersEnabled || giftTiers.length === 0) return;

        const cartTotal = getCartTotalForGifts();
        console.log('Updating gift tiers - Cart total:', cartTotal);

        // Determine which tiers are now unlocked
        giftTiers.forEach(tier => {
            const wasUnlocked = tier.unlocked;
            tier.unlocked = cartTotal >= tier.threshold;

            // Handle adding/removing gifts
            if (tier.unlocked && !wasUnlocked && tier.product) {
                // Tier just became unlocked - add gift
                console.log(`Tier ${tier.tier} unlocked! Adding gift:`, tier.product.title);
                addGiftToCart(tier);
            } else if (!tier.unlocked && wasUnlocked && tier.product) {
                // Tier just became locked - remove gift
                console.log(`Tier ${tier.tier} locked! Removing gift:`, tier.product.title);
                removeGiftFromCart(tier);
            }
        });

        renderGiftTiers();
    }

    function addGiftToCart(tier) {
        // Gifts are no longer added to cartItems - they're only displayed visually
        // The actual gift products will be added by the backend/discount system
        if (!tier.product || !tier.variantId) return;

        currentGiftProducts[tier.tier] = tier.variantId;
        console.log(`Gift unlocked for tier ${tier.tier}:`, tier.product.title);
    }

    function removeGiftFromCart(tier) {
        // Gifts are no longer in cartItems - just update the tracking object
        delete currentGiftProducts[tier.tier];
        console.log(`Gift locked for tier ${tier.tier}`);
    }

    function renderGiftTiers() {
        if (!giftTiersEnabled) return;

        const cartTotal = getCartTotalForGifts();
        const progressBar = document.querySelector('[data-gift-progress-bar]');
        const progressLabel = document.querySelector('[data-gift-progress-label]');
        const milestonesContainer = document.querySelector('[data-gift-milestones]');
        const cardsContainer = document.querySelector('[data-gift-cards-container]');

        if (!progressBar || !progressLabel || !cardsContainer) return;

        // Find the next tier to unlock and max threshold
        const maxThreshold = giftTiers.length > 0 ? giftTiers[giftTiers.length - 1].threshold : 1;
        const nextTier = giftTiers.find(t => !t.unlocked);
        const allUnlocked = !nextTier;

        // Update progress bar
        const progressPercent = Math.min((cartTotal / maxThreshold) * 100, 100);
        progressBar.style.width = `${progressPercent}%`;

        // Helper to format currency for display (with conversion if available)
        // Note: amountInBaseCurrency is in EUR (shop's base currency)
        const formatCurrency = (amountInBaseCurrency) => {
            let cents = Math.round(amountInBaseCurrency * 100);

            // Convert from base currency (EUR) to user's active currency using Shopify.currency.rate
            if (typeof Shopify !== 'undefined' && Shopify.currency && Shopify.currency.rate) {
                const rate = parseFloat(Shopify.currency.rate);
                if (rate && rate !== 1) {
                    cents = Math.round(cents * rate);
                }
            }

            // Format using Shopify's money format
            const formatted = formatMoney(cents);
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = formatted;
            return tempDiv.textContent || tempDiv.innerText || formatted;
        };

        // Update progress label
        if (allUnlocked) {
            progressLabel.textContent = giftCompleteText;
        } else if (nextTier) {
            const remaining = nextTier.threshold - cartTotal;
            let labelText = giftProgressText
                .replace('[[remaining]]', formatCurrency(remaining))
                .replace('[[current]]', formatCurrency(cartTotal))
                .replace('[[next_tier]]', formatCurrency(nextTier.threshold));
            progressLabel.textContent = labelText;
        }

        // Render milestones
        if (milestonesContainer) {
            milestonesContainer.innerHTML = '';
            giftTiers.forEach(tier => {
                const milestone = document.createElement('div');
                milestone.className = `gift-milestone ${tier.unlocked ? 'reached' : ''}`;
                milestone.dataset.tier = tier.tier;
                milestone.style.left = `${(tier.threshold / maxThreshold) * 100}%`;
                milestonesContainer.appendChild(milestone);
            });
        }

        // Render gift cards - preserve expanded state
        const wasExpanded = cardsContainer.classList.contains('expanded');
        cardsContainer.innerHTML = '';
        if (wasExpanded) {
            cardsContainer.classList.add('expanded');
        }
        giftTiers.forEach(tier => {
            if (!tier.product) return;

            const card = document.createElement('div');
            card.className = `gift-tier-card ${tier.unlocked ? 'unlocked' : 'locked'}`;
            card.dataset.tier = tier.tier;

            const amountNeeded = tier.threshold - cartTotal;
            const lockedText = `Spend ${formatCurrency(amountNeeded)} more to unlock`;

            // Get variant info for display
            const variant = tier.variantId ? tier.product.variants.find(v => v.id === tier.variantId) : tier.product.variants[0];
            const variantTitle = variant && variant.title !== 'Default Title' ? variant.title : '';
            // Use variant image if available, otherwise product featured image
            const imageUrl = variant?.featured_image?.src || tier.product.featured_image?.src || tier.product.featured_image || '';

            // Get variant price for display
            const variantPrice = variant ? variant.price : tier.product.variants[0].price;
            const formattedPrice = formatMoney(variantPrice);

            card.innerHTML = `
                <div class="gift-tier-banner">${tier.unlocked ? tier.bannerText : `Tier ${tier.tier} Gift`}</div>
                <div class="gift-card-main">
                    <div class="gift-card-image">
                        ${imageUrl ? `<img src="${imageUrl}" alt="${tier.product.title}">` : ''}
                    </div>
                    <div class="gift-card-content">
                        <h3 class="gift-product-title">${tier.product.title}${variantTitle ? ` - ${variantTitle}` : ''}</h3>
                        ${tier.description ? `<p class="gift-product-description">${tier.description}</p>` : ''}
                        <div class="gift-tier-price">
                            <span class="gift-tier-original-price">${formattedPrice}</span>
                            <span class="gift-tier-free-label">now ${formatMoney(0)}</span>
                        </div>
                        <span class="gift-tier-locked-text">${lockedText}</span>
                    </div>
                </div>
            `;

            cardsContainer.appendChild(card);
        });
    }

    function initRecommendations() {
        if (initialized) return;

        if (!window.QuizManager || !window.QuizManager.recommendedProducts) {
            console.log('No recommended products found');
            return;
        }

        let productHandles = window.QuizManager.recommendedProducts;
        console.log('Product handles from QuizManager:', productHandles);

        // Get custom sort order from data attribute
        const recommendationsSection = document.querySelector('[data-recommendations]');
        const sortOrder = recommendationsSection?.dataset.productSortOrder;

        // Load BOGO settings
        bogoEnabled = recommendationsSection?.dataset.bogoEnabled === 'true';
        const bogoProductsData = recommendationsSection?.dataset.bogoProducts;
        bogoProductHandles = bogoProductsData ? bogoProductsData.split(',').map(h => h.trim()).filter(h => h) : [];
        bogoBadgeText = recommendationsSection?.dataset.bogoBadgeText || 'BUY 1 GET 1 FREE';
        bogoCartText = recommendationsSection?.dataset.bogoCartText || 'Buy 1 Get 1 Free';
        console.log('BOGO settings loaded:', { bogoEnabled, bogoProductHandles, bogoBadgeText, bogoCartText });

        // Initialize tiered gift system
        initGiftTiers();

        if (sortOrder && sortOrder.trim() !== '') {
            const sortOrderHandles = sortOrder.split(',').map(h => h.trim()).filter(h => h);
            console.log('Custom sort order:', sortOrderHandles);

            // Reorder productHandles based on sortOrder
            // First, add products from sortOrder that are in recommendedProducts
            const orderedHandles = [];
            const remainingHandles = [...productHandles];

            sortOrderHandles.forEach(handle => {
                const index = remainingHandles.indexOf(handle);
                if (index !== -1) {
                    orderedHandles.push(handle);
                    remainingHandles.splice(index, 1);
                }
            });

            // Then add any remaining recommended products not in sortOrder
            productHandles = [...orderedHandles, ...remainingHandles];
            console.log('Reordered product handles:', productHandles);
        }

        const topPicksContainer = document.querySelector('[data-section-products="top-picks"]');
        const additionalContainer = document.querySelector('[data-section-products="additional"]');
        const accessoriesContainer = document.querySelector('[data-section-products="accessories"]');
        const giftProductHandle = document.querySelector('[data-gift-product]')?.dataset.giftProduct;

        if (!topPicksContainer || !additionalContainer || !accessoriesContainer) {
            console.error('Section containers not found');
            return;
        }

        if (productHandles.length === 0) {
            console.log('No product handles to fetch');
            return;
        }

        initialized = true;

        // Fetch quiz recommended products
        const fetchPromises = productHandles.map(handle => {
            if (!handle) return Promise.resolve(null);
            console.log('Fetching product:', handle);
            return fetch(`/products/${handle}.js`)
                .then(response => response.ok ? response.json() : null)
                .catch(() => null);
        });

        Promise.all(fetchPromises).then(products => {
            console.log('Fetched products:', products);
            
            // Section 1: Top 3 picks (auto-added to cart)
            const topPicks = products.slice(0, 3).filter(p => p !== null);
            console.log('Top picks (Section 1):', topPicks.length, 'products');
            
            topPicks.forEach((product, index) => {
                productStates[product.id] = { removed: false, quantity: 1 };
                const productCard = createProductCard(product, 'top-picks', index + 1);
                topPicksContainer.appendChild(productCard);

                const hasSubscription = product.selling_plan_groups && product.selling_plan_groups.length > 0;
                let initialSellingPlanId = null;

                // If BOGO is enabled, default to Buy Once (null selling plan)
                // Otherwise, default to subscription if available
                if (hasSubscription && !bogoEnabled) {
                    initialSellingPlanId = product.selling_plan_groups[0].selling_plans[0].id;
                }

                // Get the variant ID that was set by createProductCard (the most expensive one)
                const selectedVariantId = parseInt(productCard.dataset.variantId);

                // Auto-add to cart with the same variant that's selected in the card
                addToCart(selectedVariantId, 1, product, initialSellingPlanId);
            });

            // Section 2: Additional recommendations (not auto-added)
            const additionalProducts = products.slice(3).filter(p => p !== null);
            console.log('Additional products (Section 2):', additionalProducts.length, 'products');
            
            additionalProducts.forEach((product) => {
                productStates[product.id] = { removed: false, quantity: 1 };
                const productCard = createProductCard(product, 'additional');
                additionalContainer.appendChild(productCard);
                // NOT auto-added to cart
            });

            // Add legacy gift product if exists (only if tiered gifts are NOT enabled)
            if (giftProductHandle && !giftTiersEnabled) {
                fetch(`/products/${giftProductHandle}.js`)
                    .then(response => response.json())
                    .then(giftProduct => {
                        addToCart(giftProduct.variants[0].id, 1, giftProduct, null, true);
                    })
                    .catch(err => console.error('Error fetching gift product:', err));
            }

            // Trigger currency converter after all products are loaded
            setTimeout(() => {
                updateCurrencyConverter();
            }, 500);
        });

        // Section 3: Accessories (manual product list from settings)
        // accessoryHandles will be passed from inline script
        const accessoryHandles = window.quizRecommendationsConfig?.accessoryHandles || [];
        console.log('Accessory handles (Section 3):', accessoryHandles);
        
        // Get the accessories section element and divider
        const accessoriesSection = document.querySelector('[data-section="accessories"]');
        const accessoriesDivider = accessoriesSection?.previousElementSibling;
        const isDivider = accessoriesDivider?.classList.contains('section-divider');
        
        // Hide section and divider initially if no accessory handles
        if (!accessoryHandles || accessoryHandles.length === 0) {
            if (accessoriesSection) {
                accessoriesSection.style.display = 'none';
            }
            if (isDivider && accessoriesDivider) {
                accessoriesDivider.style.display = 'none';
            }
        } else {
            const accessoryPromises = accessoryHandles.map(item => {
                // Handle both string handles and product objects
                const handle = typeof item === 'string' ? item : (item?.handle || null);
                if (!handle) return Promise.resolve(null);
                
                console.log('Fetching accessory product:', handle);
                return fetch(`/products/${handle}.js`)
                    .then(response => response.ok ? response.json() : null)
                    .catch(() => null);
            });

            Promise.all(accessoryPromises).then(accessories => {
                console.log('Fetched accessories:', accessories);
                const validAccessories = accessories.filter(product => product !== null);
                
                validAccessories.forEach((product) => {
                    productStates[product.id] = { removed: false, quantity: 1 };
                    const productCard = createProductCard(product, 'accessories');
                    accessoriesContainer.appendChild(productCard);
                    // NOT auto-added to cart
                });

                // Hide section and divider if no valid accessories were loaded
                if (validAccessories.length === 0) {
                    if (accessoriesSection) {
                        accessoriesSection.style.display = 'none';
                    }
                    if (isDivider && accessoriesDivider) {
                        accessoriesDivider.style.display = 'none';
                    }
                } else {
                    if (accessoriesSection) {
                        accessoriesSection.style.display = '';
                    }
                    if (isDivider && accessoriesDivider) {
                        accessoriesDivider.style.display = '';
                    }
                }

                // Trigger currency converter after accessories are loaded
                setTimeout(() => {
                    updateCurrencyConverter();
                }, 500);
            });
        }
    }

    function isBogoEligible(product) {
        if (!bogoEnabled || !product) return false;
        return bogoProductHandles.includes(product.handle);
    }

    function formatMoney(cents) {
        // Get active currency from Shopify object
        const activeCurrency = (typeof Shopify !== 'undefined' && Shopify.currency && Shopify.currency.active)
            ? Shopify.currency.active
            : 'USD';

        // Convert cents to decimal amount
        const amount = cents / 100;

        // Format using Intl.NumberFormat which handles currency symbols automatically
        let formattedPrice = '';
        try {
            formattedPrice = new Intl.NumberFormat('en', {
                style: 'currency',
                currency: activeCurrency,
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            }).format(amount);
        } catch (e) {
            // Fallback if currency code is invalid
            console.warn('Currency formatting failed for', activeCurrency, e);
            formattedPrice = activeCurrency + ' ' + amount.toFixed(2);
        }

        // Return HTML with money class and data attributes for currency converters
        // Data attribute uses the shop's base currency (usually the first price loaded)
        return `<span class="money" data-currency-${activeCurrency}="${amount.toFixed(2)}">${formattedPrice}</span>`;
    }

    function updateCurrencyConverter() {
        // Trigger currency converter to update prices if available
        if (typeof Currency !== 'undefined' && typeof Currency.convertAll !== 'undefined') {
            try {
                const shopCurrency = (typeof Shopify !== 'undefined' && Shopify.currency)
                    ? Shopify.currency.active
                    : 'USD';
                Currency.convertAll(shopCurrency, '[name=currencies]');
            } catch (e) {
                console.log('Currency conversion update failed:', e);
            }
        }
        // Also try alternate method for different currency converter apps
        if (window.CRISP && window.CRISP.Currency && typeof window.CRISP.Currency.convert === 'function') {
            window.CRISP.Currency.convert();
        }
    }


    function createProductCard(product, section, number = null) {
        const card = document.createElement('div');
        card.className = 'recommended-product-card';
        card.dataset.productId = product.id;

        const hasSubscription = product.selling_plan_groups && product.selling_plan_groups.length > 0;
        const hasMultipleVariants = product.variants && product.variants.length > 1;
        const description = product.metafields?.custom?.description || product.description || '';

        // Find the most expensive variant (default selection)
        let defaultVariantIndex = 0;
        let defaultVariant = product.variants[0];
        if (hasMultipleVariants) {
            let maxPrice = product.variants[0].price;
            product.variants.forEach((variant, index) => {
                if (variant.price > maxPrice && variant.available) {
                    maxPrice = variant.price;
                    defaultVariantIndex = index;
                    defaultVariant = variant;
                }
            });
        }

        card.dataset.variantId = defaultVariant.id;
        card.dataset.section = section;

        let frequencyHTML = '';
        let purchaseOptionsHTML = '';
        let sellingPlans = [];

        // Variant selector HTML (if product has multiple variants) - Changed to buttons
        let variantSelectorHTML = '';
        if (hasMultipleVariants) {
            variantSelectorHTML = `
                <div class="product-variant-selector">
                    <span class="variant-label">SIZE:</span>
                    <div class="variant-buttons">
                        ${product.variants.map((variant, index) => `
                            <button class="variant-button ${index === defaultVariantIndex ? 'selected' : ''}" 
                                    data-variant-id="${variant.id}" 
                                    data-variant-index="${index}"
                                    ${!variant.available ? 'disabled' : ''}>
                                ${variant.title}
                            </button>
                        `).join('')}
                    </div>
                </div>
            `;
        }

        const quantityHTML = `
            <div class="product-quantity-selector">
                <span class="quantity-label">QTY:</span>
                <div class="quantity-controls">
                    <button class="quantity-btn quantity-decrease" data-quantity-decrease>−</button>
                    <span class="quantity-value" data-quantity-value>1</span>
                    <button class="quantity-btn quantity-increase" data-quantity-increase>+</button>
                </div>
            </div>
        `;

        if (hasSubscription) {
            const sellingPlanGroup = product.selling_plan_groups[0];
            sellingPlans = sellingPlanGroup.selling_plans;

            const firstPlan = sellingPlans[0];
            const subscriptionPrice = calculateSubscriptionPrice(defaultVariant.price, firstPlan);
            const subscriptionDiscount = getDiscountPercent(firstPlan);

            // Check for compare_at_price discount on the Buy Once option
            const hasCompareAtDiscount = defaultVariant.compare_at_price && defaultVariant.compare_at_price > defaultVariant.price;

            // Calculate subscription discount badge
            const subscriptionDiscountBadge = subscriptionDiscount > 0 ? `<span class="subscription-discount-badge">SAVE ${subscriptionDiscount}%</span>` : '';

            frequencyHTML = `
                <div class="subscription-frequency-selector">
                    <span class="frequency-label">Delivery Frequency:</span>
                    <select class="frequency-dropdown" data-frequency-select>
                        ${sellingPlans.map((plan, index) => `
                            <option value="${plan.id}" data-plan-index="${index}" ${index === 0 ? 'selected' : ''}>
                                ${plan.name}
                            </option>
                        `).join('')}
                    </select>
                </div>
            `;

            // If BOGO is active, make "Buy Once" the default option, otherwise "Subscribe" is default
            const defaultToBuyOnce = bogoEnabled;

            // Get original price for strikethrough
            const originalPrice = defaultVariant.compare_at_price && defaultVariant.compare_at_price > defaultVariant.price 
                ? defaultVariant.compare_at_price 
                : defaultVariant.price;
            const subscriptionOriginalPrice = defaultVariant.compare_at_price && defaultVariant.compare_at_price > subscriptionPrice
                ? defaultVariant.compare_at_price
                : defaultVariant.price;

            purchaseOptionsHTML = `
                <div class="product-purchase-options-wrapper">
                    <div class="purchase-options-header">SUBSCRIBE AND SAVE ${subscriptionDiscount}%</div>
                    <div class="product-purchase-options">
                        <label class="purchase-option${defaultToBuyOnce ? '' : ' selected'}" data-option="subscription">
                            <input type="radio" name="purchase_${product.id}" value="subscription"
                                   data-selling-plan="${firstPlan.id}"${defaultToBuyOnce ? '' : ' checked'}>
                            <div class="option-details">
                                <span class="option-label">Subscribe</span>
                            </div>
                            <div class="option-price-wrapper">
                                <div class="option-price">
                                    ${subscriptionOriginalPrice > subscriptionPrice ? `<span class="option-price-original">${formatMoney(subscriptionOriginalPrice)}</span>` : ''}
                                    <span class="option-price-current">${formatMoney(subscriptionPrice)}</span>
                                </div>
                                ${subscriptionDiscountBadge}
                            </div>
                        </label>
                        <label class="purchase-option${defaultToBuyOnce ? ' selected' : ''}" data-option="onetime">
                            <input type="radio" name="purchase_${product.id}" value="onetime"${defaultToBuyOnce ? ' checked' : ''}>
                            <div class="option-details">
                                <span class="option-label">One-time purchase</span>
                            </div>
                            <div class="option-price-wrapper">
                                <div class="option-price">
                                    ${hasCompareAtDiscount ? `<span class="option-price-original">${formatMoney(originalPrice)}</span>` : ''}
                                    <span class="option-price-current">${formatMoney(defaultVariant.price)}</span>
                                </div>
                            </div>
                        </label>
                    </div>
                </div>
            `;
        } else {
            // Check for compare_at_price discount
            const hasDiscount = defaultVariant.compare_at_price && defaultVariant.compare_at_price > defaultVariant.price;
            
            // Calculate total price (unit price × quantity, default quantity is 1)
            const initialQuantity = 1;
            const unitPrice = defaultVariant.price;
            const totalPrice = unitPrice * initialQuantity;
            const compareAtTotal = hasDiscount ? defaultVariant.compare_at_price * initialQuantity : null;

            purchaseOptionsHTML = `
                <div class="product-price-row">
                    <div class="product-price-only">
                        ${compareAtTotal ? `<span class="option-price-original">${formatMoney(compareAtTotal)}</span>` : ''}
                        <span class="option-price-current">${formatMoney(totalPrice)}</span>
                    </div>
                </div>
            `;
        }

        const isBogo = isBogoEligible(product);

        card.innerHTML = `
            <div class="product-card-header-row">
                <div class="product-card-image">
                    ${isBogo ? `<div class="product-bogo-badge">${bogoBadgeText}</div>` : ''}
                    <img src="${product.featured_image || ''}" alt="${product.title}">
                </div>
                <div class="product-card-title-wrapper">
                    <h3 class="product-card-title product-card-title-desktop">${product.title}</h3>
                    <h3 class="product-card-title product-card-title-mobile">${product.title}</h3>
                    ${description ? `<div class="product-card-description">${description}</div>` : ''}
                </div>
                ${section === 'top-picks' ? `
                    <button class="product-remove-btn" data-remove-btn aria-label="Remove product">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="none">
                            <path d="M2.5 4.99996H17.5M15.8333 4.99996V16.6666C15.8333 17.5 15 18.3333 14.1667 18.3333H5.83333C5 18.3333 4.16667 17.5 4.16667 16.6666V4.99996M6.66667 4.99996V3.33329C6.66667 2.49996 7.5 1.66663 8.33333 1.66663H11.6667C12.5 1.66663 13.3333 2.49996 13.3333 3.33329V4.99996M8.33333 9.16663V14.1666M11.6667 9.16663V14.1666" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                    </button>
                ` : ''}
            </div>
            <div class="product-card-content">
                <div class="product-options-group">
                    ${quantityHTML}
                    ${variantSelectorHTML}
                    ${frequencyHTML}
                </div>
                ${purchaseOptionsHTML}
            </div>
            ${section !== 'top-picks' ? `
                <button class="product-add-btn product-add-btn-corner" data-add-btn>
                    Add
                </button>
            ` : ''}
        `;

        card.dataset.sellingPlans = JSON.stringify(sellingPlans);
        card.dataset.productData = JSON.stringify(product);
        card.dataset.selectedVariantPrice = defaultVariant.price;
        card.dataset.isBogo = isBogo;

        // Variant selector event listener (buttons instead of dropdown)
        if (hasMultipleVariants) {
            const variantButtons = card.querySelectorAll('.variant-button');
            variantButtons.forEach((button) => {
                button.addEventListener('click', (e) => {
                    if (button.disabled) return;
                    
                    // Remove selected class from all buttons
                    variantButtons.forEach(btn => btn.classList.remove('selected'));
                    // Add selected class to clicked button
                    button.classList.add('selected');
                    
                    const selectedVariantId = parseInt(button.dataset.variantId);
                    const selectedVariantIndex = parseInt(button.dataset.variantIndex);
                    const selectedVariant = product.variants[selectedVariantIndex];

                    // Update card's variant ID and store selected variant data
                    card.dataset.variantId = selectedVariantId;
                    card.dataset.selectedVariantPrice = selectedVariant.price;

                    // Check for discount on new variant
                    const hasVariantDiscount = selectedVariant.compare_at_price && selectedVariant.compare_at_price > selectedVariant.price;

                    // Update prices based on new variant
                    const priceOnlyEl = card.querySelector('.product-price-only');
                    const subscriptionOptionEl = card.querySelector('[data-option="subscription"]');
                    const onetimeOptionEl = card.querySelector('[data-option="onetime"]');

                    if (priceOnlyEl) {
                        const originalPriceHTML = hasVariantDiscount ? `<span class="option-price-original">${formatMoney(selectedVariant.compare_at_price)}</span>` : '';
                        priceOnlyEl.innerHTML = `${originalPriceHTML}<span class="option-price-current">${formatMoney(selectedVariant.price)}</span>`;
                    }

                    if (subscriptionOptionEl && onetimeOptionEl && hasSubscription) {
                        const sellingPlanGroup = product.selling_plan_groups[0];
                        const currentPlanSelect = card.querySelector('[data-frequency-select]');
                        let currentPlan = sellingPlanGroup.selling_plans[0];

                        if (currentPlanSelect) {
                            const currentPlanIndex = parseInt(currentPlanSelect.options[currentPlanSelect.selectedIndex].dataset.planIndex);
                            currentPlan = sellingPlanGroup.selling_plans[currentPlanIndex];
                        }

                        const subscriptionPrice = calculateSubscriptionPrice(selectedVariant.price, currentPlan);
                        const subscriptionDiscount = getDiscountPercent(currentPlan);
                        const subscriptionDiscountBadge = subscriptionDiscount > 0 ? `<span class="subscription-discount-badge">SAVE ${subscriptionDiscount}%</span>` : '';
                        
                        const subscriptionOriginalPrice = selectedVariant.compare_at_price && selectedVariant.compare_at_price > subscriptionPrice
                            ? selectedVariant.compare_at_price
                            : selectedVariant.price;
                        const subscriptionOriginalHTML = subscriptionOriginalPrice > subscriptionPrice ? `<span class="option-price-original">${formatMoney(subscriptionOriginalPrice)}</span>` : '';
                        
                        const subscriptionPriceWrapper = subscriptionOptionEl.querySelector('.option-price-wrapper');
                        if (subscriptionPriceWrapper) {
                            subscriptionPriceWrapper.innerHTML = `
                                <div class="option-price">
                                    ${subscriptionOriginalHTML}
                                    <span class="option-price-current">${formatMoney(subscriptionPrice)}</span>
                                </div>
                                ${subscriptionDiscountBadge}
                            `;
                        }

                        const onetimeOriginalPrice = hasVariantDiscount ? selectedVariant.compare_at_price : selectedVariant.price;
                        const onetimeOriginalHTML = hasVariantDiscount ? `<span class="option-price-original">${formatMoney(onetimeOriginalPrice)}</span>` : '';
                        const onetimePriceWrapper = onetimeOptionEl.querySelector('.option-price-wrapper');
                        if (onetimePriceWrapper) {
                            onetimePriceWrapper.innerHTML = `
                                <div class="option-price">
                                    ${onetimeOriginalHTML}
                                    <span class="option-price-current">${formatMoney(selectedVariant.price)}</span>
                                </div>
                            `;
                        }
                    }

                    // Trigger currency converter update
                    updateCurrencyConverter();

                    // Update cart if product is already added
                    const itemInCart = cartItems.find(item => item.product.id === product.id);
                    if (itemInCart) {
                        const currentQty = productStates[product.id].quantity || 1;
                        const selectedOption = card.querySelector('input[type="radio"]:checked');
                        const sellingPlanId = selectedOption?.dataset.sellingPlan || null;

                        // Remove old variant from cart
                        cartItems = cartItems.filter(item => item.product.id !== product.id);

                        // Create updated product with selected variant
                        const updatedProduct = {
                            ...product,
                            selectedVariant: selectedVariant
                        };

                        // Add new variant to cart
                        addToCart(selectedVariantId, currentQty, updatedProduct, sellingPlanId);
                    }
                });
            });
        }

        const decreaseBtn = card.querySelector('[data-quantity-decrease]');
        const increaseBtn = card.querySelector('[data-quantity-increase]');
        const quantityValue = card.querySelector('[data-quantity-value]');

        decreaseBtn.addEventListener('click', () => {
            let currentQty = parseInt(quantityValue.textContent);
            if (currentQty > 1) {
                currentQty--;
                quantityValue.textContent = currentQty;
                productStates[product.id].quantity = currentQty;

                const selectedOption = card.querySelector('input[type="radio"]:checked');
                const sellingPlanId = selectedOption?.dataset.sellingPlan || null;
                const selectedVariantId = parseInt(card.dataset.variantId);

                // Update displayed price for non-subscription products
                if (!hasSubscription) {
                    const priceOnlyEl = card.querySelector('.product-price-only');
                    if (priceOnlyEl) {
                        const variant = product.variants.find(v => v.id === selectedVariantId) || defaultVariant;
                        const unitPrice = variant.price;
                        const totalPrice = unitPrice * currentQty;
                        const hasDiscount = variant.compare_at_price && variant.compare_at_price > variant.price;
                        const compareAtTotal = hasDiscount ? variant.compare_at_price * currentQty : null;
                        
                        const originalPriceHTML = compareAtTotal ? `<span class="option-price-original">${formatMoney(compareAtTotal)}</span>` : '';
                        priceOnlyEl.innerHTML = `${originalPriceHTML}<span class="option-price-current">${formatMoney(totalPrice)}</span>`;
                        
                        // Trigger currency converter update
                        updateCurrencyConverter();
                    }
                }

                // Only update cart if product is in cart (top-picks section or manually added)
                const itemInCart = cartItems.find(item => parseInt(item.variantId) === selectedVariantId);
                if (itemInCart) {
                    // Use the product from cart which may have selectedVariant
                    const productToUpdate = itemInCart.product.selectedVariant ? itemInCart.product : product;
                    updateCartItem(selectedVariantId, currentQty, productToUpdate, sellingPlanId);
                }
            }
            decreaseBtn.disabled = currentQty <= 1;
        });

        increaseBtn.addEventListener('click', () => {
            let currentQty = parseInt(quantityValue.textContent);
            currentQty++;
            quantityValue.textContent = currentQty;
            productStates[product.id].quantity = currentQty;

            const selectedOption = card.querySelector('input[type="radio"]:checked');
            const sellingPlanId = selectedOption?.dataset.sellingPlan || null;
            const selectedVariantId = parseInt(card.dataset.variantId);

            // Update displayed price for non-subscription products
            if (!hasSubscription) {
                const priceOnlyEl = card.querySelector('.product-price-only');
                if (priceOnlyEl) {
                    const variant = product.variants.find(v => v.id === selectedVariantId) || defaultVariant;
                    const unitPrice = variant.price;
                    const totalPrice = unitPrice * currentQty;
                    const hasDiscount = variant.compare_at_price && variant.compare_at_price > variant.price;
                    const compareAtTotal = hasDiscount ? variant.compare_at_price * currentQty : null;
                    
                    const originalPriceHTML = compareAtTotal ? `<span class="option-price-original">${formatMoney(compareAtTotal)}</span>` : '';
                    priceOnlyEl.innerHTML = `${originalPriceHTML}<span class="option-price-current">${formatMoney(totalPrice)}</span>`;
                    
                    // Trigger currency converter update
                    updateCurrencyConverter();
                }
            }

            // Only update cart if product is in cart (top-picks section or manually added)
            const itemInCart = cartItems.find(item => parseInt(item.variantId) === selectedVariantId);
            if (itemInCart) {
                // Use the product from cart which may have selectedVariant
                const productToUpdate = itemInCart.product.selectedVariant ? itemInCart.product : product;
                updateCartItem(selectedVariantId, currentQty, productToUpdate, sellingPlanId);
            }

            decreaseBtn.disabled = false;
        });

        const removeBtn = card.querySelector('[data-remove-btn]');
        if (removeBtn) {
            removeBtn.addEventListener('click', () => {
                const selectedVariantId = card.dataset.variantId;
                removeProductFromCart(product, selectedVariantId);
            });
        }

        const addBtn = card.querySelector('[data-add-btn]');
        if (addBtn) {
            addBtn.addEventListener('click', () => {
                productStates[product.id].removed = false;
                card.classList.remove('removed');
                addBtn.style.display = 'none';

                const removeBtn = card.querySelector('[data-remove-btn]');
                if (removeBtn) {
                    removeBtn.style.display = 'block';
                }

                const currentQty = productStates[product.id].quantity || 1;
                const selectedOption = card.querySelector('input[type="radio"]:checked');
                const sellingPlanId = selectedOption?.dataset.sellingPlan || null;
                const selectedVariantId = card.dataset.variantId;
                addToCart(selectedVariantId, currentQty, product, sellingPlanId);
            });
        }

        if (hasSubscription) {
            const frequencySelect = card.querySelector('[data-frequency-select]');
            frequencySelect.addEventListener('change', (e) => {
                const selectedOption = e.target.options[e.target.selectedIndex];
                const planId = selectedOption.value;
                const planIndex = parseInt(selectedOption.dataset.planIndex);
                const plans = JSON.parse(card.dataset.sellingPlans);
                const selectedPlan = plans[planIndex];

                const subscriptionOption = card.querySelector('[data-option="subscription"]');
                const subscriptionRadio = subscriptionOption.querySelector('input');
                const subscriptionPriceWrapper = subscriptionOption.querySelector('.option-price-wrapper');

                subscriptionRadio.dataset.sellingPlan = planId;

                // Get the current variant price
                const currentVariantPrice = parseInt(card.dataset.selectedVariantPrice) || product.variants[0].price;
                const newPrice = calculateSubscriptionPrice(currentVariantPrice, selectedPlan);
                const subscriptionDiscount = getDiscountPercent(selectedPlan);
                const subscriptionDiscountBadge = subscriptionDiscount > 0 ? `<span class="subscription-discount-badge">SAVE ${subscriptionDiscount}%</span>` : '';
                
                const variant = product.variants.find(v => v.id === parseInt(card.dataset.variantId)) || product.variants[0];
                const subscriptionOriginalPrice = variant.compare_at_price && variant.compare_at_price > newPrice
                    ? variant.compare_at_price
                    : currentVariantPrice;
                const subscriptionOriginalHTML = subscriptionOriginalPrice > newPrice ? `<span class="option-price-original">${formatMoney(subscriptionOriginalPrice)}</span>` : '';
                
                if (subscriptionPriceWrapper) {
                    subscriptionPriceWrapper.innerHTML = `
                        <div class="option-price">
                            ${subscriptionOriginalHTML}
                            <span class="option-price-current">${formatMoney(newPrice)}</span>
                        </div>
                        ${subscriptionDiscountBadge}
                    `;
                }

                // Trigger currency converter
                updateCurrencyConverter();

                if (subscriptionRadio.checked) {
                    const currentQty = productStates[product.id].quantity || 1;
                    const selectedVariantId = parseInt(card.dataset.variantId);
                    // Only update cart if product is in cart
                    const itemInCart = cartItems.find(item => parseInt(item.variantId) === selectedVariantId);
                    if (itemInCart) {
                        const productToUpdate = itemInCart.product.selectedVariant ? itemInCart.product : product;
                        updateCartItem(selectedVariantId, currentQty, productToUpdate, planId);
                    }
                }
            });

            const purchaseOptions = card.querySelectorAll('.purchase-option');
            purchaseOptions.forEach(option => {
                option.addEventListener('click', (e) => {
                    if (e.target.tagName !== 'INPUT') {
                        const radio = option.querySelector('input[type="radio"]');
                        radio.checked = true;
                    }

                    purchaseOptions.forEach(opt => opt.classList.remove('selected'));
                    option.classList.add('selected');

                    const selectedOption = card.querySelector('input[type="radio"]:checked');
                    const sellingPlanId = selectedOption.dataset.sellingPlan || null;
                    const currentQty = productStates[product.id].quantity || 1;
                    const selectedVariantId = parseInt(card.dataset.variantId);

                    console.log('Purchase option changed:', {
                        productId: product.id,
                        variantId: selectedVariantId,
                        sellingPlanId: sellingPlanId,
                        quantity: currentQty,
                        section: section
                    });

                    // Only update cart if product is in cart (check by variantId)
                    const itemInCart = cartItems.find(item => item.variantId === selectedVariantId);
                    console.log('Item in cart:', itemInCart ? 'Yes' : 'No');

                    if (itemInCart) {
                        // Create updated product with selected variant info
                        const updatedProduct = itemInCart.product.selectedVariant
                            ? itemInCart.product
                            : product;

                        // If switching to subscription on a BOGO product, remove free BOGO item first
                        if (sellingPlanId && isBogoEligible(product)) {
                            const bogoItemIndex = cartItems.findIndex(item =>
                                parseInt(item.variantId) === selectedVariantId &&
                                item.isBogoFree === true
                            );
                            if (bogoItemIndex !== -1) {
                                cartItems.splice(bogoItemIndex, 1);
                            }
                        }

                        updateCartItem(selectedVariantId, currentQty, updatedProduct, sellingPlanId);
                    }
                });
            });
        }

        return card;
    }

    function calculateSubscriptionPrice(basePrice, sellingPlan) {
        if (sellingPlan.price_adjustments && sellingPlan.price_adjustments.length > 0) {
            const adjustment = sellingPlan.price_adjustments[0];
            if (adjustment.value_type === 'percentage') {
                return basePrice * (1 - adjustment.value / 100);
            } else if (adjustment.value_type === 'fixed_amount') {
                return basePrice - adjustment.value;
            }
        }
        return basePrice;
    }

    function getDiscountPercent(sellingPlan) {
        if (sellingPlan.price_adjustments && sellingPlan.price_adjustments.length > 0) {
            const adjustment = sellingPlan.price_adjustments[0];
            if (adjustment.value_type === 'percentage') {
                return Math.round(adjustment.value);
            }
        }
        return 0;
    }

    function addToCart(variantId, quantity, product, sellingPlanId = null, isGift = false, isBogoFree = false) {
        // Ensure variantId is a number for consistent comparisons
        const numericVariantId = parseInt(variantId);
        const numericSellingPlanId = sellingPlanId ? parseInt(sellingPlanId) : null;

        const existingItemIndex = cartItems.findIndex(item =>
            parseInt(item.variantId) === numericVariantId &&
            (item.sellingPlanId ? parseInt(item.sellingPlanId) : null) === numericSellingPlanId &&
            item.isBogoFree === isBogoFree &&
            item.isGift === isGift
        );

        if (existingItemIndex !== -1) {
            cartItems[existingItemIndex].quantity = quantity;
            cartItems[existingItemIndex].product = product; // Update product reference
            cartItems[existingItemIndex].sellingPlanId = sellingPlanId; // Update selling plan
            if (quantity === 0) {
                cartItems.splice(existingItemIndex, 1);
            }
        } else if (quantity > 0) {
            cartItems.push({
                variantId: numericVariantId,
                quantity,
                product,
                sellingPlanId: sellingPlanId,
                isGift,
                isBogoFree
            });
        }

        // BOGO logic: Add free duplicate if product is BOGO eligible and it's a one-time purchase
        if (!isBogoFree && !isGift && isBogoEligible(product) && !sellingPlanId && quantity > 0) {
            // Add free BOGO item (same quantity as paid item)
            const bogoItemIndex = cartItems.findIndex(item =>
                parseInt(item.variantId) === numericVariantId &&
                item.isBogoFree === true &&
                !item.sellingPlanId
            );

            if (bogoItemIndex !== -1) {
                // Update existing BOGO item
                cartItems[bogoItemIndex].quantity = quantity;
                if (quantity === 0) {
                    cartItems.splice(bogoItemIndex, 1);
                }
            } else if (quantity > 0) {
                // Add new BOGO item
                cartItems.push({
                    variantId: numericVariantId,
                    quantity,
                    product,
                    sellingPlanId: null,
                    isGift: false,
                    isBogoFree: true
                });
            }
        }

        // If quantity is 0 and it's a paid BOGO item, also remove the free BOGO item
        if (!isBogoFree && quantity === 0 && isBogoEligible(product) && !sellingPlanId) {
            const bogoItemIndex = cartItems.findIndex(item =>
                parseInt(item.variantId) === numericVariantId &&
                item.isBogoFree === true &&
                !item.sellingPlanId
            );
            if (bogoItemIndex !== -1) {
                cartItems.splice(bogoItemIndex, 1);
            }
        }

        console.log('Cart updated. Current cart items:', cartItems.length);

        // Update tiered gift system BEFORE updating cart display (only for non-gift items)
        // This ensures gifts are added/removed before the display is rendered
        if (!isGift) {
            updateGiftTiers();
        }

        updateCartDisplay();
    }

    function removeProductFromCart(product, variantId) {
        // This function removes a product from cart AND updates the product card state
        // It's used by both the product card remove button and the cart item remove button

        console.log('=== removeProductFromCart START ===');
        console.log('Product:', product.title, 'ID:', product.id);
        console.log('Variant ID:', variantId);

        // Find the product card - try multiple selectors
        let productCard = document.querySelector(`[data-product-id="${product.id}"]`);

        // If it's a custom element, look for the actual recommended-product-card inside it
        if (productCard && productCard.tagName === 'PRODUCT-BLOCK') {
            console.log('Found PRODUCT-BLOCK, looking for recommended-product-card inside...');
            const innerCard = productCard.querySelector('.recommended-product-card');
            if (innerCard) {
                console.log('Found inner recommended-product-card');
                productCard = innerCard;
            }
        }

        console.log('Product card found:', !!productCard);

        if (productCard) {
            console.log('Product card element:', productCard);
            console.log('Product card tag:', productCard.tagName);
            console.log('Product card classes before:', productCard.className);
        }

        if (productCard && productStates[product.id]) {
            console.log('ProductState exists:', productStates[product.id]);

            // Update state
            productStates[product.id].removed = true;
            productCard.classList.add('removed');

            console.log('Product card classes after:', productCard.className);

            // Update buttons - search more deeply
            let addBtn = productCard.querySelector('[data-add-btn]');
            let removeBtn = productCard.querySelector('[data-remove-btn]');

            // If not found, search globally by product ID and button attributes
            if (!addBtn || !removeBtn) {
                console.log('Buttons not found in productCard, searching globally...');
                const allCards = document.querySelectorAll(`[data-product-id="${product.id}"]`);
                console.log('Found', allCards.length, 'elements with product ID');

                allCards.forEach((card, index) => {
                    console.log(`Card ${index}:`, card.tagName, card.className);
                    const tempAdd = card.querySelector('[data-add-btn]');
                    const tempRemove = card.querySelector('[data-remove-btn]');
                    if (tempAdd) {
                        console.log(`  - Found add button in card ${index}`);
                        addBtn = tempAdd;
                    }
                    if (tempRemove) {
                        console.log(`  - Found remove button in card ${index}`);
                        removeBtn = tempRemove;
                    }
                });
            }

            console.log('Add button found:', !!addBtn, addBtn);
            console.log('Remove button found:', !!removeBtn, removeBtn);

            if (addBtn) {
                console.log('Add button display BEFORE:', addBtn.style.display);
                addBtn.style.display = 'inline-flex';
                console.log('Add button display AFTER:', addBtn.style.display);
            }
            if (removeBtn) {
                console.log('Remove button display BEFORE:', removeBtn.style.display);
                removeBtn.style.display = 'none';
                console.log('Remove button display AFTER:', removeBtn.style.display);
            }
        } else {
            console.log('FAILED: productCard or productStates not found');
            if (!productCard) console.log('- Product card is null');
            if (!productStates[product.id]) console.log('- productStates[product.id] is null');
        }

        console.log('=== removeProductFromCart END ===');

        // Remove from cart
        updateCartItem(variantId, 0, product, null);
    }

    function updateCartItem(variantId, quantity, product, sellingPlanId = null) {
        // Ensure variantId is numeric
        const numericVariantId = parseInt(variantId);

        // Remove only non-gift, non-BOGO items with this variantId (preserve gifts and BOGO free items)
        cartItems = cartItems.filter(item =>
            parseInt(item.variantId) !== numericVariantId ||
            item.isGift ||
            item.isBogoFree
        );

        if (quantity > 0) {
            addToCart(numericVariantId, quantity, product, sellingPlanId);
        } else {
            // Update gift tiers BEFORE updating cart display when item is removed
            updateGiftTiers();
            updateCartDisplay();
        }
    }

    function updateCartDisplay() {
        const cartItemsContainer = document.querySelector('[data-cart-items]');

        if (!cartItemsContainer) return;

        cartItemsContainer.innerHTML = '';
        let subtotal = 0;
        let totalDiscount = 0;
        let itemCount = 0;

        const giftItems = [];
        const bogoItems = [];
        const onetimeItems = [];
        const subscriptionGroups = {};

        cartItems.forEach(item => {
            if (item.quantity === 0) return;

            // Don't count free BOGO items in the total count
            if (!item.isBogoFree) {
                itemCount += item.quantity;
            }

            // Get price from the correct variant using the stored variantId
            let variantPrice;
            if (item.product.selectedVariant) {
                variantPrice = item.product.selectedVariant.price;
            } else {
                // Find the variant by ID
                const variant = item.product.variants.find(v => v.id === parseInt(item.variantId));
                variantPrice = variant ? variant.price : item.product.variants[0].price;
            }

            let price = variantPrice;
            let planName = '';
            let discount = 0;

            if (item.isBogoFree) {
                bogoItems.push(item);
            } else if (item.isGift) {
                giftItems.push(item);
            } else if (item.sellingPlanId && item.product.selling_plan_groups) {
                const sellingPlanGroup = item.product.selling_plan_groups[0];
                const sellingPlan = sellingPlanGroup.selling_plans.find(sp => sp.id == item.sellingPlanId);
                if (sellingPlan) {
                    const originalPrice = variantPrice;
                    price = calculateSubscriptionPrice(variantPrice, sellingPlan);
                    planName = sellingPlan.name;
                    discount = getDiscountPercent(sellingPlan);

                    if (!subscriptionGroups[planName]) {
                        subscriptionGroups[planName] = [];
                    }
                    subscriptionGroups[planName].push({
                        item,
                        price,
                        originalPrice,
                        discount
                    });

                    subtotal += originalPrice * item.quantity;
                    totalDiscount += (originalPrice - price) * item.quantity;
                }
            } else {
                onetimeItems.push(item);
                subtotal += price * item.quantity;
            }
        });

        // Free products (gifts and BOGO) are not shown in cart items

        Object.keys(subscriptionGroups).forEach(planName => {
            const group = subscriptionGroups[planName];

            group.forEach(({ item, price, originalPrice, discount }) => {
                // Create a group container for subscription items
                const itemGroup = document.createElement('div');
                itemGroup.className = 'cart-item-group';

                const itemTotal = price * item.quantity;
                const originalTotal = originalPrice * item.quantity;
                const hasSubscriptionDiscount = itemTotal < originalTotal;

                const cartItem = document.createElement('div');
                cartItem.className = 'cart-item cart-subscription-item';
                cartItem.dataset.variantId = item.variantId;
                cartItem.dataset.sellingPlanId = item.sellingPlanId || '';

                // Get variant title and compare_at_price if there are multiple variants
                let productName = item.product.title;
                let variant = null;
                if (item.product.variants.length > 1) {
                    variant = item.product.variants.find(v => v.id === parseInt(item.variantId));
                    if (variant && variant.title !== 'Default Title') {
                        productName += ` - ${variant.title}`;
                    }
                } else {
                    variant = item.product.variants[0];
                }

                // Check for compare_at_price (product discount)
                const hasCompareAtPrice = variant && variant.compare_at_price && variant.compare_at_price > originalPrice;
                const compareAtTotal = hasCompareAtPrice ? variant.compare_at_price * item.quantity : null;

                let priceHTML = '';
                if (hasCompareAtPrice) {
                    // Product has compare_at_price, show: compare_at crossed out, then either original or discounted subscription price
                    if (hasSubscriptionDiscount) {
                        priceHTML = `
                            <div class="cart-item-price">
                                <span>${formatMoney(itemTotal)}</span>
                                <span class="cart-item-price-original">${formatMoney(compareAtTotal)}</span>
                            </div>
                        `;
                    } else {
                        priceHTML = `
                            <div class="cart-item-price">
                                <span>${formatMoney(itemTotal)}</span>
                                <span class="cart-item-price-original">${formatMoney(compareAtTotal)}</span>
                            </div>
                        `;
                    }
                } else if (hasSubscriptionDiscount) {
                    // No compare_at_price, but has subscription discount
                    priceHTML = `
                        <div class="cart-item-price">
                            <span>${formatMoney(itemTotal)}</span>
                            <span class="cart-item-price-original">${formatMoney(originalTotal)}</span>
                        </div>
                    `;
                } else {
                    priceHTML = `<div class="cart-item-price">${formatMoney(itemTotal)}</div>`;
                }

                // Get product image
                const productImage = item.product.featured_image || '';
                const imageHTML = productImage ? `<img src="${productImage}" alt="${productName}" class="cart-item-image">` : '';

                cartItem.innerHTML = `
                    ${imageHTML}
                    <div class="cart-item-info">
                        <span class="cart-item-name">${productName}</span>
                        ${priceHTML}
                    </div>
                    <button class="cart-item-remove" data-cart-remove aria-label="Remove item">
                        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                            <path d="M2.5 4.99996H17.5M15.8333 4.99996V16.6666C15.8333 17.5 15 18.3333 14.1667 18.3333H5.83333C5 18.3333 4.16667 17.5 4.16667 16.6666V4.99996M6.66667 4.99996V3.33329C6.66667 2.49996 7.5 1.66663 8.33333 1.66663H11.6667C12.5 1.66663 13.3333 2.49996 13.3333 3.33329V4.99996M8.33333 9.16663V14.1666M11.6667 9.16663V14.1666" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                    </button>
                `;
                itemGroup.appendChild(cartItem);
                cartItemsContainer.appendChild(itemGroup);
            });
        });

        onetimeItems.forEach(item => {
            // Get price and variant from the correct variant using the stored variantId
            let variant;
            let variantPrice;
            if (item.product.selectedVariant) {
                variant = item.product.selectedVariant;
                variantPrice = variant.price;
            } else {
                // Find the variant by ID
                variant = item.product.variants.find(v => v.id === parseInt(item.variantId));
                if (!variant) {
                    variant = item.product.variants[0];
                }
                variantPrice = variant.price;
            }
            const price = variantPrice;
            const itemTotal = price * item.quantity;

            // Check for compare_at_price (product discount)
            const hasCompareAtPrice = variant && variant.compare_at_price && variant.compare_at_price > price;
            const compareAtTotal = hasCompareAtPrice ? variant.compare_at_price * item.quantity : null;

            // Get variant title if there are multiple variants
            let productName = item.product.title;
            if (item.product.variants.length > 1 && variant.title !== 'Default Title') {
                productName += ` - ${variant.title}`;
            }

            // Determine price HTML
            let priceHTML = '';
            if (hasCompareAtPrice) {
                priceHTML = `
                    <div class="cart-item-price">
                        <span>${formatMoney(itemTotal)}</span>
                        <span class="cart-item-price-original">${formatMoney(compareAtTotal)}</span>
                    </div>
                `;
            } else {
                priceHTML = `<div class="cart-item-price">${formatMoney(itemTotal)}</div>`;
            }

            // Create a group container for related items
            const itemGroup = document.createElement('div');
            itemGroup.className = 'cart-item-group';

            // Get product image
            const productImage = item.product.featured_image || '';
            const imageHTML = productImage ? `<img src="${productImage}" alt="${productName}" class="cart-item-image">` : '';

            const cartItem = document.createElement('div');
            cartItem.className = 'cart-item';
            cartItem.dataset.variantId = item.variantId;
            cartItem.dataset.sellingPlanId = item.sellingPlanId || '';
            cartItem.innerHTML = `
                ${imageHTML}
                <div class="cart-item-info">
                    <span class="cart-item-name">${productName}</span>
                    ${priceHTML}
                </div>
                <button class="cart-item-remove" data-cart-remove aria-label="Remove item">
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                        <path d="M2.5 4.99996H17.5M15.8333 4.99996V16.6666C15.8333 17.5 15 18.3333 14.1667 18.3333H5.83333C5 18.3333 4.16667 17.5 4.16667 16.6666V4.99996M6.66667 4.99996V3.33329C6.66667 2.49996 7.5 1.66663 8.33333 1.66663H11.6667C12.5 1.66663 13.3333 2.49996 13.3333 3.33329V4.99996M8.33333 9.16663V14.1666M11.6667 9.16663V14.1666" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                </button>
            `;
            itemGroup.appendChild(cartItem);
            cartItemsContainer.appendChild(itemGroup);
        });

        // Add dividers between cart item groups (except after the last one)
        const allGroups = cartItemsContainer.querySelectorAll('.cart-item-group');
        allGroups.forEach((group, index) => {
            if (index < allGroups.length - 1) {
                // Check if divider already exists
                if (!group.nextElementSibling || !group.nextElementSibling.classList.contains('cart-item-group-divider')) {
                    const divider = document.createElement('div');
                    divider.className = 'cart-item-group-divider';
                    group.parentNode.insertBefore(divider, group.nextSibling);
                }
            }
        });

        // Update totals section
        const subtotalEl = document.querySelector('[data-subtotal]');
        const discountRowEl = document.querySelector('[data-discount-row]');
        const discountEl = document.querySelector('[data-discount]');
        const totalOriginalEl = document.querySelector('[data-total-original]');
        const totalCurrentEl = document.querySelector('[data-total-current]');

        if (subtotalEl) {
            subtotalEl.innerHTML = formatMoney(subtotal);
        }

        const total = subtotal - totalDiscount;
        if (totalDiscount > 0) {
            if (discountRowEl) discountRowEl.style.display = 'flex';
            if (discountEl) discountEl.innerHTML = `- ${formatMoney(totalDiscount)}`;
        } else {
            if (discountRowEl) discountRowEl.style.display = 'none';
        }

        // Update total price section
        if (totalCurrentEl) {
            totalCurrentEl.innerHTML = formatMoney(total);
        }

        // Show original total if there's a discount
        if (subtotal > total && totalOriginalEl) {
            totalOriginalEl.style.display = 'inline';
            totalOriginalEl.innerHTML = formatMoney(subtotal);
        } else if (totalOriginalEl) {
            totalOriginalEl.style.display = 'none';
        }

        // Add click handlers for cart item remove buttons
        const removeButtons = cartItemsContainer.querySelectorAll('[data-cart-remove]');
        removeButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                e.stopPropagation();
                const cartItemEl = button.closest('.cart-item');
                const variantId = parseInt(cartItemEl.dataset.variantId);

                // Find the cart item to get the product reference
                const cartItem = cartItems.find(item => parseInt(item.variantId) === variantId);
                if (cartItem && !cartItem.isGift) {
                    // Use the same function as the product card remove button
                    removeProductFromCart(cartItem.product, variantId);
                } else if (cartItem && cartItem.isGift) {
                    // For gift items, just remove from cart (no product card to update)
                    updateCartItem(variantId, 0, cartItem.product, null);
                }
            });
        });

        // Trigger currency converter to update all new prices
        setTimeout(() => {
            updateCurrencyConverter();
        }, 100);
    }

    const cartToggle = document.querySelector('[data-cart-toggle]');
    const cartClose = document.querySelector('[data-cart-close]');
    const cartSummary = document.querySelector('.cart-summary');
    const cartHeader = document.querySelector('[data-cart-header]');

    function initCartState() {
        if (cartSummary && window.innerWidth <= 1024) {
            cartSummary.classList.add('collapsed');
        }
    }

    if (cartToggle && cartSummary) {
        initCartState();

        window.addEventListener('resize', () => {
            if (window.innerWidth <= 1024) {
                if (!cartSummary.classList.contains('collapsed')) {
                    cartSummary.classList.add('collapsed');
                }
            } else {
                cartSummary.classList.remove('collapsed');
            }
        });

        cartToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            cartSummary.classList.toggle('collapsed');
        });

        if (cartHeader) {
            cartHeader.addEventListener('click', () => {
                cartSummary.classList.toggle('collapsed');
            });
        }

        if (cartClose) {
            cartClose.addEventListener('click', () => {
                cartSummary.classList.add('collapsed');
            });
        }
    }

    async function checkout() {
        if (cartItems.length === 0) {
            alert('Please select at least one product');
            return;
        }

        const checkoutBtns = document.querySelectorAll('[data-checkout-btn]');
        checkoutBtns.forEach(btn => {
            btn.classList.add('loading');
            btn.textContent = 'Processing...';
        });

        try {
            const cartResponse = await fetch('/cart.js');
            const currentCart = await cartResponse.json();

            const clearResponse = await fetch('/cart/clear.js', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });

            if (!clearResponse.ok) throw new Error('Failed to clear cart');

            await new Promise(resolve => setTimeout(resolve, 500));

            // Track BOGO items to avoid duplicates and double quantities
            const processedVariants = new Set();
            const bogoItems = [];

            for (const item of cartItems.filter(item => item.quantity > 0)) {
                // Skip free BOGO items - they'll be handled by doubling the paid item quantity
                if (item.isBogoFree) {
                    continue;
                }

                let finalQuantity = item.quantity;

                // Check if this item has a matching free BOGO item
                const hasBogoFreeItem = cartItems.some(cartItem =>
                    parseInt(cartItem.variantId) === parseInt(item.variantId) &&
                    cartItem.isBogoFree === true &&
                    !cartItem.sellingPlanId
                );

                if (hasBogoFreeItem && !item.sellingPlanId) {
                    // Double the quantity for BOGO items (buy 1 get 1 = 2x quantity)
                    finalQuantity = item.quantity * 2;
                    bogoItems.push(item.product.title);
                }

                const itemData = {
                    id: item.variantId,
                    quantity: finalQuantity
                };

                if (item.sellingPlanId) {
                    itemData.selling_plan = item.sellingPlanId;
                }

                const addResponse = await fetch('/cart/add.js', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ items: [itemData] })
                });

                if (!addResponse.ok) {
                    const errorText = await addResponse.text();
                    console.error(`Failed to add item ${item.variantId}:`, errorText);
                    throw new Error(`Failed to add item ${item.variantId}`);
                }

                await new Promise(resolve => setTimeout(resolve, 200));
            }

            // Helper function to sanitize text for order notes
            // Removes/replaces problematic characters that can cause issues with Shopify's API
            function sanitizeForOrderNote(text) {
                if (text === null || text === undefined) return '';
                return String(text)
                    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Remove control characters
                    .replace(/[""]/g, '"') // Normalize smart quotes
                    .replace(/['']/g, "'") // Normalize smart apostrophes
                    .replace(/[—–]/g, '-') // Normalize dashes
                    .replace(/…/g, '...') // Normalize ellipsis
                    .trim();
            }

            let orderNote = '--- QUIZ RESULTS ---\n';

            // Add BOGO information to order note
            if (bogoItems.length > 0) {
                orderNote += '\nBOGO PROMOTION:\n';
                orderNote += 'The following products had Buy 1 Get 1 Free applied:\n';
                bogoItems.forEach(productTitle => {
                    orderNote += `- ${sanitizeForOrderNote(productTitle)}\n`;
                });
                orderNote += '(Quantities have been doubled in the cart)\n';
            }

            if (window.QuizManager) {
                const qm = window.QuizManager;

                if (qm.introData && Object.keys(qm.introData).length > 0) {
                    orderNote += '\nINTRO DATA:\n';
                    Object.keys(qm.introData).forEach(key => {
                        const value = sanitizeForOrderNote(qm.introData[key]);
                        if (value) {
                            orderNote += `${sanitizeForOrderNote(key)}: ${value}\n`;
                        }
                    });
                }

                if (qm.calculatedPorosity || qm.calculatedElasticity) {
                    orderNote += '\nCALCULATED VALUES:\n';
                    if (qm.calculatedPorosity) {
                        orderNote += `Porosity: ${sanitizeForOrderNote(qm.calculatedPorosity)}\n`;
                    }
                    if (qm.calculatedElasticity) {
                        orderNote += `Elasticity: ${sanitizeForOrderNote(qm.calculatedElasticity)}\n`;
                    }
                }

                if (qm.formulationHairTreatment || qm.formulationElixir || qm.formulationConditioner) {
                    orderNote += '\nFORMULATION VALUES:\n';
                    if (qm.formulationHairTreatment) {
                        orderNote += `Hair Treatment: ${sanitizeForOrderNote(qm.formulationHairTreatment)}\n`;
                    }
                    if (qm.formulationElixir) {
                        orderNote += `Elixir: ${sanitizeForOrderNote(qm.formulationElixir)}\n`;
                    }
                    if (qm.formulationConditioner) {
                        orderNote += `Conditioner: ${sanitizeForOrderNote(qm.formulationConditioner)}\n`;
                    }
                }

                if (qm.answers && Object.keys(qm.answers).length > 0) {
                    orderNote += '\nQUIZ ANSWERS:\n';

                    // Sort questions by orderNotePosition (same positions keep natural order)
                    const sortedQuestionIds = Object.keys(qm.answers).sort((a, b) => {
                        const answerA = qm.answers[a];
                        const answerB = qm.answers[b];
                        const posA = Array.isArray(answerA) ? answerA.orderNotePosition : answerA.orderNotePosition;
                        const posB = Array.isArray(answerB) ? answerB.orderNotePosition : answerB.orderNotePosition;

                        // Default to 10 if not set
                        const valA = (posA === null || posA === undefined) ? 10 : posA;
                        const valB = (posB === null || posB === undefined) ? 10 : posB;

                        return valA - valB;
                    });

                    sortedQuestionIds.forEach(questionId => {
                        const answer = qm.answers[questionId];
                        let answerText = '';

                        if (answer.type === 'free_text') {
                            answerText = sanitizeForOrderNote(answer.title);
                        } else if (Array.isArray(answer)) {
                            answerText = answer.map(a => sanitizeForOrderNote(a.title)).filter(t => t).join(', ');
                        } else {
                            answerText = sanitizeForOrderNote(answer.title);
                        }

                        // Only add if we have actual content
                        if (answerText) {
                            orderNote += `${sanitizeForOrderNote(questionId)}: ${answerText}\n`;

                            if (Array.isArray(answer)) {
                                answer.forEach((a, idx) => {
                                    if (a.formulations && a.formulations.length > 0) {
                                        orderNote += `  - Formulations: ${a.formulations.join(', ')}\n`;
                                    }
                                });
                            } else if (answer.formulations && answer.formulations.length > 0) {
                                orderNote += `  - Formulations: ${answer.formulations.join(', ')}\n`;
                            }
                        }
                    });
                }
            }

            orderNote += '\n--- END QUIZ RESULTS ---';

            // Shopify has a 5000 character limit for cart notes
            // Truncate if necessary to prevent silent failures
            const MAX_NOTE_LENGTH = 4900; // Leave some buffer
            if (orderNote.length > MAX_NOTE_LENGTH) {
                console.warn(`Order note exceeded ${MAX_NOTE_LENGTH} chars (${orderNote.length}), truncating...`);
                orderNote = orderNote.substring(0, MAX_NOTE_LENGTH) + '\n\n[Note truncated due to length]';
            }

            const updateResponse = await fetch('/cart/update.js', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ note: orderNote })
            });

            if (!updateResponse.ok) throw new Error('Failed to update cart note');

            window.location.href = '/checkout';

        } catch (err) {
            console.error('Error during checkout:', err);
            checkoutBtns.forEach(btn => {
                btn.classList.remove('loading');
                btn.textContent = 'Checkout';
            });
            alert('There was an error processing your order. Please try again.');
        }
    }

    const checkoutBtns = document.querySelectorAll('[data-checkout-btn]');
    checkoutBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            checkout();
        });
    });

    const recommendationsSection = document.querySelector('[data-recommendations]');
    if (recommendationsSection) {
        const observer = new MutationObserver(function(mutations) {
            mutations.forEach(function(mutation) {
                if (mutation.attributeName === 'style') {
                    if (recommendationsSection.style.display !== 'none') {
                        initRecommendations();
                        observer.disconnect();
                    }
                }
            });
        });
        observer.observe(recommendationsSection, { attributes: true });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(initRecommendations, 100);
        });
    } else {
        setTimeout(initRecommendations, 100);
    }
})();
