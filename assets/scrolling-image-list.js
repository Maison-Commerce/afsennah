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

if (!customElements.get('scrolling-image-list')) {
  class ScrollingImageList extends HTMLElement {
    constructor() {
      super();
      window.initLazyScript(this, this.init.bind(this));
    }

    init() {
      this.images = this.querySelectorAll('.scrolling-image-list__image');

      // Interactive elements are only required if there is more than one image
      if (this.images.length > 1) {
        this.contentColumn = this.querySelector('.scrolling-image-list__content-column');
        this.featureText = this.querySelector('.scrolling-image-list__content-column .feature-text-paired');
        this.slider = this.querySelector('.slider');

        const mq = window.matchMedia('(min-width: 768px)');
        this.addListeners(mq);
        mq.addEventListener('change', (event) => {
          this.removeListeners();
          this.addListeners(event);
        });
      }
      this.setAttribute('loaded', '');
    }

    /**
     * Add event listeners for this element.
     * @param {MediaQueryList|MediaQueryListEvent} mq - MediaQuery object determining flip between
     * carousel & scroll modes.
     */
    addListeners(mq) {
      if (mq.matches) {
        // DESKTOP: Horizontal scroll on the slider element
        this.throttledHandleScroll = throttle(this.handleHorizontalScroll.bind(this), 100);
        this.slider.addEventListener('scroll', this.throttledHandleScroll);

        // Run initial scroll handler
        this.throttledHandleScroll();

        // Click handlers for content items
        this.contentClickListeners = [];
        this.querySelectorAll('.scrolling-image-list__content:not(.scrolling-image-list__content--mobile)').forEach((el) => {
          const oc = () => this.scrollToImageHorizontal(el.dataset.index);
          this.contentClickListeners.push({ el, oc });
          el.addEventListener('click', oc);
        });

        // Navigation buttons
        this.addNavigationButtons();

        // Make slider draggable
        this.makeDraggable();

        // Keyboard tabbing
        this.delegatedKeydownHandler = theme.addDelegateEventListener(
            this,
            'keydown',
            '.scrolling-image-list__image, .scrolling-image-list__content:not(.scrolling-image-list__content--mobile), .scrolling-image-list__content:not(.scrolling-image-list__content--mobile) a',
            this.handleKeydown.bind(this)
        );
      } else {
        // MOBILE: Use carousel
        this.addEventListener('on:carousel-slider:select', this.handleSliderSelect.bind(this));
      }
    }

    removeListeners() {
      if (this.slider && this.throttledHandleScroll) {
        this.slider.removeEventListener('scroll', this.throttledHandleScroll);
      }
      if (this.contentClickListeners) {
        for (let i = 0; i < this.contentClickListeners.length; i += 1) {
          this.contentClickListeners[i].el.removeEventListener('click', this.contentClickListeners[i].oc);
        }
      }
      if (this.delegatedKeydownHandler) {
        this.removeEventListener('keydown', this.delegatedKeydownHandler);
      }
      if (this.prevBtn) {
        this.prevBtn.removeEventListener('click', this.handlePrevClick);
      }
      if (this.nextBtn) {
        this.nextBtn.removeEventListener('click', this.handleNextClick);
      }
      this.removeDraggable();
    }

    /**
     * Add navigation buttons for desktop
     */
    addNavigationButtons() {
      // Check if buttons already exist
      if (this.querySelector('.scrolling-image-list-nav')) return;

      // Create navigation container
      const navContainer = document.createElement('div');
      navContainer.className = 'scrolling-image-list-nav desktop-only';

      // Create previous button
      this.prevBtn = document.createElement('button');
      this.prevBtn.className = 'scrolling-image-list-nav__btn scrolling-image-list-nav__btn--prev';
      this.prevBtn.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>`;
      this.prevBtn.setAttribute('aria-label', 'Previous');

      // Create next button
      this.nextBtn = document.createElement('button');
      this.nextBtn.className = 'scrolling-image-list-nav__btn scrolling-image-list-nav__btn--next';
      this.nextBtn.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>`;
      this.nextBtn.setAttribute('aria-label', 'Next');

      navContainer.appendChild(this.prevBtn);
      navContainer.appendChild(this.nextBtn);

      // Insert before the slider
      this.slider.parentNode.insertBefore(navContainer, this.slider);

      // Add event listeners
      this.handlePrevClick = () => this.navigatePrev();
      this.handleNextClick = () => this.navigateNext();

      this.prevBtn.addEventListener('click', this.handlePrevClick);
      this.nextBtn.addEventListener('click', this.handleNextClick);

      // Update button states
      this.updateNavigationButtons();
    }

    /**
     * Update navigation button states
     */
    updateNavigationButtons() {
      if (!this.prevBtn || !this.nextBtn) return;

      const currentIndex = parseInt(this.dataset.currentIndex || '1');
      const totalImages = this.images.length;

      // Disable prev button on first image
      if (currentIndex === 1) {
        this.prevBtn.setAttribute('disabled', '');
      } else {
        this.prevBtn.removeAttribute('disabled');
      }

      // Disable next button on last image
      if (currentIndex === totalImages) {
        this.nextBtn.setAttribute('disabled', '');
      } else {
        this.nextBtn.removeAttribute('disabled');
      }
    }

    /**
     * Navigate to previous image
     */
    navigatePrev() {
      const currentIndex = parseInt(this.dataset.currentIndex || '1');
      if (currentIndex > 1) {
        this.scrollToImageHorizontal(currentIndex - 1);
      }
    }

    /**
     * Navigate to next image
     */
    navigateNext() {
      const currentIndex = parseInt(this.dataset.currentIndex || '1');
      if (currentIndex < this.images.length) {
        this.scrollToImageHorizontal(currentIndex + 1);
      }
    }

    /**
     * Make slider draggable with mouse
     */
    makeDraggable() {
      let isDown = false;
      let startX;
      let scrollLeft;

      this.mouseDownHandler = (e) => {
        isDown = true;
        this.slider.classList.add('is-grabbing');
        startX = e.pageX - this.slider.offsetLeft;
        scrollLeft = this.slider.scrollLeft;
      };

      this.mouseLeaveHandler = () => {
        isDown = false;
        this.slider.classList.remove('is-grabbing');
      };

      this.mouseUpHandler = () => {
        isDown = false;
        this.slider.classList.remove('is-grabbing');
      };

      this.mouseMoveHandler = (e) => {
        if (!isDown) return;
        e.preventDefault();
        const x = e.pageX - this.slider.offsetLeft;
        const walk = (x - startX) * 2; // Scroll speed multiplier
        this.slider.scrollLeft = scrollLeft - walk;
      };

      this.slider.addEventListener('mousedown', this.mouseDownHandler);
      this.slider.addEventListener('mouseleave', this.mouseLeaveHandler);
      this.slider.addEventListener('mouseup', this.mouseUpHandler);
      this.slider.addEventListener('mousemove', this.mouseMoveHandler);

      // Add cursor styles
      this.slider.classList.add('is-grabbable');
    }

    /**
     * Remove draggable functionality
     */
    removeDraggable() {
      if (this.mouseDownHandler) {
        this.slider.removeEventListener('mousedown', this.mouseDownHandler);
        this.slider.removeEventListener('mouseleave', this.mouseLeaveHandler);
        this.slider.removeEventListener('mouseup', this.mouseUpHandler);
        this.slider.removeEventListener('mousemove', this.mouseMoveHandler);
        this.slider.classList.remove('is-grabbable', 'is-grabbing');
      }
    }

    /**
     * Handles throttled horizontal scroll events on the slider.
     */
    handleHorizontalScroll() {
      let closestIndex = 1;
      let closestDistance = Number.MAX_VALUE;

      this.images.forEach((el, index) => {
        const distance = this.distanceFromHorizontalCenter(el);
        if (distance < closestDistance) {
          closestIndex = index + 1;
          closestDistance = distance;
        }
      });

      this.dataset.currentIndex = closestIndex;
      this.updateNavigationButtons();
    }

    /**
     * Determine distance between center of element and center of horizontal viewport.
     * @param {Element} el - Element to check
     * @returns {number}
     */
    distanceFromHorizontalCenter(el) {
      const sliderRect = this.slider.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      const sliderCenterX = sliderRect.left + sliderRect.width / 2;
      const elCenterX = elRect.left + elRect.width / 2;
      return Math.abs(sliderCenterX - elCenterX);
    }

    /**
     * Handles keydown on a selection of elements to aid with tabbing.
     * @param {Event} evt - Keydown event to handle.
     * @param {Element} el - Element this event was triggered on.
     */
    handleKeydown(evt, el) {
      if (evt.code !== 'Tab') return;

      if (el.classList.contains('scrolling-image-list__image')) {
        if (!evt.shiftKey) {
          evt.preventDefault();
          this.querySelector(`.scrolling-image-list__content:not(.scrolling-image-list__content--mobile)[data-index="${el.dataset.index}"]`).focus();
          return;
        }

        if (el.dataset.index !== '1') {
          evt.preventDefault();
          this.querySelector(`.scrolling-image-list__image[data-index="${parseInt(el.dataset.index, 10) - 1}"]`).focus();
          return;
        }

        return;
      }

      if (el.classList.contains('scrolling-image-list__content')) {
        if (evt.shiftKey) {
          evt.preventDefault();
          this.querySelector(`.scrolling-image-list__image[data-index="${el.dataset.index}"]`).focus();
          return;
        }

        if (el.nextElementSibling !== null) {
          evt.preventDefault();
          if (el.querySelector('a')) {
            el.querySelector('a').focus();
          } else {
            this.querySelector(`.scrolling-image-list__image[data-index="${parseInt(el.dataset.index, 10) + 1}"]`).focus();
          }
          return;
        }

        return;
      }

      if (el.tagName === 'A') {
        const contentContainer = el.closest('.scrolling-image-list__content');
        if (contentContainer.nextElementSibling !== null) {
          const lastA = [...contentContainer.querySelectorAll('a')].pop();

          if (lastA === el && !evt.shiftKey) {
            evt.preventDefault();
            this.querySelector(`.scrolling-image-list__image[data-index="${parseInt(contentContainer.dataset.index, 10) + 1}"]`).focus();
          }
        }
      }
    }

    /**
     * Handles mobile carousel select event.
     * @param {object} evt - Slider event.
     */
    handleSliderSelect(evt) {
      this.dataset.currentIndex = evt.detail.index + 1;
    }

    /**
     * Scroll horizontally to place a specific image in the center.
     * @param {number} index - Index of image to scroll to
     */
    scrollToImageHorizontal(index) {
      const image = this.images[index - 1];
      const sliderRect = this.slider.getBoundingClientRect();
      const imageRect = image.getBoundingClientRect();

      const scrollLeft = this.slider.scrollLeft + imageRect.left - sliderRect.left - (sliderRect.width - imageRect.width) / 2;

      this.slider.scrollTo({
        left: scrollLeft,
        behavior: 'smooth'
      });
    }
  }

  customElements.define('scrolling-image-list', ScrollingImageList);
}