/**
 * Returns a function, that, when invoked, will only be triggered at most once during
 * a given window of time.
 * @param {Function} fn - Callback function.
 * @param {number} [wait=300] - Time window (in milliseconds).
 * @returns {Function}
 */
function throttle(fn, wait = 300) {
  let throttleTimeoutId = -1;
  let tick = false;

  return () => {
    clearTimeout(throttleTimeoutId);
    throttleTimeoutId = setTimeout(fn, wait);

    if (!tick) {
      fn.call();
      tick = true;
      setTimeout(() => {
        tick = false;
      }, wait);
    }
  };
}

if (!customElements.get('sticky-atc')) {
  customElements.whenDefined('product-form').then(() => {
    class StickyAtc extends customElements.get('product-form') {
      constructor() {
        super();

        this.section = this.closest('.section-main-product');
        this.mainProductForm = this.section.querySelector('.js-product');
        this.buyButtons = this.section.querySelector('buy-buttons');
        this.imageContainer = this.querySelector('.sticky-atc__image');
        this.variantContainer = this.querySelector('.sticky-atc__details__variant');
        this.variantTitle = this.querySelector('.sticky-atc__details__variant__title');
        this.variantTitle?.toggleAttribute('hidden', !this.section.querySelector('variant-picker'));

        this.throttledOnScroll = throttle(StickyAtc.handleScroll.bind(this));
        window.addEventListener('scroll', this.throttledOnScroll);

        this.section.addEventListener('on:variant:change', this.onVariantChange.bind(this));
        this.section.addEventListener('on:media-gallery:change', this.updateImage.bind(this));

        this.updateImage();
      }

      disconnectedCallback() {
        window.removeEventListener('scroll', this.throttledOnScroll);
      }

      /**
       * Handles submission of the product form.
       * @param {object} evt - Event object.
       */
      async handleSubmit(evt) {
        evt.preventDefault();

        const variantId = this.section.querySelector('product-form buy-buttons input[name="id"]').value;
        if (!variantId) {
          const target = this.section.querySelector('#product-info');
          if (target && target.offsetParent) {
            evt.preventDefault();
            theme.scrollToRevealElement(target);
          }
          return;
        }

        // Validate main form
        const customFormValid = this.mainProductForm.validate();
        if (!customFormValid || !this.mainProductForm.form.reportValidity()) {
          evt.preventDefault();
          if (!customFormValid) {
            theme.scrollToRevealElement(this.mainProductForm);
          } else {
            const input = Array.from(this.mainProductForm.form.elements).find(
              (el) => !el.checkValidity()
            );
            setTimeout(() => theme.scrollToRevealElement(input), 100);
          }
          return;
        }

        // Copy data
        this.form.querySelectorAll('[data-copied]').forEach((el) => el.remove());
        const formData = new FormData(this.mainProductForm.form);
        for (const p of formData) {
          if (!this.form.querySelector(`[name="${p[0]}"]`)) {
            const input = document.createElement('input');
            input.name = p[0];
            input.value = p[1];
            input.hidden = true;
            input.setAttribute('data-copied', '');
            this.form.append(input);
          }
        }
        super.handleSubmit(evt);
      }

      /**
       * Determine visibility after scroll.
       */
      static handleScroll() {
        const topOffset = document.querySelector('.pageheader--sticky') ? document.querySelector('.section-header').offsetHeight : 0;
        this.classList.toggle(
          'sticky-atc--out',
          this.buyButtons.getBoundingClientRect().bottom > topOffset
        );

        document.body.classList.toggle(
          'scrolled-to-bottom',
          window.scrollY + window.innerHeight + 100 > document.body.scrollHeight
        );
      }

      /**
       * Handle a change in variant on the page.
       * @param {Event} evt - Variant change event dispatched by variant-picker.
       */
      onVariantChange(evt) {
        const idInput = this.form?.querySelector('[name="id"]');

        if (evt.detail.variant) {
          this.variantTitle.textContent = evt.detail.variant.title;
          this.variantContainer.hidden = false;
          if (idInput) idInput.value = evt.detail.variant.id;
        } else {
          this.variantContainer.hidden = true;
          this.variantTitle.textContent = '';
          if (idInput) idInput.value = '';
        }

        this.updateImage();
        this.updateAddToCartButton(evt.detail.variant);
        this.setErrorMsgState();
      }

      /**
       * Updates the image.
       */
      updateImage() {
        const mainImage = this.section.querySelector('.media-gallery .main-image .slider__item.is-active .product-media img');

        if (mainImage) {
          this.imageContainer.innerHTML = mainImage.outerHTML;
        } else {
          this.imageContainer.textContent = '';
        }
      }

      /**
       * Updates the "Add to Cart" button label and status.
       * @param {object} variant - Current variant object.
       */
      updateAddToCartButton(variant) {
        if (!this.submitBtn) return;

        const variantAvailable = variant && variant.available;
        const unavailableStr = variant
          ? theme.strings.noStock : this.submitBtn.dataset.unavailableText;

        this.submitBtn.textContent = variantAvailable
          ? this.submitBtn.dataset.addToCartText
          : unavailableStr;
      }
    }

    customElements.define('sticky-atc', StickyAtc);
  });
}
