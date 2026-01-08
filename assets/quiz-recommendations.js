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
    let giftTiers = []; // Array of { tier, threshold, femaleHandle, maleHandle, bannerText, description, product: null, unlocked: false, variantId: null }
    let giftProgressText = '';
    let giftCompleteText = '';
    let userGender = 'female'; // Default to female, will be set from quiz answers

    function initGiftTiers() {
        const container = document.querySelector('[data-gift-tiers-enabled]');
        if (!container || container.dataset.giftTiersEnabled !== 'true') {
            giftTiersEnabled = false;
            return;
        }

        giftTiersEnabled = true;
        giftProgressText = container.dataset.progressText || 'Spend [[remaining]] more to unlock your next gift!';
        giftCompleteText = container.dataset.completeText || 'You have unlocked all free gifts!';

        // Get user gender from QuizManager
        if (window.QuizManager && window.QuizManager.answers && window.QuizManager.answers.gender) {
            userGender = window.QuizManager.answers.gender.value === 'male' ? 'male' : 'female';
        }

        // Parse tier configurations
        giftTiers = [];
        
        // Tier 0: Free Shipping (activates when cart has at least 1 item)
        const tier0Enabled = container.dataset.tier0Enabled === 'true';
        const tier0Text = container.dataset.tier0Text || 'Free Shipping';
        if (tier0Enabled) {
            giftTiers.push({
                tier: 0,
                threshold: 0, // Activates with any item in cart
                isFreeShipping: true,
                freeShippingText: tier0Text,
                product: null,
                variantId: null,
                unlocked: false
            });
        }
        
        for (let i = 1; i <= 3; i++) {
            const threshold = parseInt(container.dataset[`tier${i}Threshold`]) || 0;
            const femaleHandle = container.dataset[`tier${i}Female`] || '';
            const femaleVariantId = container.dataset[`tier${i}VariantFemale`] || '';
            const maleHandle = container.dataset[`tier${i}Male`] || '';
            const maleVariantId = container.dataset[`tier${i}VariantMale`] || '';
            const bannerText = container.dataset[`tier${i}Banner`] || `Tier ${i} Gift`;
            const description = container.dataset[`tier${i}Description`] || '';

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
                    variantId: null,
                    unlocked: false
                });
            }
        }

        // Sort by threshold ascending
        giftTiers.sort((a, b) => a.threshold - b.threshold);

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
                            if (specifiedVariantId) {
                                const variant = product.variants.find(v => v.id === specifiedVariantId);
                                tier.variantId = variant ? variant.id : product.variants[0].id;
                            } else {
                                tier.variantId = product.variants[0].id;
                            }
                            renderGiftTiers();
                            updateShippingStatus();
                        }
                    })
                    .catch(err => console.error(`Error fetching gift product ${handle}:`, err));
            }
        });

        // Initial render
        renderGiftTiers();
        updateShippingStatus();
    }

    function getCartTotalForGifts() {
        // Calculate cart total for non-gift, non-bogo-free items
        // Returns total in shop's BASE currency (EUR) for threshold comparison
        let total = 0;
        cartItems.forEach(item => {
            if (item.isGift || item.isBogoFree) return;

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
            
            // Apply upsell discount (50% off) if applicable
            if (item.isUpsellDiscount) {
                variantPrice = variantPrice * 0.5; // 50% discount
            }

            total += variantPrice * item.quantity;
        });

        let totalInCurrency = total / 100;

        // Convert back to base currency (EUR) if user is viewing in a different currency
        if (typeof Shopify !== 'undefined' && Shopify.currency && Shopify.currency.rate) {
            const rate = parseFloat(Shopify.currency.rate);
            if (rate && rate !== 1) {
                totalInCurrency = totalInCurrency / rate;
            }
        }

        return totalInCurrency;
    }

    function updateGiftTiers() {
        if (!giftTiersEnabled || giftTiers.length === 0) return;
        renderGiftTiers();
        updateShippingStatus();
    }

    // Update shipping status based on Tier 0 (free shipping) unlock status
    function updateShippingStatus() {
        const shippingStatusEl = document.getElementById('shipping-status');
        if (!shippingStatusEl) return;
        
        // Find Tier 0 (free shipping tier)
        const tier0 = giftTiers.find(tier => tier.tier === 0 && tier.isFreeShipping);
        
        if (tier0 && tier0.unlocked) {
            shippingStatusEl.textContent = 'Free';
        } else {
            shippingStatusEl.textContent = 'Paid';
        }
    }

    function renderGiftTiers() {
        if (!giftTiersEnabled) return;

        const cartTotal = getCartTotalForGifts();
        const progressBar = document.querySelector('[data-gift-progress-bar]');
        const progressLabel = document.querySelector('[data-gift-progress-label]');
        const milestonesContainer = document.querySelector('[data-gift-milestones]');

        if (!progressBar || !progressLabel || !milestonesContainer) return;
        
        // Filter tiers for positioning calculation - include tier 0 (free shipping) and tiers with products
        const tiersWithProducts = giftTiers.filter(tier => tier.isFreeShipping || tier.product);

        // Update unlocked status first (needed for progress bar calculation)
        giftTiers.forEach(tier => {
            // For tier 0 (free shipping), unlock if cart has at least 1 item
            if (tier.tier === 0 && tier.threshold === 0) {
                const hasItems = cartItems.some(item => !item.isGift && !item.isBogoFree && item.quantity > 0);
                tier.unlocked = hasItems;
            } else {
                tier.unlocked = cartTotal >= tier.threshold;
            }
        });

        // Find the next tier to unlock and max threshold
        const maxThreshold = giftTiers.length > 0 ? giftTiers[giftTiers.length - 1].threshold : 1;
        const nextTier = giftTiers.find(t => !t.unlocked);
        const allUnlocked = !nextTier;

        // Calculate positions for milestones first (needed for progress bar calculation)
        const productCount = tiersWithProducts.length;
        const edgeMargin = 10; // Percentage margin from edges
        const availableWidth = 100 - (edgeMargin * 2); // Available width between margins
        
        // Create a map of tier to position
        const tierPositionMap = new Map();
        tiersWithProducts.forEach((tier, index) => {
            let position;
            if (productCount === 1) {
                position = 50; // Center if only one product
            } else {
                // Distribute evenly with margins
                // First product at edgeMargin, last product at 100 - edgeMargin
                position = edgeMargin + (availableWidth / (productCount - 1)) * index;
                position = Math.min(position, 100 - edgeMargin); // Ensure last doesn't exceed right margin
            }
            tierPositionMap.set(tier.tier, position);
        });

        // Check if cart is empty (no items at all)
        const hasCartItems = cartItems.some(item => !item.isGift && !item.isBogoFree && item.quantity > 0);
        
        // Update progress bar based on milestone positions
        let progressBarWidth = 0;
        
        // If cart is completely empty, progress bar should be 0
        if (!hasCartItems) {
            progressBarWidth = 0;
        } else if (allUnlocked) {
            // All tiers unlocked - fill to 100% immediately
            progressBarWidth = 100;
        } else if (tiersWithProducts.length === 0) {
            // No products configured
            progressBarWidth = 0;
        } else {
            // Find last unlocked tier with product
            const unlockedTiersWithProducts = tiersWithProducts.filter(t => t.unlocked);
            
            if (unlockedTiersWithProducts.length === 0) {
                // No tiers unlocked yet - progress from 0% to first milestone
                const firstTier = tiersWithProducts[0];
                const firstPosition = tierPositionMap.get(firstTier.tier);
                
                // Handle tier 0 (free shipping) with threshold 0
                if (firstTier.threshold === 0) {
                    // Tier 0 should unlock when cart has items, so if we're here, it means cart is empty
                    // But we already checked hasCartItems above, so this shouldn't happen
                    // However, if threshold is 0, we can't divide by it, so set progress to 0
                    progressBarWidth = 0;
                } else {
                    const progressToFirst = Math.min((cartTotal / firstTier.threshold) * firstPosition, firstPosition);
                    // Don't go past the first milestone until it's unlocked
                    progressBarWidth = Math.min(progressToFirst, firstPosition);
                }
            } else {
                // At least one tier unlocked
                const lastUnlockedTier = unlockedTiersWithProducts[unlockedTiersWithProducts.length - 1];
                const lastUnlockedPosition = tierPositionMap.get(lastUnlockedTier.tier);
                
                // Check if this is the last tier (all tiers after this are also unlocked or this is the last tier)
                const isLastTier = tiersWithProducts.indexOf(lastUnlockedTier) === tiersWithProducts.length - 1;
                
                // Find next tier to unlock
                const nextTierWithProduct = tiersWithProducts.find(t => !t.unlocked && t.threshold > lastUnlockedTier.threshold);
                
                if (!nextTierWithProduct || isLastTier) {
                    // No more tiers to unlock OR this is the last tier - fill to 100% immediately
                    progressBarWidth = 100;
                } else {
                    // Interpolate between last unlocked position and next milestone position
                    // But don't exceed the next milestone position until it's actually unlocked
                    const nextPosition = tierPositionMap.get(nextTierWithProduct.tier);
                    const thresholdRange = nextTierWithProduct.threshold - lastUnlockedTier.threshold;
                    const progressAmount = cartTotal - lastUnlockedTier.threshold;
                    
                    // Only progress if we're making progress toward the next threshold
                    if (progressAmount >= thresholdRange) {
                        // We've reached the threshold, but tier might not be marked unlocked yet
                        // Don't go past the next milestone position
                        progressBarWidth = Math.min(nextPosition, 100);
                    } else {
                        // Interpolate between last unlocked position and next milestone position
                        const progressRange = nextPosition - lastUnlockedPosition;
                        const progressRatio = Math.min(Math.max(progressAmount / thresholdRange, 0), 0.98); // Cap at 0.98 to never reach next milestone until unlocked
                        progressBarWidth = lastUnlockedPosition + (progressRange * progressRatio);
                        // Ensure we never exceed the next milestone position
                        progressBarWidth = Math.min(progressBarWidth, nextPosition);
                    }
                }
            }
        }
        
        progressBar.style.width = `${Math.min(Math.max(progressBarWidth, 0), 100)}%`;

        // Helper to format currency
        const formatCurrency = (amountInBaseCurrency) => {
            let cents = Math.round(amountInBaseCurrency * 100);
            if (typeof Shopify !== 'undefined' && Shopify.currency && Shopify.currency.rate) {
                const rate = parseFloat(Shopify.currency.rate);
                if (rate && rate !== 1) {
                    cents = Math.round(cents * rate);
                }
            }
            const formatted = formatMoney(cents);
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = formatted;
            return tempDiv.textContent || tempDiv.innerText || formatted;
        };

        // Helper function to get gift name with variant
        const getGiftName = (tier) => {
            if (!tier) return '';
            // Check if this is free shipping tier
            if (tier.isFreeShipping) {
                return tier.freeShippingText || 'Free Shipping';
            }
            if (!tier.product) return '';
            const variant = tier.variantId ? tier.product.variants.find(v => v.id === tier.variantId) : tier.product.variants[0];
            const variantTitle = variant && variant.title !== 'Default Title' ? ` (${variant.title})` : '';
            return `${tier.product.title}${variantTitle}`;
        };

        // Update progress label (supports richtext HTML)
        if (allUnlocked) {
            progressLabel.innerHTML = giftCompleteText;
        } else if (nextTier) {
            const remaining = nextTier.threshold - cartTotal;
            const lastUnlockedTier = giftTiers.filter(t => t.unlocked).pop();
            const hasUnlockedGifts = lastUnlockedTier && (lastUnlockedTier.product || lastUnlockedTier.isFreeShipping);
            
            // Get gift names
            const currentGiftName = hasUnlockedGifts ? getGiftName(lastUnlockedTier) : '';
            const nextGiftName = nextTier ? getGiftName(nextTier) : '';
            
            let headerText;
            
            if (!hasUnlockedGifts) {
                // No gifts unlocked yet - show simplified format: "Spend [[remaining]] more to get [[next_gift]]"
                headerText = `<p>Spend ${formatCurrency(remaining)} more to get ${nextGiftName}</p>`;
            } else {
                // Use the richtext template and replace all placeholders
                headerText = giftProgressText
                    .replace('[[remaining]]', formatCurrency(remaining))
                    .replace('[[current]]', formatCurrency(cartTotal))
                    .replace('[[next_tier]]', formatCurrency(nextTier.threshold))
                    .replace('[[current_gift]]', currentGiftName)
                    .replace('[[next_gift]]', nextGiftName);
            }
            
            progressLabel.innerHTML = headerText;
        } else {
            const firstTier = giftTiers[0];
            const remaining = firstTier ? firstTier.threshold - cartTotal : 0;
            
            // Get gift names - no gifts unlocked yet
            const nextGiftName = firstTier ? getGiftName(firstTier) : '';
            
            // No gifts unlocked yet - show simplified format: "Spend [[remaining]] more to get [[next_gift]]"
            progressLabel.innerHTML = `<p>Spend ${formatCurrency(remaining)} more to get ${nextGiftName}</p>`;
        }


        // Render milestones with product images or shipping icon
        if (milestonesContainer) {
            milestonesContainer.innerHTML = '';
            tiersWithProducts.forEach((tier) => {
                const position = tierPositionMap.get(tier.tier);
                
                const milestone = document.createElement('div');
                milestone.className = `gift-milestone ${tier.unlocked ? 'reached' : ''}`;
                milestone.dataset.tier = tier.tier;
                milestone.style.left = `${position}%`;
                
                // Check if this is the free shipping tier (tier 0)
                if (tier.isFreeShipping) {
                    // Use shipping icon instead of product image
                    milestone.innerHTML = `
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none" class="gift-milestone-icon">
                            <g clip-path="url(#clip0_10099_16413)">
                                <path d="M8.5293 14.7663C8.5292 14.7931 8.53579 14.8195 8.54846 14.843C8.56112 14.8666 8.57947 14.8867 8.60184 14.9014C8.62421 14.9161 8.6499 14.9249 8.67657 14.9272C8.70324 14.9295 8.73005 14.9251 8.75458 14.9144L14.7472 12.1916C14.8632 12.1395 14.9612 12.0543 15.0288 11.9466C15.0963 11.8389 15.1305 11.7136 15.127 11.5865V4.43528C15.1271 4.40852 15.1205 4.38215 15.1078 4.35857C15.0952 4.33499 15.0768 4.31494 15.0545 4.30024C15.0321 4.28554 15.0064 4.27665 14.9797 4.27438C14.9531 4.27211 14.9262 4.27653 14.9017 4.28724L8.62585 7.13873C8.59706 7.1513 8.57258 7.17201 8.55543 7.19831C8.53827 7.22462 8.52919 7.25537 8.5293 7.28678V14.7663ZM11.6833 8.57414C11.7122 8.54335 11.7471 8.51881 11.7859 8.50204C11.8246 8.48526 11.8664 8.47661 11.9086 8.47661C11.9508 8.47661 11.9926 8.48526 12.0314 8.50204C12.0701 8.51881 12.105 8.54335 12.1339 8.57414L13.0994 9.53965C13.1455 9.5833 13.177 9.64008 13.1897 9.70227C13.2023 9.76446 13.1955 9.82904 13.1702 9.88724C13.1461 9.94601 13.1051 9.99633 13.0524 10.0318C12.9997 10.0673 12.9377 10.0865 12.8741 10.0868H12.5523C12.5096 10.0868 12.4687 10.1037 12.4385 10.1339C12.4083 10.1641 12.3914 10.205 12.3914 10.2477V11.3741C12.3914 11.5022 12.3405 11.625 12.25 11.7155C12.1594 11.806 12.0366 11.8569 11.9086 11.8569C11.7806 11.8569 11.6578 11.806 11.5672 11.7155C11.4767 11.625 11.4258 11.5022 11.4258 11.3741V10.2477C11.4258 10.205 11.4089 10.1641 11.3787 10.1339C11.3485 10.1037 11.3076 10.0868 11.2649 10.0868H10.9431C10.8796 10.0865 10.8175 10.0673 10.7648 10.0318C10.7121 9.99633 10.6711 9.94601 10.647 9.88724C10.6217 9.82904 10.6149 9.76446 10.6275 9.70227C10.6402 9.64008 10.6717 9.5833 10.7178 9.53965L11.6833 8.57414Z" fill="white"/>
                                <path d="M4.87951 6.0772C4.8575 6.0628 4.83178 6.05513 4.80548 6.05513C4.77919 6.05513 4.75346 6.0628 4.73146 6.0772C4.70939 6.09211 4.69138 6.11227 4.67902 6.13586C4.66666 6.15945 4.66035 6.18574 4.66066 6.21237V7.49973C4.66066 7.62776 4.60979 7.75055 4.51926 7.84109C4.42872 7.93162 4.30593 7.98249 4.1779 7.98249C4.04986 7.98249 3.92707 7.93162 3.83654 7.84109C3.746 7.75055 3.69514 7.62776 3.69514 7.49973V5.68455C3.6939 5.65262 3.68354 5.62171 3.66529 5.59547C3.64704 5.56924 3.62166 5.54878 3.59215 5.53651L0.547553 4.24915C0.523295 4.23813 0.496958 4.23242 0.470312 4.23242C0.443665 4.23242 0.417328 4.23813 0.39307 4.24915C0.371399 4.26446 0.353676 4.2847 0.341365 4.3082C0.329055 4.3317 0.322508 4.35779 0.322266 4.38433V11.5871C0.3229 11.7142 0.361136 11.8382 0.432155 11.9436C0.503174 12.049 0.603798 12.131 0.721346 12.1793L7.33836 14.9471C7.36221 14.9595 7.38871 14.966 7.4156 14.966C7.44249 14.966 7.46898 14.9595 7.49284 14.9471C7.51482 14.9336 7.53292 14.9147 7.54534 14.8921C7.55776 14.8695 7.56407 14.8441 7.56364 14.8183V7.30019C7.56375 7.26878 7.55467 7.23803 7.53751 7.21172C7.52036 7.18541 7.49588 7.1647 7.46709 7.15214L4.87951 6.0772Z" fill="white"/>
                                <path d="M10.2345 1.81592C10.2579 1.79958 10.2762 1.77711 10.2876 1.75098C10.2989 1.72485 10.3029 1.69609 10.2989 1.66788C10.2986 1.63738 10.2892 1.60766 10.272 1.58246C10.2549 1.55726 10.2306 1.5377 10.2023 1.52627L7.98165 0.547878C7.90043 0.512435 7.81278 0.494141 7.72417 0.494141C7.63557 0.494141 7.54791 0.512435 7.4667 0.547878L1.28739 3.21914C1.25858 3.23344 1.2343 3.25545 1.21725 3.28272C1.20021 3.30999 1.19106 3.34146 1.19084 3.37363C1.18619 3.40662 1.19332 3.4402 1.21098 3.46845C1.22864 3.49671 1.2557 3.51783 1.28739 3.52811L3.9844 4.65454C4.0057 4.66394 4.02872 4.6688 4.05199 4.6688C4.07527 4.6688 4.09828 4.66394 4.11958 4.65454L10.2345 1.81592Z" fill="white"/>
                                <path d="M7.97621 6.31526C7.99628 6.32495 8.01829 6.32998 8.04058 6.32998C8.06287 6.32998 8.08487 6.32495 8.10494 6.31526L14.2006 3.541C14.2294 3.52844 14.2538 3.50773 14.271 3.48142C14.2882 3.45512 14.2972 3.42436 14.2971 3.39296C14.2968 3.36246 14.2875 3.33274 14.2703 3.30754C14.2531 3.28234 14.2289 3.26278 14.2006 3.25135L11.8125 2.20859C11.7912 2.19919 11.7682 2.19434 11.7449 2.19434C11.7217 2.19434 11.6987 2.19919 11.6774 2.20859L5.5946 5.03434C5.56581 5.0469 5.54133 5.06761 5.52418 5.09392C5.50702 5.12022 5.49794 5.15098 5.49805 5.18238C5.5007 5.21393 5.51161 5.24422 5.52969 5.27021C5.54777 5.2962 5.57238 5.31697 5.60104 5.33043L7.97621 6.31526Z" fill="white"/>
                            </g>
                            <defs>
                                <clipPath id="clip0_10099_16413">
                                    <rect width="15.4483" height="15.4483" fill="white"/>
                                </clipPath>
                            </defs>
                        </svg>
                    `;
                } else {
                    // Regular product tier - use product image
                    const variant = tier.variantId ? tier.product.variants.find(v => v.id === tier.variantId) : tier.product.variants[0];
                    const imageUrl = variant?.featured_image?.src || tier.product.featured_image?.src || tier.product.featured_image || '';
                    
                    if (imageUrl) {
                        const img = document.createElement('img');
                        img.src = imageUrl;
                        img.alt = tier.product.title;
                        img.className = 'gift-milestone-image';
                        milestone.appendChild(img);
                    }
                }
                
                milestonesContainer.appendChild(milestone);
            });
        }
    }

    function initRecommendations() {
        if (initialized) return;

        if (!window.QuizManager || !window.QuizManager.recommendedProducts) {
            return;
        }

        let productHandles = window.QuizManager.recommendedProducts;

        // Get custom sort order from data attribute
        const recommendationsSection = document.querySelector('[data-recommendations]');
        const sortOrder = recommendationsSection?.dataset.productSortOrder;

        // Load BOGO settings
        bogoEnabled = recommendationsSection?.dataset.bogoEnabled === 'true';
        const bogoProductsData = recommendationsSection?.dataset.bogoProducts;
        bogoProductHandles = bogoProductsData ? bogoProductsData.split(',').map(h => h.trim()).filter(h => h) : [];
        bogoBadgeText = recommendationsSection?.dataset.bogoBadgeText || 'BUY 1 GET 1 FREE';
        bogoCartText = recommendationsSection?.dataset.bogoCartText || 'Buy 1 Get 1 Free';

        // Initialize tiered gift system
        initGiftTiers();

        if (sortOrder && sortOrder.trim() !== '') {
            const sortOrderHandles = sortOrder.split(',').map(h => h.trim()).filter(h => h);

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
            return;
        }

        initialized = true;

        // Fetch quiz recommended products
        const fetchPromises = productHandles.map(handle => {
            if (!handle) return Promise.resolve(null);
            return fetch(`/products/${handle}.js`)
                .then(response => response.ok ? response.json() : null)
                .catch(() => null);
        });

        Promise.all(fetchPromises).then(products => {
            
            // Store all products globally for access in updateProductCardButtons
            window.quizRecommendationsProducts = products.filter(p => p !== null);
            
            // Section 1: Top 3 picks (auto-added to cart)
            const topPicks = products.slice(0, 3).filter(p => p !== null);
            
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
            
            // Store additional products globally for upsell package blocks
            window.quizRecommendationsAdditionalProducts = additionalProducts;
            
            // Check if there are any upsell package blocks - if so, hide Section 2
            const upsellBlocks = document.querySelectorAll('[data-upsell-package-block]');
            const section2Element = document.querySelector('[data-section="additional"]');
            
            if (upsellBlocks.length > 0 && section2Element) {
                // Hide Section 2 if upsell blocks exist
                section2Element.style.display = 'none';
                // Also hide the divider before Section 3 if Section 2 is hidden
                const divider = section2Element.previousElementSibling;
                if (divider && divider.classList.contains('section-divider')) {
                    divider.style.display = 'none';
                }
                
                // Update upsell blocks text with dynamic price and product count
                upsellBlocks.forEach(block => {
                    updateUpsellPackageBlockText(block);
                });
                
                // Re-initialize upsell blocks now that products are available
                initUpsellPackageBlocks();
            } else {
                // Show Section 2 normally if no upsell blocks
                additionalProducts.forEach((product) => {
                    productStates[product.id] = { removed: false, quantity: 1 };
                    const productCard = createProductCard(product, 'additional');
                    additionalContainer.appendChild(productCard);
                    // NOT auto-added to cart
                });
            }

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
                
                return fetch(`/products/${handle}.js`)
                    .then(response => response.ok ? response.json() : null)
                    .catch(() => null);
            });

            Promise.all(accessoryPromises).then(accessories => {
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
                <button class="product-remove-btn" data-remove-btn aria-label="Remove product" style="display: none;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="none">
                        <path d="M2.5 4.99996H17.5M15.8333 4.99996V16.6666C15.8333 17.5 15 18.3333 14.1667 18.3333H5.83333C5 18.3333 4.16667 17.5 4.16667 16.6666V4.99996M6.66667 4.99996V3.33329C6.66667 2.49996 7.5 1.66663 8.33333 1.66663H11.6667C12.5 1.66663 13.3333 2.49996 13.3333 3.33329V4.99996M8.33333 9.16663V14.1666M11.6667 9.16663V14.1666" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
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
                const selectedVariantId = parseInt(card.dataset.variantId);
                const selectedOption = card.querySelector('input[type="radio"]:checked');
                const sellingPlanId = selectedOption?.dataset.sellingPlan || null;
                
                // Actually remove from cart
                updateCartItem(selectedVariantId, 0, product, sellingPlanId);
                
                // Update button visibility after removing
                setTimeout(() => {
                    checkCartState();
                }, 100);
            });
        }

        // Check if product is already in cart and update button visibility
        const checkCartState = () => {
            const selectedVariantId = parseInt(card.dataset.variantId);
            const selectedOption = card.querySelector('input[type="radio"]:checked');
            const sellingPlanId = selectedOption?.dataset.sellingPlan || null;
            const numericSellingPlanId = sellingPlanId ? parseInt(sellingPlanId) : null;
            
            const itemInCart = cartItems.find(item => {
                const itemVariantId = parseInt(item.variantId);
                const itemSellingPlanId = item.sellingPlanId ? parseInt(item.sellingPlanId) : null;
                return itemVariantId === selectedVariantId && 
                       itemSellingPlanId === numericSellingPlanId &&
                       !item.isGift && 
                       !item.isBogoFree;
            });
            
            const addBtn = card.querySelector('[data-add-btn]');
            const removeBtn = card.querySelector('[data-remove-btn]');
            
            if (itemInCart && itemInCart.quantity > 0) {
                // Product is in cart - show remove button, hide add button
                if (addBtn) addBtn.style.display = 'none';
                if (removeBtn) removeBtn.style.display = 'block';
                card.classList.remove('removed');
                productStates[product.id].removed = false;
            } else {
                // Product is not in cart - show add button, hide remove button
                if (addBtn) addBtn.style.display = 'inline-flex';
                if (removeBtn) removeBtn.style.display = 'none';
                card.classList.add('removed');
                productStates[product.id].removed = true;
            }
        };
        
        // Check initial state
        checkCartState();

        const addBtn = card.querySelector('[data-add-btn]');
        if (addBtn) {
            addBtn.addEventListener('click', () => {
                const currentQty = productStates[product.id].quantity || 1;
                const selectedOption = card.querySelector('input[type="radio"]:checked');
                const sellingPlanId = selectedOption?.dataset.sellingPlan || null;
                const selectedVariantId = parseInt(card.dataset.variantId);
                addToCart(selectedVariantId, currentQty, product, sellingPlanId);
                
                // Update button visibility after adding
                setTimeout(() => {
                    checkCartState();
                }, 100);
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


                    // Only update cart if product is in cart (check by variantId)
                    const itemInCart = cartItems.find(item => item.variantId === selectedVariantId);

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
                        
                        // Update button visibility after purchase option change
                        setTimeout(() => {
                            checkCartState();
                        }, 100);
                    } else {
                        // Product not in cart, update button visibility
                        checkCartState();
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


        updateCartDisplay();
        
        // Update gift tiers after cart changes
        updateGiftTiers();
        
        // Update button visibility for all product cards after cart changes
        updateProductCardButtons();
    }
    
    function updateProductCardButtons() {
        // Update button visibility for all product cards based on cart state
        const allCards = document.querySelectorAll('.recommended-product-card');
        allCards.forEach(card => {
            const productId = card.dataset.productId;
            if (!productId) return;
            
            const selectedVariantId = parseInt(card.dataset.variantId);
            if (isNaN(selectedVariantId)) return;
            
            // Get the selected purchase option (subscription or one-time)
            const selectedOption = card.querySelector('input[type="radio"]:checked');
            if (!selectedOption) return;
            
            // Determine sellingPlanId based on the selected option
            let numericSellingPlanId = null;
            if (selectedOption.value === 'subscription') {
                const sellingPlanId = selectedOption.dataset.sellingPlan;
                numericSellingPlanId = sellingPlanId ? parseInt(sellingPlanId) : null;
            } else if (selectedOption.value === 'onetime') {
                numericSellingPlanId = null; // One-time purchases don't have sellingPlanId
            }
            
            // Check if the currently selected purchase option is in the cart
            const itemInCart = cartItems.find(item => {
                const itemVariantId = parseInt(item.variantId);
                const itemSellingPlanId = item.sellingPlanId ? parseInt(item.sellingPlanId) : null;
                return itemVariantId === selectedVariantId && 
                       itemSellingPlanId === numericSellingPlanId &&
                       !item.isGift && 
                       !item.isBogoFree;
            });
            
            const addBtn = card.querySelector('[data-add-btn]');
            const removeBtn = card.querySelector('[data-remove-btn]');
            
            if (itemInCart && itemInCart.quantity > 0) {
                // Product is in cart - show remove button, hide add button
                if (addBtn) addBtn.style.display = 'none';
                if (removeBtn) removeBtn.style.display = 'block';
                card.classList.remove('removed');
                if (productStates[productId]) {
                    productStates[productId].removed = false;
                }
            } else {
                // Product is not in cart - show add button, hide remove button
                const isTopPicks = card.closest('[data-section-products]')?.dataset.sectionProducts === 'top-picks';
                
                if (isTopPicks) {
                    // For top-picks, if add button doesn't exist, create it
                    if (!addBtn) {
                        const addButton = document.createElement('button');
                        addButton.className = 'product-add-btn product-add-btn-corner';
                        addButton.setAttribute('data-add-btn', '');
                        addButton.textContent = 'Add';
                        card.appendChild(addButton);
                        
                        // Add click handler for the new add button
                        addButton.addEventListener('click', () => {
                            // Find product from stored products or cartItems
                            const product = (window.quizRecommendationsProducts || []).find(p => p.id === parseInt(productId)) ||
                                          cartItems.find(item => item.product.id === parseInt(productId))?.product;
                            
                            if (product) {
                                const currentQty = productStates[productId]?.quantity || 1;
                                const selectedOption = card.querySelector('input[type="radio"]:checked');
                                const sellingPlanId = selectedOption?.dataset.sellingPlan || null;
                                const selectedVariantId = parseInt(card.dataset.variantId);
                                addToCart(selectedVariantId, currentQty, product, sellingPlanId);
                                
                                setTimeout(() => {
                                    updateProductCardButtons();
                                }, 100);
                            }
                        });
                    }
                    if (addBtn) addBtn.style.display = 'inline-flex';
                } else {
                    if (addBtn) addBtn.style.display = 'inline-flex';
                }
                
                if (removeBtn) removeBtn.style.display = 'none';
                card.classList.add('removed');
                if (productStates[productId]) {
                    productStates[productId].removed = true;
                }
            }
        });
    }

    function removeProductFromCart(product, variantId) {
        // This function removes a product from cart AND updates the product card state
        // It's used by both the product card remove button and the cart item remove button

        // Find the product card - try multiple selectors
        let productCard = document.querySelector(`[data-product-id="${product.id}"]`);

        // If it's a custom element, look for the actual recommended-product-card inside it
        if (productCard && productCard.tagName === 'PRODUCT-BLOCK') {
            const innerCard = productCard.querySelector('.recommended-product-card');
            if (innerCard) {
                productCard = innerCard;
            }
        }


        if (productCard && productStates[product.id]) {

            // Update state
            productStates[product.id].removed = true;
            productCard.classList.add('removed');


            // Update buttons - search more deeply
            let addBtn = productCard.querySelector('[data-add-btn]');
            let removeBtn = productCard.querySelector('[data-remove-btn]');

            // If not found, search globally by product ID and button attributes
            if (!addBtn || !removeBtn) {
                const allCards = document.querySelectorAll(`[data-product-id="${product.id}"]`);

                allCards.forEach((card, index) => {
                    const tempAdd = card.querySelector('[data-add-btn]');
                    const tempRemove = card.querySelector('[data-remove-btn]');
                    if (tempAdd) {
                        addBtn = tempAdd;
                    }
                    if (tempRemove) {
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
        const numericSellingPlanId = sellingPlanId ? parseInt(sellingPlanId) : null;

        if (quantity === 0) {
            // Remove item from cart: filter out items that match variantId and sellingPlanId (but keep gifts and BOGO items)
            cartItems = cartItems.filter(item => {
                // Keep items with different variantId
                if (parseInt(item.variantId) !== numericVariantId) return true;
                // Keep gifts and BOGO items
                if (item.isGift || item.isBogoFree) return true;
                // Remove items with matching variantId and sellingPlanId
                const itemSellingPlanId = item.sellingPlanId ? parseInt(item.sellingPlanId) : null;
                return itemSellingPlanId !== numericSellingPlanId;
            });
            
            updateCartDisplay();
            
            // Update gift tiers after cart changes (when removing items)
            updateGiftTiers();
            
            // Update button visibility for all product cards after cart changes
            updateProductCardButtons();
        } else {
            // When adding/updating: Remove only non-gift, non-BOGO items with this variantId (preserve gifts and BOGO free items)
            // When switching purchase options (subscription <-> one-time), remove the old option
            cartItems = cartItems.filter(item => {
                // Keep items with different variantId
                if (parseInt(item.variantId) !== numericVariantId) return true;
                // Keep gifts and BOGO items
                if (item.isGift || item.isBogoFree) return true;
                // Remove items with same variantId but different sellingPlanId (switching purchase options)
                const itemSellingPlanId = item.sellingPlanId ? parseInt(item.sellingPlanId) : null;
                // Only keep if sellingPlanId matches (same purchase option)
                return itemSellingPlanId === numericSellingPlanId;
            });

            addToCart(numericVariantId, quantity, product, sellingPlanId);
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
                    // Check for compare_at_price (product discount)
                    const variant = item.product.variants.find(v => v.id === parseInt(item.variantId));
                    const compareAtPrice = variant && variant.compare_at_price && variant.compare_at_price > variantPrice 
                        ? variant.compare_at_price 
                        : null;
                    
                    // Use compare_at_price as original price if it exists, otherwise use variantPrice
                    const originalPrice = compareAtPrice || variantPrice;
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

                    // Add original price (compare_at_price if exists, otherwise variantPrice) to subtotal
                    subtotal += originalPrice * item.quantity;
                    // Calculate total discount: product discount (if compare_at_price exists) + subscription discount
                    const productDiscount = compareAtPrice ? (compareAtPrice - variantPrice) * item.quantity : 0;
                    const subscriptionDiscount = (variantPrice - price) * item.quantity;
                    totalDiscount += productDiscount + subscriptionDiscount;
                }
            } else {
                // For one-time items, check for upsell discount first, then compare_at_price
                const variant = item.product.variants.find(v => v.id === parseInt(item.variantId));
                
                // Check if this item has upsell discount (50% off)
                if (item.isUpsellDiscount) {
                    // Apply 50% discount
                    const originalPrice = variantPrice;
                    const discountedPrice = variantPrice * 0.5; // 50% discount
                    subtotal += originalPrice * item.quantity;
                    totalDiscount += (originalPrice - discountedPrice) * item.quantity;
                    // Store discounted price for display
                    item._upsellDiscountedPrice = discountedPrice;
                } else {
                    // Check for compare_at_price (product discount)
                    const compareAtPrice = variant && variant.compare_at_price && variant.compare_at_price > variantPrice 
                        ? variant.compare_at_price 
                        : null;
                    
                    if (compareAtPrice) {
                        // If there's a product discount, add original price to subtotal and discount to totalDiscount
                        subtotal += compareAtPrice * item.quantity;
                        totalDiscount += (compareAtPrice - variantPrice) * item.quantity;
                    } else {
                        // No discount, just add price to subtotal
                        subtotal += variantPrice * item.quantity;
                    }
                }
                
                onetimeItems.push(item);
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
            
            // Check if this item has upsell discount (50% off)
            let itemTotal;
            let originalTotal;
            
            if (item.isUpsellDiscount) {
                // Apply 50% discount
                originalTotal = price * item.quantity;
                itemTotal = originalTotal * 0.5; // 50% discount
            } else {
                itemTotal = price * item.quantity;
                originalTotal = null;
            }

            // Check for compare_at_price (product discount) - only if no upsell discount
            const hasCompareAtPrice = !item.isUpsellDiscount && variant && variant.compare_at_price && variant.compare_at_price > price;
            const compareAtTotal = hasCompareAtPrice ? variant.compare_at_price * item.quantity : null;

            // Get variant title if there are multiple variants
            let productName = item.product.title;
            if (item.product.variants.length > 1 && variant.title !== 'Default Title') {
                productName += ` - ${variant.title}`;
            }

            // Determine price HTML
            let priceHTML = '';
            if (item.isUpsellDiscount) {
                // Show discounted price with original price crossed out
                priceHTML = `
                    <div class="cart-item-price">
                        <span>${formatMoney(itemTotal)}</span>
                        <span class="cart-item-price-original">${formatMoney(originalTotal)}</span>
                    </div>
                `;
            } else if (hasCompareAtPrice) {
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

        // Check if cart is empty (no items to display)
        const hasItemsToDisplay = subscriptionGroups && Object.keys(subscriptionGroups).length > 0 || onetimeItems.length > 0;
        
        if (!hasItemsToDisplay) {
            // Show empty cart message
            const emptyCartMessage = document.createElement('div');
            emptyCartMessage.className = 'cart-empty-message';
            emptyCartMessage.textContent = 'Your cart is empty';
            cartItemsContainer.appendChild(emptyCartMessage);
        } else {
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
        }

        // Enable/disable checkout button based on cart state
        const checkoutBtns = document.querySelectorAll('[data-checkout-btn], .quiz-btn-checkout, .mobile-sticky-bar-checkout');
        checkoutBtns.forEach(btn => {
            if (!hasItemsToDisplay) {
                btn.disabled = true;
                btn.classList.add('disabled');
            } else {
                btn.disabled = false;
                btn.classList.remove('disabled');
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

        // Update mobile sticky bar total
        const mobileTotalEl = document.querySelector('[data-mobile-total-current]');
        if (mobileTotalEl) {
            mobileTotalEl.innerHTML = formatMoney(total);
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
                const sellingPlanId = cartItemEl.dataset.sellingPlanId ? parseInt(cartItemEl.dataset.sellingPlanId) : null;

                // Find the cart item to get the product reference
                // For subscription items, we need to match both variantId and sellingPlanId
                const cartItem = cartItems.find(item => {
                    const itemVariantId = parseInt(item.variantId);
                    const itemSellingPlanId = item.sellingPlanId ? parseInt(item.sellingPlanId) : null;
                    return itemVariantId === variantId && itemSellingPlanId === sellingPlanId;
                });
                
                if (cartItem && !cartItem.isGift) {
                    // For subscription items, we need to pass sellingPlanId to remove the correct item
                    // For one-time items, sellingPlanId will be null
                    updateCartItem(variantId, 0, cartItem.product, sellingPlanId);
                } else if (cartItem && cartItem.isGift) {
                    // For gift items, just remove from cart (no product card to update)
                    updateCartItem(variantId, 0, cartItem.product, sellingPlanId);
                }
            });
        });

        // Trigger currency converter to update all new prices
        setTimeout(() => {
            updateCurrencyConverter();
        }, 100);
        
        // Update shipping status
        updateShippingStatus();
    }

    const cartToggle = document.querySelector('[data-cart-toggle]');
    const cartClose = document.querySelector('[data-cart-close]');
    const cartSummary = document.querySelector('.cart-summary');
    const cartHeader = document.querySelector('[data-cart-header]');

    function initCartState() {
        if (cartSummary && window.innerWidth <= 1250) {
            cartSummary.classList.add('collapsed');
        }
    }

    if (cartToggle && cartSummary) {
        initCartState();

        window.addEventListener('resize', () => {
            if (window.innerWidth <= 1250) {
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

    // Track initialized blocks to prevent double initialization
    const initializedUpsellBlocks = new Set();

    // Update upsell package block text with dynamic price and product count
    async function updateUpsellPackageBlockText(block) {
        // Get product handles from the button's data attribute (from block settings)
        const button = block.querySelector('[data-upsell-package-button]');
        if (!button) return;
        
        const productHandles = button.getAttribute('data-product-handles');
        if (!productHandles || productHandles.trim() === '') return;
        
        // Split handles and fetch products
        const handles = productHandles.split(',').map(h => h.trim()).filter(h => h);
        if (handles.length === 0) return;
        
        try {
            // Fetch all products from their handles
            const productPromises = handles.map(handle => 
                fetch(`/products/${handle}.js`)
                    .then(response => {
                        if (!response.ok) {
                            console.error(`Failed to fetch product: ${handle}`);
                            return null;
                        }
                        return response.json();
                    })
                    .catch(err => {
                        console.error(`Error fetching product ${handle}:`, err);
                        return null;
                    })
            );
            
            const productResults = await Promise.all(productPromises);
            const products = productResults.filter(p => p !== null);
            
            if (products.length === 0) return;

            // Calculate total price with 50% discount
            let totalPrice = 0;
            products.forEach(product => {
                if (product.variants && product.variants.length > 0) {
                    // Use first available variant, or first variant if none available
                    const variant = product.variants.find(v => v.available) || product.variants[0];
                    if (variant && variant.price) {
                        // Convert price from cents to dollars
                        const priceInDollars = variant.price / 100;
                        totalPrice += priceInDollars;
                    }
                }
            });

            // Apply 50% discount
            const discountedPrice = totalPrice * 0.5;

            // Update button text
            const button = block.querySelector('[data-upsell-package-button]');
            if (button) {
            // Get the original button text from the data attribute (set by Liquid template)
            let baseText = button.getAttribute('data-original-text');
            
            // If no data attribute, try to extract from current text (remove price if present)
            if (!baseText) {
                const currentText = button.textContent.trim();
                // Remove price pattern: " — $XX.XX" or " — XX" at the end
                baseText = currentText.replace(/\s*—\s*\$?[\d,]+\.?\d*\s*$/, '').trim();
            }
            
            // If still empty, use default
            if (!baseText || baseText === '') {
                baseText = 'Claim Ultimate Package';
            }
            
                // Format the discounted price
                const formattedPrice = formatMoney(Math.round(discountedPrice * 100));
                
                // Update button HTML with new price and preserve SVG
                button.innerHTML = `${baseText} — ${formattedPrice}<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <path d="M5 12H19M19 12L12 5M19 12L12 19" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>`;
            }

            // Update description text
            const description = block.querySelector('.maison_commerce_maison_upsell_package__description');
            if (description) {
                let descriptionText = description.innerHTML;
                // Replace any number followed by "products" or standalone numbers that might be product counts
                // Look for patterns like "7 products" or "Get all 7 products"
                descriptionText = descriptionText.replace(/\b(\d+)\s+products?\b/g, `${products.length} products`);
                // Also replace standalone numbers that might be product counts (e.g., "Get all 7 —")
                descriptionText = descriptionText.replace(/\b(\d+)\b(?=\s*—)/g, products.length.toString());
                description.innerHTML = descriptionText;
            }
        } catch (error) {
            console.error('Error updating upsell package block text:', error);
        }
    }

    // Initialize Upsell Package Blocks
    function initUpsellPackageBlocks() {
        const upsellBlocks = document.querySelectorAll('[data-upsell-package-block]');
        
        upsellBlocks.forEach(block => {
            // Skip if already initialized
            if (initializedUpsellBlocks.has(block)) {
                return;
            }
            
            // Mark as initialized
            initializedUpsellBlocks.add(block);
            
            // Update block text with dynamic price and product count
            updateUpsellPackageBlockText(block);
            
            // Clear any existing interval if it exists
            if (block._upsellTimerInterval) {
                clearInterval(block._upsellTimerInterval);
                block._upsellTimerInterval = null;
            }
            
            // Initialize countdown timer
            const timer = block.querySelector('[data-countdown-timer]');
            if (timer) {
                const hoursEl = timer.querySelector('[data-timer-hours]');
                const minutesEl = timer.querySelector('[data-timer-minutes]');
                const secondsEl = timer.querySelector('[data-timer-seconds]');
                
                if (hoursEl && minutesEl && secondsEl) {
                    const hours = parseInt(block.dataset.countdownHours) || 0;
                    const minutes = parseInt(block.dataset.countdownMinutes) || 9;
                    const seconds = parseInt(block.dataset.countdownSeconds) || 57;
                    
                    let totalSeconds = hours * 3600 + minutes * 60 + seconds;
                    
                    // Store interval ID on the block element for cleanup
                    let intervalId = null;
                    
                    const updateTimer = () => {
                        // Decrement first
                        totalSeconds--;
                        
                        // Check if timer has expired
                        if (totalSeconds < 0) {
                            // Clear the interval
                            if (intervalId) {
                                clearInterval(intervalId);
                                intervalId = null;
                            }
                            
                            // Hide the entire block
                            block.style.display = 'none';
                            return;
                        }
                        
                        // Calculate and display time
                        const h = Math.floor(totalSeconds / 3600);
                        const m = Math.floor((totalSeconds % 3600) / 60);
                        const s = totalSeconds % 60;
                        
                        hoursEl.textContent = String(h).padStart(2, '0');
                        minutesEl.textContent = String(m).padStart(2, '0');
                        secondsEl.textContent = String(s).padStart(2, '0');
                    };
                    
                    // Initial display
                    const h = Math.floor(totalSeconds / 3600);
                    const m = Math.floor((totalSeconds % 3600) / 60);
                    const s = totalSeconds % 60;
                    
                    hoursEl.textContent = String(h).padStart(2, '0');
                    minutesEl.textContent = String(m).padStart(2, '0');
                    secondsEl.textContent = String(s).padStart(2, '0');
                    
                    // Start the interval - update every second
                    intervalId = setInterval(updateTimer, 1000);
                    
                    // Store interval ID on block for cleanup
                    block._upsellTimerInterval = intervalId;
                }
            }

            // Initialize button click handler
            const button = block.querySelector('[data-upsell-package-button]');
            if (button) {
                button.addEventListener('click', async (e) => {
                    e.preventDefault();
                    
                    // Get product handles from the button's data attribute (from block settings)
                    const productHandles = button.getAttribute('data-product-handles');
                    
                    if (!productHandles || productHandles.trim() === '') {
                        console.error('No product handles found in button data attribute');
                        alert('No products configured for this package.');
                        return;
                    }
                    
                    // Split handles and fetch products
                    const handles = productHandles.split(',').map(h => h.trim()).filter(h => h);
                    console.log('Upsell Package Button Clicked');
                    console.log('Product handles from block:', handles);
                    
                    if (handles.length === 0) {
                        console.error('No product handles found');
                        alert('No products configured for this package.');
                        return;
                    }

                    // Disable button during processing
                    button.disabled = true;
                    const originalText = button.innerHTML;
                    button.innerHTML = 'Adding to Cart...';

                    try {
                        // Fetch all products from their handles
                        const productPromises = handles.map(handle => 
                            fetch(`/products/${handle}.js`)
                                .then(response => {
                                    if (!response.ok) {
                                        console.error(`Failed to fetch product: ${handle}`);
                                        return null;
                                    }
                                    return response.json();
                                })
                                .catch(err => {
                                    console.error(`Error fetching product ${handle}:`, err);
                                    return null;
                                })
                        );
                        
                        const productResults = await Promise.all(productPromises);
                        const products = productResults.filter(p => p !== null);
                        
                        console.log('Fetched products:', products.length, 'out of', handles.length);
                        console.log('Products:', products);
                        
                        if (products.length === 0) {
                            throw new Error('No products could be fetched');
                        }

                        // Prepare cart items for Shopify API - only include available products
                        const itemsToAdd = [];
                        const skippedProducts = [];
                        
                        for (const product of products) {
                            if (product && product.variants && product.variants.length > 0) {
                                // Find the first available variant
                                const availableVariant = product.variants.find(v => v.available);
                                
                                if (availableVariant) {
                                    // Check if product has subscription options
                                    const hasSubscription = product.selling_plan_groups && product.selling_plan_groups.length > 0;
                                    
                                    // Prepare item data - explicitly set as one-time purchase
                                    const itemData = {
                                        id: availableVariant.id,
                                        quantity: 1,
                                        properties: {
                                            '_upsell_discount': '50',
                                            '_upsell_discount_type': 'percentage'
                                        }
                                    };
                                    
                                    // Explicitly ensure one-time purchase by NOT including selling_plan
                                    // Shopify defaults to one-time purchase when selling_plan is omitted
                                    // If we wanted subscription, we would add: itemData.selling_plan = planId
                                    // By omitting it, we ensure one-time purchase
                                    
                                    if (hasSubscription) {
                                        console.log(`Product "${product.title}" has subscription options, but adding as ONE-TIME PURCHASE (no selling_plan)`);
                                    }
                                    
                                    console.log(`Adding "${product.title}" with 50% discount property`);
                                    
                                    itemsToAdd.push(itemData);
                                } else {
                                    // No available variants - skip this product
                                    skippedProducts.push(product.title || product.handle);
                                    console.log(`Skipping sold-out product: ${product.title || product.handle}`);
                                }
                            } else {
                                skippedProducts.push(product?.title || product?.handle || 'Unknown product');
                                console.log(`Skipping product with no variants: ${product?.title || product?.handle || 'Unknown product'}`);
                            }
                        }
                        
                        // Log what we're adding
                        console.log('Upsell Package: Items to add (all as ONE-TIME PURCHASE):', itemsToAdd.map(item => ({
                            variantId: item.id,
                            quantity: item.quantity,
                            selling_plan: item.selling_plan || 'NONE (one-time purchase)'
                        })));

                        if (itemsToAdd.length === 0) {
                            throw new Error('No available products found to add to cart');
                        }

                        // Log skipped products if any
                        if (skippedProducts.length > 0) {
                            console.log(`Skipped ${skippedProducts.length} unavailable product(s):`, skippedProducts);
                        }

                        console.log(`Adding ${itemsToAdd.length} available product(s) to cart`);

                        // Add all available products to cart via Shopify API
                        const response = await fetch('/cart/add.js', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({ items: itemsToAdd })
                        });

                        if (response.ok) {
                            // Reload cart from Shopify to sync
                            const cartResponse = await fetch('/cart.js');
                            const cart = await cartResponse.json();
                            
                            // Update local cartItems array
                            cartItems.length = 0;
                            for (const item of cart.items) {
                                // Find the product from our fetched products
                                const product = products.find(p => p.handle === item.handle);
                                if (product) {
                                    // Check if this item has the upsell discount property
                                    const hasUpsellDiscount = item.properties && 
                                        item.properties._upsell_discount === '50';
                                    
                                    cartItems.push({
                                        variantId: item.variant_id,
                                        quantity: item.quantity,
                                        product: product,
                                        sellingPlanId: item.selling_plan_allocation ? item.selling_plan_allocation.selling_plan_id : null,
                                        isGift: false,
                                        isBogoFree: false,
                                        isUpsellDiscount: hasUpsellDiscount || false
                                    });
                                }
                            }
                            
                            // Update cart display and related functions
                            updateCartDisplay();
                            updateGiftTiers();
                            updateProductCardButtons();
                            
                            // Trigger cart update event
                            document.dispatchEvent(new CustomEvent('cart:updated'));

                            // Show success feedback
                            button.innerHTML = 'Added to Cart!';
                            setTimeout(() => {
                                button.innerHTML = originalText;
                                button.disabled = false;
                            }, 2000);
                        } else {
                            const errorData = await response.json();
                            throw new Error(errorData.description || 'Failed to add products to cart');
                        }
                    } catch (error) {
                        console.error('Error adding products to cart:', error);
                        button.innerHTML = originalText;
                        button.disabled = false;
                        alert('There was an error adding products to cart. Please try again.');
                    }
                });
            }
        });
    }

    const recommendationsSection = document.querySelector('[data-recommendations]');
    if (recommendationsSection) {
        const observer = new MutationObserver(function(mutations) {
            mutations.forEach(function(mutation) {
                if (mutation.attributeName === 'style') {
                    if (recommendationsSection.style.display !== 'none') {
                        initRecommendations();
                        initUpsellPackageBlocks();
                        observer.disconnect();
                    }
                }
            });
        });
        observer.observe(recommendationsSection, { attributes: true });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(() => {
                initRecommendations();
                initUpsellPackageBlocks();
            }, 100);
        });
    } else {
        setTimeout(() => {
            initRecommendations();
            initUpsellPackageBlocks();
        }, 100);
    }
})();
