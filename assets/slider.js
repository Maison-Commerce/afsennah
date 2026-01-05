/**
 * Returns a function that as long as it continues to be invoked, won't be triggered.
 * @param {Function} fn - Callback function.
 * @param {number} [wait=300] - Delay (in milliseconds).
 * @returns {Function}
 */
function debounce(fn, wait = 300) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), wait);
  };
}

class CarouselSlider extends HTMLElement {
  constructor() {
    super();
    this.slides = [...this.querySelectorAll('.slider__item:not([hidden])')];
    if (this.slides.length < 2) {
      this.setCarouselState(false);
      return;
    }

    window.initLazyScript(this, this.init.bind(this));
  }

  init() {
    this.slider = this.querySelector('.slider');
    this.grid = this.querySelector('.slider__grid');
    this.nav = this.querySelector('.slider-nav');
    this.rtl = document.dir === 'rtl';

    if (this.nav) {
      this.prevBtn = this.querySelector('button[name="prev"]');
      this.nextBtn = this.querySelector('button[name="next"]');
    }

    this.initSlider();
    window.addEventListener('on:debounced-resize', this.handleResize.bind(this));

    this.setAttribute('loaded', '');
  }

  initSlider() {
    this.gridWidth = this.grid.clientWidth;

    // Distance between leading edges of adjacent slides (i.e. width of card + gap).
    this.slideSpan = this.getWindowOffset(this.slides[1]) - this.getWindowOffset(this.slides[0]);

    // Note: Slide can re-initialise after previous use
    this.currentIndex = Math.round(this.slider.scrollLeft / this.slideSpan) || 0;

    // Width of gap between slides.
    this.slideGap = this.slideSpan - this.slides[0].clientWidth;

    this.slidesPerPage = Math.round((this.gridWidth + this.slideGap) / this.slideSpan);
    this.slidesToScroll = theme.settings.sliderItemsPerNav === 'page' ? this.slidesPerPage : 1;
    this.totalPages = this.slides.length - this.slidesPerPage + 1;

    this.setCarouselState(this.totalPages > 1);
    if (this.dataset.dynamicHeight === 'true') {
      this.updateDynamicHeight();
    }
    this.addListeners();

    this.sliderStart = this.getWindowOffset(this.slider);
    if (!this.sliderStart) this.sliderStart = (this.slider.clientWidth - this.gridWidth) / 2;
    this.sliderEnd = this.sliderStart + this.gridWidth;

    if (this.totalPages < 2) return;

    if (window.matchMedia('(pointer: fine)').matches) {
      this.slider.classList.add('is-grabbable');
    }

    if (!this.nav) return;

    this.setButtonStates();
  }

  /**
   * Re-initialise state. Call if slides have changed.
   */
  refresh() {
    if (this.hasAttribute('loaded')) {
      this.removeListeners();
      this.style.removeProperty('--current-slide-height');
    }
    this.slides = [...this.querySelectorAll('.slider__item:not([hidden])')];
    if (this.slides.length < 2) {
      this.setCarouselState(false);
      return;
    }
    this.init();
  }

  addListeners() {
    this.scrollHandler = debounce(this.handleScroll.bind(this), 100);
    this.slider.addEventListener('scroll', this.scrollHandler);

    if (this.nav) {
      this.navClickHandler = this.handleNavClick.bind(this);
      this.nav.addEventListener('click', this.navClickHandler);
    }

    if (window.matchMedia('(pointer: fine)').matches) {
      this.mousedownHandler = this.handleMousedown.bind(this);
      this.mouseupHandler = this.handleMouseup.bind(this);
      this.mousemoveHandler = this.handleMousemove.bind(this);

      this.slider.addEventListener('mousedown', this.mousedownHandler);
      this.slider.addEventListener('mouseup', this.mouseupHandler);
      this.slider.addEventListener('mouseleave', this.mouseupHandler);
      this.slider.addEventListener('mousemove', this.mousemoveHandler);
      this.slider.addEventListener('dragstart', (evt) => { evt.preventDefault(); });
    }
  }

  removeListeners() {
    this.slider.removeEventListener('scroll', this.scrollHandler);

    if (this.nav) {
      this.nav.removeEventListener('click', this.navClickHandler);
    }

    if (window.matchMedia('(pointer: fine)').matches) {
      this.slider.removeEventListener('mousedown', this.mousedownHandler);
      this.slider.removeEventListener('mouseup', this.mouseupHandler);
      this.slider.removeEventListener('mouseleave', this.mouseupHandler);
      this.slider.removeEventListener('mousemove', this.mousemoveHandler);
    }
  }

  /**
   * Handles 'scroll' events on the slider element.
   */
  handleScroll() {
    // Scroll may be triggered immediately after a resize
    if (this.gridWidth !== this.grid.clientWidth) this.handleResize();

    const previousIndex = this.currentIndex;
    this.currentIndex = Math.round(Math.abs(this.slider.scrollLeft) / this.slideSpan);

    if (this.nav) {
      this.setButtonStates();
    }

    if (this.dataset.dynamicHeight === 'true') {
      this.updateDynamicHeight();
    }

    if (this.dataset.dispatchEvents === 'true' && previousIndex !== this.currentIndex) {
      this.dispatchEvent(
        new CustomEvent('on:carousel-slider:select', {
          bubbles: true,
          detail: {
            index: this.currentIndex,
            slide: this.slides[this.currentIndex]
          }
        })
      );
    }
  }

  /**
   * Handles 'mousedown' events on the slider element.
   * @param {object} evt - Event object.
   */
  handleMousedown(evt) {
    this.mousedown = true;
    this.mousemoved = false;
    this.startX = evt.pageX - this.sliderStart;
    this.scrollPos = this.slider.scrollLeft;
    this.slider.classList.add('is-grabbing');
  }

  /**
   * Handles 'mouseup' events on the slider element.
   * @param {object} evt - Event object.
   */
  handleMouseup(evt) {
    this.mousedown = false;
    this.slider.classList.remove('is-grabbing');
    if (this.mousemoved) {
      evt.preventDefault();
      this.slider.classList.remove('is-dragging');
    }
  }

  /**
   * Handles 'mousemove' events on the slider element.
   * @param {object} evt - Event object.
   */
  handleMousemove(evt) {
    if (!this.mousedown) return;
    evt.preventDefault();

    const x = evt.pageX - this.sliderStart;
    this.slider.scrollTo({ left: this.scrollPos - (x - this.startX), behavior: 'instant' });
    this.mousemoved = true;
    this.slider.classList.add('is-dragging');
  }

  /**
   * Handles 'click' events on the nav buttons container.
   * @param {object} evt - Event object.
   */
  handleNavClick(evt) {
    if (!evt.target.matches('.slider-nav__btn')) return;

    if ((evt.target.name === 'next' && !this.rtl) || (evt.target.name === 'prev' && this.rtl)) {
      this.scrollPos = this.slider.scrollLeft + (this.slidesToScroll * this.slideSpan);
    } else {
      this.scrollPos = this.slider.scrollLeft - (this.slidesToScroll * this.slideSpan);
    }

    this.slider.scrollTo({ left: this.scrollPos, behavior: 'smooth' });
  }

  /**
   * Handles 'on:debounced-resize' events on the window.
   */
  handleResize() {
    if (this.nav) this.removeListeners();
    this.initSlider();
  }

  /**
   * Show a specific item inside this slider.
   * @param {Element} el - Slide element
   * @param {string} transition - Transition to pass to behavior parameter of scrollTo (optional)
   */
  scrollToElement(el, transition) {
    if (!this.getSlideVisibility(el)) {
      // this.scrollPos = this.rtl ? (el.offsetLeft + this.slideSpan) : el.offsetLeft;
      this.scrollPos = el.offsetLeft;
      this.slider.scrollTo({ left: this.scrollPos, behavior: transition || 'smooth' });
    }
  }

  /**
   * Sets a height property based on the current slide.
   */
  updateDynamicHeight() {
    this.style.setProperty('--current-slide-height', `${this.slides[this.currentIndex].firstElementChild.clientHeight}px`);
  }

  /**
   * Gets the offset of an element from the edge of the viewport (left for ltr, right for rtl).
   * @param {number} el - Element.
   * @returns {number}
   */
  getWindowOffset(el) {
    return this.rtl
      ? window.innerWidth - el.getBoundingClientRect().right
      : el.getBoundingClientRect().left;
  }

  /**
   * Gets the visible state of a slide.
   * @param {Element} el - Slide element.
   * @returns {boolean}
   */
  getSlideVisibility(el) {
    const slideStart = this.getWindowOffset(el);
    const slideEnd = Math.floor(slideStart + this.slides[0].clientWidth);
    return slideStart >= this.sliderStart && slideEnd <= this.sliderEnd;
  }

  /**
   * Sets the active state of the carousel.
   * @param {boolean} active - Set carousel as active.
   */
  setCarouselState(active) {
    if (active) {
      this.removeAttribute('inactive');

      // If slider width changed when activated, reinitialise it.
      if (this.gridWidth !== this.grid.clientWidth) {
        this.handleBreakpointChange();
      }
    } else {
      this.setAttribute('inactive', '');
    }
  }

  /**
   * Sets the disabled state of the nav buttons.
   */
  setButtonStates() {
    this.prevBtn.disabled = this.getSlideVisibility(this.slides[0]) && this.slider.scrollLeft === 0;
    this.nextBtn.disabled = this.getSlideVisibility(this.slides[this.slides.length - 1]);
  }
}

customElements.define('carousel-slider', CarouselSlider);
