/**
 * Dependencies:
 * - Custom select component
 *
 * Required translation strings:
 * - addToCart
 * - noStock
 * - noVariant
 * - onlyXLeft
 */

if (!customElements.get('variant-picker')) {
  class VariantPicker extends HTMLElement {
    constructor() {
      super();
      this.section = this.closest('.js-product');
      this.productForm = this.section.querySelector('.js-product-form');
      this.optionSelectors = this.querySelectorAll('.option-selector:not(.option-selector--custom)');
      this.nativeSelector = document.getElementById(`variants-${this.section.dataset.section}`);
      this.data = this.getVariantData();
      this.selectedOptions = this.getSelectedOptions();
      this.variant = this.getSelectedVariant();

      this.updateAvailability();
      this.updateAddToCartButton();
      this.addEventListener('change', this.handleVariantChange.bind(this));
      this.applySearchParams();

      this.setAttribute('loaded', '');
    }

    /**
     * Handles 'change' events on the variant picker element.
     * @param {object} evt - Event object.
     */
    handleVariantChange(evt) {
      // If selection contains a URL for different product
      const productUrl = evt.target.dataset.productUrl || evt.detail?.productUrl;
      if (productUrl) {
        // Check for product change
        const selectedUrl = new URL(productUrl, window.location.origin);
        if (selectedUrl.pathname !== window.location.pathname) {
          // Preserve options
          const params = `option_values=${this.getSelectedOptionIds().join(',')}`;
          const separator = productUrl.includes('?') ? '&' : '?';
          window.location = `${productUrl}${separator}${params}`;
          return;
        }
      }

      this.selectedOptions = this.getSelectedOptions();
      this.variant = this.getSelectedVariant();

      this.preSelection = !this.variant && this.selectedOptions.find((o) => o === null) === null;

      this.updateUrl(evt);
      this.updateVariantInput();
      this.updateAddToCartButton();
      this.updateAvailability();
      this.updatePrice();
      this.updateBackorderText();
      this.updatePickupAvailability();
      this.updateSku();
      this.updateBarcode();
      VariantPicker.updateLabelText(evt);

      this.dispatchEvent(new CustomEvent('on:variant:change', {
        bubbles: true,
        detail: {
          form: this.productForm,
          variant: this.variant,
          allVariants: this.data.variants,
          selectedOptions: this.selectedOptions
        }
      }));
    }

    /**
     * Updates the "Add to Cart" button label and status.
     */
    updateAddToCartButton() {
      if (!this.productForm) return;
      if (this.selectedOptions.indexOf(null) > -1) return;

      this.addBtn = this.addBtn || this.productForm.querySelector('[name="add"]');
      const variantAvailable = this.variant && this.variant.available;
      const unavailableStr = this.variant ? theme.strings.noStock : theme.strings.noVariant;

      this.addBtn.disabled = !variantAvailable;
      this.addBtn.textContent = variantAvailable
        ? this.addBtn.dataset.addToCartText
        : unavailableStr;
    }

    /**
     * Updates the availability status of an option.
     * @param {Element} optionEl - Option element.
     * @param {boolean} exists - Does this option lead to a variant that exists?
     * @param {boolean} available - Does this option lead to a variant that is available to buy?
     */
    static updateOptionAvailability(optionEl, exists, available) {
      const el = optionEl;
      const unavailableText = exists ? theme.strings.noStock : theme.strings.noVariant;
      el.classList.toggle('is-unavailable', !available);
      el.classList.toggle('is-nonexistent', !exists);

      if (optionEl.classList.contains('custom-select__option')) {
        const em = el.querySelector('em');

        if (em) {
          em.hidden = available;
        }

        if (!available) {
          if (em) {
            em.textContent = unavailableText;
          } else {
            el.innerHTML = `${el.innerHTML} <em class="pointer-events-none">${unavailableText}</em>`;
          }
        }
      } else if (!available) {
        el.nextElementSibling.title = unavailableText;
      } else {
        el.nextElementSibling.removeAttribute('title');
      }
    }

    /**
     * Updates the availability status in option selectors.
     */
    updateAvailability() {
      if (this.dataset.availability === 'off') return;

      this.optionSelectors.forEach((selector, selectorIndex) => {
        const options = selector.querySelectorAll('.js-option:not([data-value=""])');
        let optionThatExists = false;
        options.forEach((option) => {
          // Skip combined listings
          if (option.dataset.productUrl) return;

          const optionValue = selector.dataset.selectorType === 'dropdown' ? option.dataset.value : option.value;
          // any available variants with previous options and this one locked in?
          let variantsExist = false;
          let variantsAvailable = false;
          this.data.variants.forEach((v) => {
            let matches = 0;
            for (let i = 0; i < selectorIndex; i += 1) {
              if (v.options[i] === this.selectedOptions[i] || this.selectedOptions[i] === null) {
                matches += 1;
              }
            }
            if (v.options[selectorIndex] === optionValue && matches === selectorIndex) {
              variantsExist = true;
              if (!optionThatExists) {
                optionThatExists = option;
              }
              if (v.available) {
                variantsAvailable = true;
              }
            }
          });
          VariantPicker.updateOptionAvailability(option, variantsExist, variantsAvailable);
        });
        if (this.dataset.availability === 'prune' && optionThatExists && selector.querySelector('.js-option.is-nonexistent:is(:checked, [aria-selected="true"])')) {
          setTimeout(() => {
            if (optionThatExists.closest('custom-select')) {
              optionThatExists.closest('custom-select').selectOption(optionThatExists);
            } else {
              optionThatExists.click();
            }
          }, 0);
        }
      });
    }

    /**
     * Updates the backorder text and visibility.
     */
    updateBackorderText() {
      this.backorder = this.backorder || this.section.querySelector('.backorder');
      if (!this.backorder) return;

      let hideBackorder = true;

      if (this.variant && this.variant.available) {
        const { inventory } = this.data.formatted[this.variant.id];

        if (this.variant.inventory_management && inventory === 'none') {
          const backorderProdEl = this.backorder.querySelector('.backorder__product');
          const prodTitleEl = this.section.querySelector('.product-title');
          const variantTitle = this.variant.title.includes('Default') ? '' : ` - ${this.variant.title}`;

          backorderProdEl.textContent = `${prodTitleEl.textContent}${variantTitle}`;
          hideBackorder = false;
        }
      }

      this.backorder.hidden = hideBackorder;
    }

    /**
     * Updates the colour option label text.
     * @param {object} evt - Event object
     */
    static updateLabelText(evt) {
      const selector = evt.target.closest('.option-selector');
      if (selector.dataset.selectorType === 'dropdown') return;

      const colorText = selector.querySelector('.js-color-text');
      if (!colorText) return;

      colorText.textContent = evt.target.nextElementSibling.querySelector('.js-value').textContent;
    }

    /**
     * Updates the pick up availability.
     */
    updatePickupAvailability() {
      this.pickUpAvailability = this.pickUpAvailability || this.section.querySelector('pickup-availability');
      if (!this.pickUpAvailability) return;

      if (this.variant && this.variant.available) {
        this.pickUpAvailability.getAvailability(this.variant.id);
      } else {
        this.pickUpAvailability.removeAttribute('available');
        this.pickUpAvailability.innerHTML = '';
      }
    }

    /**
     * Updates the price.
     */
    updatePrice() {
      this.price = this.price || this.section.querySelector('.product-info__price .price');
      if (!this.price) return;

      let { variant } = this;
      if (this.preSelection) {
        variant = this.data.variants[0];
        for (let i = 1; i < this.data.variants.length; i += 1) {
          if (this.data.variants[i].price < variant.price) variant = this.data.variants[i];
        }
      }

      if (variant) {
        const priceCurrentEl = this.price.querySelector('.price__current');
        const priceWasEl = this.price.querySelector('.price__was');
        const unitPriceEl = this.price.querySelector('.unit-price');

        // Update price.
        if (variant.compare_at_price > variant.price) {
          priceCurrentEl.querySelector('.js-label').textContent = theme.strings.salePrice;
          priceCurrentEl.querySelector('.js-value').innerHTML = this.data.formatted[variant.id].price;
          priceWasEl.querySelector('.js-label').textContent = theme.strings.regularPrice;
          priceWasEl.querySelector('.js-value').innerHTML = this.data.formatted[variant.id].compareAtPrice || '';
        } else {
          priceCurrentEl.querySelector('.js-label').textContent = theme.strings.regularPrice;
          priceCurrentEl.querySelector('.js-value').innerHTML = this.data.formatted[variant.id].price;
          priceWasEl.querySelector('.js-label').textContent = '';
          priceWasEl.querySelector('.js-value').innerHTML = '';
        }

        // Update unit price, if specified.
        if (variant.unit_price_measurement) {
          const valueEl = this.price.querySelector('.unit-price__price');
          const unitEl = this.price.querySelector('.unit-price__unit');
          const value = variant.unit_price_measurement.reference_value;
          const unit = variant.unit_price_measurement.reference_unit;

          valueEl.innerHTML = this.data.formatted[variant.id].unitPrice;
          unitEl.textContent = value === 1 ? unit : `${value} ${unit}`;
          unitPriceEl.hidden = false;
        } else if (unitPriceEl) {
          unitPriceEl.hidden = true;
        }

        this.price.classList.toggle('price--on-sale', variant.compare_at_price > variant.price);
        this.price.classList.toggle('price--sold-out', !variant.available && !this.preSelection);
      }

      this.price.querySelector('.price__default').hidden = !this.variant && !this.preSelection;
      this.price.querySelector('.price__no-variant').hidden = this.variant || this.preSelection;
      const from = this.price.querySelector('.price__from');
      if (from) {
        from.hidden = !this.preSelection;
      }
    }

    /**
     * Updates the SKU.
     */
    updateSku() {
      this.sku = this.sku || this.section.querySelector('.product-sku__value');
      if (!this.sku) return;

      const skuAvailable = this.variant && this.variant.sku;
      this.sku.textContent = skuAvailable ? this.variant.sku : '';
      this.sku.parentNode.hidden = !skuAvailable;
    }

    /**
     * Updates the Barcode.
     */
    updateBarcode() {
      this.barcode = this.barcode || this.section.querySelector('.product-barcode__value');
      if (!this.barcode) return;

      const barcodeAvailable = this.variant && this.variant.barcode;
      this.barcode.textContent = barcodeAvailable ? this.variant.barcode : '';
      this.barcode.parentNode.hidden = !barcodeAvailable;
    }

    /**
     * Updates the url with the selected variant id.
     * @param {object} evt - Event object.
     */
    updateUrl(evt) {
      if (!evt || evt.type !== 'change' || this.dataset.updateUrl === 'false') return;
      const url = this.variant ? `${this.dataset.url}?variant=${this.variant.id}` : this.dataset.url;
      window.history.replaceState({ }, '', url);
    }

    /**
     * Updates the value of the hidden [name="id"] form inputs.
     */
    updateVariantInput() {
      this.forms = this.forms || this.section.querySelectorAll('.js-product-form, .js-instalments-form');

      this.forms.forEach((form) => {
        const input = form.querySelector('[name="id"]');
        input.value = this.variant ? this.variant.id : '';
        input.dispatchEvent(new Event('change', { bubbles: true }));
      });
    }

    /**
     * Gets the variant data for a product.
     * @returns {?object}
     */
    getVariantData() {
      const dataEl = this.querySelector('[type="application/json"]');
      return JSON.parse(dataEl.textContent);
    }

    /**
     * Get the selected values from a list of variant options.
     * @returns {Array} Array of selected option values, value is null if not selected.
     */
    getSelectedOptions() {
      const selectedOptions = [];

      this.optionSelectors.forEach((selector) => {
        if (selector.dataset.selectorType === 'dropdown') {
          const selected = selector.querySelector('.custom-select__option[aria-selected="true"]');
          selectedOptions.push(selected && selected.dataset.value !== '' ? selected.dataset.value : null);
        } else {
          const selected = selector.querySelector('input:checked');
          selectedOptions.push(selected ? selected.value : null);
        }
      });

      return selectedOptions;
    }

    /**
     * Get the selected option value ids from a list of variant options.
     * @returns {Array} Array of selected option value ids, value is null if not selected.
     */
    getSelectedOptionIds() {
      const selectedOptionIds = [];

      this.optionSelectors.forEach((selector) => {
        if (selector.dataset.selectorType === 'dropdown') {
          const selected = selector.querySelector('.custom-select__option[aria-selected="true"]');
          selectedOptionIds.push(selected && selected.dataset.value !== '' ? selected.dataset.valueId : null);
        } else {
          const selected = selector.querySelector('input:checked');
          selectedOptionIds.push(selected ? selected.dataset.valueId : null);
        }
      });

      return selectedOptionIds;
    }

    /**
     * Get selected variant data.
     * @returns {?object} Variant object, or null if one is not selected.
     */
    getSelectedVariant() {
      return this.data.variants.find(
        (v) => v.options.every((val, index) => val === this.selectedOptions[index])
      );
    }

    /**
     * Apply search parameters.
     */
    applySearchParams() {
      const searchParams = new URLSearchParams(window.location.search);

      Array.from(searchParams.keys()).forEach((key) => {
        const value = searchParams.get(key);
        const optionSelectors = Array.from(this.optionSelectors);
        const matchingOptionSelector = optionSelectors.find((x) => x.dataset.option === key);
        if (!matchingOptionSelector) return;

        if (matchingOptionSelector.dataset.selectorType === 'dropdown') {
          const colorOptionDropdown = matchingOptionSelector.querySelector(`.custom-select__option[data-value="${value}"]`);
          if (colorOptionDropdown) {
            const customSelect = colorOptionDropdown.closest('custom-select');
            customSelect.selectOption(colorOptionDropdown);
          }
        } else {
          const matchingInput = matchingOptionSelector.querySelector(`input[value="${value}"]`);
          if (matchingInput) {
            const matchingOptionValue = matchingOptionSelector.querySelector('.option-selector__label-value');
            if (matchingOptionValue) {
              matchingOptionSelector.querySelector('.option-selector__label-value').textContent = value;
            }
            matchingInput.checked = true;
            matchingInput.dispatchEvent(
              new CustomEvent('change', { bubbles: true, cancelable: false })
            );
          }
        }
      });
    }
  }

  customElements.define('variant-picker', VariantPicker);
}
