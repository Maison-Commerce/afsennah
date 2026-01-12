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
        // Check any gift tiers container (desktop, mobile, or popup)
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
            
            // For upsell items, use regular price (no percentage discount applied)
            // The discount is already reflected in compare_at_price vs regular price
            // if (item.isUpsellDiscount) {
            //     variantPrice = variantPrice * 0.5; // 50% discount - REMOVED
            // }

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
        const shippingStatusPopup = document.getElementById('shipping-status-popup');
        
        // Find Tier 0 (free shipping tier)
        const tier0 = giftTiers.find(tier => tier.tier === 0 && tier.isFreeShipping);
        const statusText = (tier0 && tier0.unlocked) ? 'Free' : 'Paid';
        
        if (shippingStatusEl) {
            shippingStatusEl.textContent = statusText;
        }
        if (shippingStatusPopup) {
            shippingStatusPopup.textContent = statusText;
        }
    }

    function renderGiftTiers() {
        if (!giftTiersEnabled) return;

        const cartTotal = getCartTotalForGifts();
        // Desktop instances
        const progressBar = document.querySelector('[data-gift-progress-bar]');
        const progressLabel = document.querySelector('[data-gift-progress-label]');
        const milestonesContainer = document.querySelector('[data-gift-milestones]');
        // Mobile instances
        const progressBarMobile = document.querySelector('[data-gift-progress-bar-mobile]');
        const progressLabelMobile = document.querySelector('[data-gift-progress-label-mobile]');
        const milestonesContainerMobile = document.querySelector('[data-gift-milestones-mobile]');
        // Popup instances
        const progressBarPopup = document.querySelector('[data-gift-progress-bar-popup]');
        const progressLabelPopup = document.querySelector('[data-gift-progress-label-popup]');
        const milestonesContainerPopup = document.querySelector('[data-gift-milestones-popup]');

        // At least one instance should exist
        if (!progressBar && !progressBarMobile && !progressBarPopup) return;
        
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
        
        // Update desktop, mobile, and popup progress bars
        const progressBarWidthValue = `${Math.min(Math.max(progressBarWidth, 0), 100)}%`;
        if (progressBar) {
            progressBar.style.width = progressBarWidthValue;
        }
        if (progressBarMobile) {
            progressBarMobile.style.width = progressBarWidthValue;
        }
        if (progressBarPopup) {
            progressBarPopup.style.width = progressBarWidthValue;
        }

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

        // Update progress label (supports richtext HTML) - for both desktop and mobile
        let headerText = '';
        if (allUnlocked) {
            headerText = giftCompleteText;
        } else if (nextTier) {
            const remaining = nextTier.threshold - cartTotal;
            const lastUnlockedTier = giftTiers.filter(t => t.unlocked).pop();
            const hasUnlockedGifts = lastUnlockedTier && (lastUnlockedTier.product || lastUnlockedTier.isFreeShipping);
            
            // Get gift names
            const currentGiftName = hasUnlockedGifts ? getGiftName(lastUnlockedTier) : '';
            const nextGiftName = nextTier ? getGiftName(nextTier) : '';
            
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
        } else {
            const firstTier = giftTiers[0];
            const remaining = firstTier ? firstTier.threshold - cartTotal : 0;
            
            // Get gift names - no gifts unlocked yet
            const nextGiftName = firstTier ? getGiftName(firstTier) : '';
            
            // No gifts unlocked yet - show simplified format: "Spend [[remaining]] more to get [[next_gift]]"
            headerText = `<p>Spend ${formatCurrency(remaining)} more to get ${nextGiftName}</p>`;
        }
        
        // Update desktop, mobile, and popup labels
        if (progressLabel) {
            progressLabel.innerHTML = headerText;
        }
        if (progressLabelMobile) {
            progressLabelMobile.innerHTML = headerText;
        }
        if (progressLabelPopup) {
            progressLabelPopup.innerHTML = headerText;
        }


        // Helper function to create milestone element
        const createMilestoneElement = (tier, position) => {
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
            
            return milestone;
        };

        // Render milestones with product images or shipping icon - for desktop, mobile, and popup
        if (milestonesContainer) {
            milestonesContainer.innerHTML = '';
            tiersWithProducts.forEach((tier) => {
                const position = tierPositionMap.get(tier.tier);
                const milestone = createMilestoneElement(tier, position);
                milestonesContainer.appendChild(milestone);
            });
        }
        
        if (milestonesContainerMobile) {
            milestonesContainerMobile.innerHTML = '';
            tiersWithProducts.forEach((tier) => {
                const position = tierPositionMap.get(tier.tier);
                const milestone = createMilestoneElement(tier, position);
                milestonesContainerMobile.appendChild(milestone);
            });
        }
        
        if (milestonesContainerPopup) {
            milestonesContainerPopup.innerHTML = '';
            tiersWithProducts.forEach((tier) => {
                const position = tierPositionMap.get(tier.tier);
                const milestone = createMilestoneElement(tier, position);
                milestonesContainerPopup.appendChild(milestone);
            });
        }
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
            
            // Store all products globally for access in updateProductCardButtons
            window.quizRecommendationsProducts = products.filter(p => p !== null);
            
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
            
            // Store additional products globally for upsell package blocks
            window.quizRecommendationsAdditionalProducts = additionalProducts;
            console.log('Stored additional products for upsell package:', additionalProducts.length, 'products');
            
            // Always show Section 2 with additional products
            additionalProducts.forEach((product) => {
                productStates[product.id] = { removed: false, quantity: 1 };
                const productCard = createProductCard(product, 'additional');
                additionalContainer.appendChild(productCard);
                // NOT auto-added to cart
            });
            
            // Update upsell blocks text with dynamic price and product count if they exist
            const upsellBlocks = document.querySelectorAll('[data-upsell-package-block]');
            if (upsellBlocks.length > 0) {
                upsellBlocks.forEach(block => {
                    updateUpsellPackageBlockText(block);
                });
                
                // Re-initialize upsell blocks now that products are available
                initUpsellPackageBlocks();
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
            // Products without subscriptions won't have radio buttons
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
                if (productStates[product.id]) {
                    productStates[product.id].removed = false;
                }
            } else {
                // Product is not in cart - show add button, hide remove button
                if (addBtn) addBtn.style.display = 'inline-flex';
                if (removeBtn) removeBtn.style.display = 'none';
                card.classList.add('removed');
                if (productStates[product.id]) {
                    productStates[product.id].removed = true;
                }
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

        console.log('Cart updated. Current cart items:', cartItems.length);

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
            // Products without subscriptions won't have radio buttons, so handle that case
            const selectedOption = card.querySelector('input[type="radio"]:checked');
            
            // Determine sellingPlanId based on the selected option
            // For products without subscriptions, selectedOption will be null, so sellingPlanId stays null
            let numericSellingPlanId = null;
            if (selectedOption) {
                if (selectedOption.value === 'subscription') {
                    const sellingPlanId = selectedOption.dataset.sellingPlan;
                    numericSellingPlanId = sellingPlanId ? parseInt(sellingPlanId) : null;
                } else if (selectedOption.value === 'onetime') {
                    numericSellingPlanId = null; // One-time purchases don't have sellingPlanId
                }
            }
            // If selectedOption is null, it means the product has no subscription options,
            // so numericSellingPlanId remains null (one-time purchase only)
            
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
                
                // If add button doesn't exist, create it (for both top-picks and other products)
                if (!addBtn) {
                    const addButton = document.createElement('button');
                    addButton.className = isTopPicks ? 'product-add-btn product-add-btn-corner' : 'product-add-btn product-add-btn-corner';
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
                            // Products without subscriptions won't have radio buttons
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
        const numericSellingPlanId = sellingPlanId ? parseInt(sellingPlanId) : null;

        if (quantity === 0) {
            // Check if the item being removed is an upsell package item
            const itemBeingRemoved = cartItems.find(item => {
                const itemVariantId = parseInt(item.variantId);
                const itemSellingPlanId = item.sellingPlanId ? parseInt(item.sellingPlanId) : null;
                return itemVariantId === numericVariantId && itemSellingPlanId === numericSellingPlanId;
            });
            
            const isUpsellItem = itemBeingRemoved && itemBeingRemoved.isUpsellDiscount;
            
            if (isUpsellItem) {
                // Remove ALL upsell package items when any one is removed
                cartItems = cartItems.filter(item => {
                    // Keep gifts and BOGO items
                    if (item.isGift || item.isBogoFree) return true;
                    // Remove all upsell items
                    return !item.isUpsellDiscount;
                });
            } else {
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
            }
            
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
        const cartItemsContainerPopup = document.querySelector('[data-cart-items-popup]');

        if (!cartItemsContainer) return;

        cartItemsContainer.innerHTML = '';
        
        // Also clear popup cart items container if it exists
        if (cartItemsContainerPopup) {
            cartItemsContainerPopup.innerHTML = '';
        }
        
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
                // For one-time items, check for compare_at_price (product discount)
                const variant = item.product.variants.find(v => v.id === parseInt(item.variantId));
                
                // For upsell items, use compare_at_price as original and regular price as discounted
                // For regular items, also check compare_at_price
                const compareAtPrice = variant && variant.compare_at_price && variant.compare_at_price > variantPrice 
                    ? variant.compare_at_price 
                    : null;
                
                if (compareAtPrice) {
                    // If there's a compare_at_price, use it as original price
                    subtotal += compareAtPrice * item.quantity;
                    totalDiscount += (compareAtPrice - variantPrice) * item.quantity;
                } else {
                    // No compare_at_price, just add regular price to subtotal
                    subtotal += variantPrice * item.quantity;
                }
                
                onetimeItems.push(item);
            }
        });

        // Free products (gifts and BOGO) are not shown in cart items

        // Helper function to render cart items to a container
        const renderCartItemsToContainer = (container) => {
            if (!container) return;
            
            // Check if cart is empty (no items to display)
            const hasItemsToDisplay = subscriptionGroups && Object.keys(subscriptionGroups).length > 0 || onetimeItems.length > 0;
            
            if (!hasItemsToDisplay) {
                // Show empty cart message
                const emptyCartMessage = document.createElement('div');
                emptyCartMessage.className = 'cart-empty-message';
                emptyCartMessage.textContent = 'Your cart is empty';
                container.appendChild(emptyCartMessage);
            } else {
                // Render subscription groups
                Object.keys(subscriptionGroups).forEach(planName => {
                    const group = subscriptionGroups[planName];
                    group.forEach(({ item, price, originalPrice, discount }) => {
                        const itemGroup = document.createElement('div');
                        itemGroup.className = 'cart-item-group';
                        
                        const itemTotal = price * item.quantity;
                        const originalTotal = originalPrice * item.quantity;
                        const hasSubscriptionDiscount = itemTotal < originalTotal;
                        
                        const cartItem = document.createElement('div');
                        cartItem.className = 'cart-item cart-subscription-item';
                        cartItem.dataset.variantId = item.variantId;
                        cartItem.dataset.sellingPlanId = item.sellingPlanId || '';
                        
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
                        
                        const hasCompareAtPrice = variant && variant.compare_at_price && variant.compare_at_price > originalPrice;
                        const compareAtTotal = hasCompareAtPrice ? variant.compare_at_price * item.quantity : null;
                        
                        let priceHTML = '';
                        if (hasCompareAtPrice) {
                            priceHTML = `
                                <div class="cart-item-price">
                                    <span>${formatMoney(itemTotal)}</span>
                                    <span class="cart-item-price-original">${formatMoney(compareAtTotal)}</span>
                                </div>
                            `;
                        } else if (hasSubscriptionDiscount) {
                            priceHTML = `
                                <div class="cart-item-price">
                                    <span>${formatMoney(itemTotal)}</span>
                                    <span class="cart-item-price-original">${formatMoney(originalTotal)}</span>
                                </div>
                            `;
                        } else {
                            priceHTML = `<div class="cart-item-price">${formatMoney(itemTotal)}</div>`;
                        }
                        
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
                        container.appendChild(itemGroup);
                    });
                });
                
                // Render one-time items
                onetimeItems.forEach(item => {
                    let variant;
                    let variantPrice;
                    if (item.product.selectedVariant) {
                        variant = item.product.selectedVariant;
                        variantPrice = variant.price;
                    } else {
                        variant = item.product.variants.find(v => v.id === parseInt(item.variantId));
                        if (!variant) {
                            variant = item.product.variants[0];
                        }
                        variantPrice = variant.price;
                    }
                    const price = variantPrice;
                    
                    const hasCompareAtPrice = variant && variant.compare_at_price && variant.compare_at_price > price;
                    const compareAtTotal = hasCompareAtPrice ? variant.compare_at_price * item.quantity : null;
                    const itemTotal = price * item.quantity;
                    
                    let productName = item.product.title;
                    if (item.product.variants.length > 1 && variant.title !== 'Default Title') {
                        productName += ` - ${variant.title}`;
                    }
                    
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
                    
                    const itemGroup = document.createElement('div');
                    itemGroup.className = 'cart-item-group';
                    
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
                    container.appendChild(itemGroup);
                });
                
                // Add dividers between cart item groups (except after the last one)
                const allGroups = container.querySelectorAll('.cart-item-group');
                allGroups.forEach((group, index) => {
                    if (index < allGroups.length - 1) {
                        if (!group.nextElementSibling || !group.nextElementSibling.classList.contains('cart-item-group-divider')) {
                            const divider = document.createElement('div');
                            divider.className = 'cart-item-group-divider';
                            group.parentNode.insertBefore(divider, group.nextSibling);
                        }
                    }
                });
            }
        };
        
        // Render to main cart container
        renderCartItemsToContainer(cartItemsContainer);
        
        // Render to popup cart container
        renderCartItemsToContainer(cartItemsContainerPopup);
        
        // Check if cart is empty (no items to display)
        const hasItemsToDisplay = subscriptionGroups && Object.keys(subscriptionGroups).length > 0 || onetimeItems.length > 0;

        // Enable/disable checkout button based on cart state
        const checkoutBtns = document.querySelectorAll('[data-checkout-btn], [data-checkout-btn-popup], .quiz-btn-checkout, .mobile-sticky-bar-checkout');
        checkoutBtns.forEach(btn => {
            if (!hasItemsToDisplay) {
                btn.disabled = true;
                btn.classList.add('disabled');
            } else {
                btn.disabled = false;
                btn.classList.remove('disabled');
            }
        });

        // Update totals section (desktop)
        const subtotalEl = document.querySelector('[data-subtotal]');
        const discountRowEl = document.querySelector('[data-discount-row]');
        const discountEl = document.querySelector('[data-discount]');
        const totalOriginalEl = document.querySelector('[data-total-original]');
        const totalCurrentEl = document.querySelector('[data-total-current]');

        // Update totals section (popup)
        const subtotalElPopup = document.querySelector('[data-subtotal-popup]');
        const discountRowElPopup = document.querySelector('[data-discount-row-popup]');
        const discountElPopup = document.querySelector('[data-discount-popup]');
        const totalOriginalElPopup = document.querySelector('[data-total-original-popup]');
        const totalCurrentElPopup = document.querySelector('[data-total-current-popup]');

        const total = subtotal - totalDiscount;
        
        // Update desktop totals
        if (subtotalEl) {
            subtotalEl.innerHTML = formatMoney(subtotal);
        }
        if (totalDiscount > 0) {
            if (discountRowEl) discountRowEl.style.display = 'flex';
            if (discountEl) discountEl.innerHTML = `- ${formatMoney(totalDiscount)}`;
        } else {
            if (discountRowEl) discountRowEl.style.display = 'none';
        }
        if (totalCurrentEl) {
            totalCurrentEl.innerHTML = formatMoney(total);
        }
        if (subtotal > total) {
            if (totalOriginalEl) {
                totalOriginalEl.style.display = 'inline';
                totalOriginalEl.innerHTML = formatMoney(subtotal);
            }
        } else {
            if (totalOriginalEl) {
                totalOriginalEl.style.display = 'none';
            }
        }
        
        // Update popup totals
        if (subtotalElPopup) {
            subtotalElPopup.innerHTML = formatMoney(subtotal);
        }
        if (totalDiscount > 0) {
            if (discountRowElPopup) discountRowElPopup.style.display = 'flex';
            if (discountElPopup) discountElPopup.innerHTML = `- ${formatMoney(totalDiscount)}`;
        } else {
            if (discountRowElPopup) discountRowElPopup.style.display = 'none';
        }
        if (totalCurrentElPopup) {
            totalCurrentElPopup.innerHTML = formatMoney(total);
        }
        if (subtotal > total) {
            if (totalOriginalElPopup) {
                totalOriginalElPopup.style.display = 'inline';
                totalOriginalElPopup.innerHTML = formatMoney(subtotal);
            }
        } else {
            if (totalOriginalElPopup) {
                totalOriginalElPopup.style.display = 'none';
            }
        }

        // Update mobile sticky bar total
        const mobileTotalEl = document.querySelector('[data-mobile-total-current]');
        const mobileTotalOriginalEl = document.querySelector('[data-mobile-total-original]');
        if (mobileTotalEl) {
            mobileTotalEl.innerHTML = formatMoney(total);
        }
        if (subtotal > total) {
            if (mobileTotalOriginalEl) {
                mobileTotalOriginalEl.style.display = 'inline';
                mobileTotalOriginalEl.innerHTML = formatMoney(subtotal);
            }
        } else {
            if (mobileTotalOriginalEl) {
                mobileTotalOriginalEl.style.display = 'none';
            }
        }

        // Add click handlers for cart item remove buttons (both desktop and popup)
        const allRemoveButtons = document.querySelectorAll('[data-cart-remove]');
        allRemoveButtons.forEach(button => {
            // Remove existing listeners by cloning and replacing
            const newButton = button.cloneNode(true);
            button.parentNode.replaceChild(newButton, button);
            
            newButton.addEventListener('click', (e) => {
                e.stopPropagation();
                const cartItemEl = newButton.closest('.cart-item');
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
        
        // Also update popup shipping status
        const shippingStatusPopup = document.getElementById('shipping-status-popup');
        if (shippingStatusPopup) {
            const shippingStatusEl = document.getElementById('shipping-status');
            if (shippingStatusEl) {
                shippingStatusPopup.textContent = shippingStatusEl.textContent;
            }
        }
    }
    
    // Mobile Cart Popup functionality
    function initMobileCartPopup() {
        const openMenuBtn = document.querySelector('.mobile-sticky-bar-open-menu');
        const popup = document.getElementById('mobile-cart-popup');
        const closeBtn = document.querySelector('.mobile-cart-popup-close');
        const overlay = document.querySelector('.mobile-cart-popup-overlay');
        const popupCheckoutBtn = document.querySelector('[data-checkout-btn-popup]');
        
        if (!openMenuBtn || !popup) return;
        
        function openPopup() {
            popup.style.display = 'flex';
            setTimeout(() => {
                popup.classList.add('active');
                openMenuBtn.classList.add('active');
                document.body.style.overflow = 'hidden';
            }, 10);
        }
        
        function closePopup() {
            popup.classList.remove('active');
            openMenuBtn.classList.remove('active');
            setTimeout(() => {
                popup.style.display = 'none';
                document.body.style.overflow = '';
            }, 300);
        }
        
        openMenuBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            openPopup();
        });
        
        if (closeBtn) {
            closeBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                closePopup();
            });
        }
        
        if (overlay) {
            overlay.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                closePopup();
            });
        }
        
        // Handle checkout button in popup
        if (popupCheckoutBtn) {
            popupCheckoutBtn.addEventListener('click', (e) => {
                e.preventDefault();
                checkout();
            });
        }
        
        // Close popup on escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && popup.classList.contains('active')) {
                closePopup();
            }
        });
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
    
    // Initialize mobile cart popup
    initMobileCartPopup();

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

            // Calculate total price using compare_at_price as original and regular price as discounted
            let totalRegularPrice = 0;
            let totalCompareAtPrice = 0;
            products.forEach(product => {
                if (product.variants && product.variants.length > 0) {
                    // Use first available variant, or first variant if none available
                    const variant = product.variants.find(v => v.available) || product.variants[0];
                    if (variant && variant.price) {
                        // Convert price from cents to dollars
                        const priceInDollars = variant.price / 100;
                        totalRegularPrice += priceInDollars;
                        
                        // Use compare_at_price if available, otherwise use regular price
                        if (variant.compare_at_price && variant.compare_at_price > variant.price) {
                            totalCompareAtPrice += variant.compare_at_price / 100;
                        } else {
                            totalCompareAtPrice += priceInDollars;
                        }
                    }
                }
            });

            // Use regular price as the displayed price (discounted price)
            // compare_at_price is used as original price if available
            const discountedPrice = totalRegularPrice;

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

                        // Add products visually to local cartItems array (like other products)
                        const skippedProducts = [];
                        let addedCount = 0;
                        
                        for (const product of products) {
                            if (product && product.variants && product.variants.length > 0) {
                                // Find the first available variant
                                const availableVariant = product.variants.find(v => v.available);
                                
                                if (availableVariant) {
                                    // Check if product already exists in cart
                                    const existingItemIndex = cartItems.findIndex(item =>
                                        parseInt(item.variantId) === availableVariant.id &&
                                        !item.sellingPlanId && // One-time purchase
                                        !item.isGift &&
                                        !item.isBogoFree
                                    );
                                    
                                    if (existingItemIndex !== -1) {
                                        // Update quantity if already exists
                                        cartItems[existingItemIndex].quantity += 1;
                                    } else {
                                        // Add new item with upsell discount flag
                                        cartItems.push({
                                            variantId: availableVariant.id,
                                            quantity: 1,
                                            product: product,
                                            sellingPlanId: null, // One-time purchase
                                            isGift: false,
                                            isBogoFree: false,
                                            isUpsellDiscount: true
                                        });
                                    }
                                    addedCount++;
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

                        if (addedCount === 0) {
                            throw new Error('No available products found to add to cart');
                        }

                        // Log skipped products if any
                        if (skippedProducts.length > 0) {
                            console.log(`Skipped ${skippedProducts.length} unavailable product(s):`, skippedProducts);
                        }

                        console.log(`Added ${addedCount} available product(s) to cart visually`);

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
                initMobileCartPopup();
            }, 100);
        });
    } else {
        setTimeout(() => {
            initRecommendations();
            initUpsellPackageBlocks();
            initMobileCartPopup();
        }, 100);
    }
})();
