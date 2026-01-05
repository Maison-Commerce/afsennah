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

if (!customElements.get('faq-header')) {
  const FaqHeader = class extends HTMLElement {
    connectedCallback() {
      this.classNames = {
        questionContainerInactive: 'faq-search-item-inactive',
        sectionWithIndexStatus: 'section-faq-header--with-index'
      };

      this.searchInput = this.querySelector('.faq-search__input');
      if (this.searchInput) {
        this.searchInput.addEventListener('change', this.performSearch.bind(this));
        this.searchInput.addEventListener('keyup', this.performSearch.bind(this));
        this.searchInput.addEventListener('paste', this.performSearch.bind(this));
      }

      this.debouncedBuildIndex = debounce(this.buildIndex.bind(this), 50);
      document.addEventListener('theme:faq-header-update', this.debouncedBuildIndex);
      this.debouncedBuildIndex();

      if (this.querySelector('.faq-index')) {
        this.addEventListener('click', FaqHeader.handleIndexClick.bind(this));
        this.closest('.section-faq-header').classList.add(this.classNames.sectionWithIndexStatus);
        this.resizeIndex.call(this);
        this.debouncedResizeIndex = debounce(this.resizeIndex.bind(this), 250);
        window.addEventListener('resize', this.debouncedResizeIndex);
      }
    }

    disconnectedCallback() {
      document.removeEventListener('theme:faq-header-update', this.debouncedBuildIndex);
      window.removeEventListener('resize', this.debouncedResizeIndex);
    }

    buildIndex() {
      const faqHeaderSection = this.closest('.section-faq-header');
      const indexContainer = this.querySelector('.faq-index__item-container');

      if (indexContainer) {
        indexContainer.querySelectorAll('.faq-index-item').forEach((el) => {
          el.parentNode.removeChild(el);
        });
      }

      this.linkedCollapsibleTabs = [];
      this.linkedQuestionContainers = [];
      this.linkedContent = [];

      let currentElement = faqHeaderSection;
      while (currentElement.nextElementSibling && currentElement.nextElementSibling.classList.contains('section-collapsible-tabs')) {
        currentElement = currentElement.nextElementSibling;

        // build list of searchable content
        this.linkedCollapsibleTabs.push(currentElement);
        currentElement.querySelectorAll('.collapsible-tabs__tab').forEach((el) => this.linkedQuestionContainers.push(el));
        currentElement.querySelectorAll('.collapsible-tabs__content').forEach((el) => this.linkedContent.push(el));

        // build index UI
        if (indexContainer) {
          const currentElementHeading = currentElement.querySelector('.collapsible-tabs__heading');
          if (currentElementHeading) {
            const html = `
              <div class="faq-index-item">
                <a class="faq-index-item__link"></a>
              </div>`;
            const htmlFragment = document.createRange().createContextualFragment(html);
            const link = htmlFragment.querySelector('.faq-index-item__link');
            link.href = `#${currentElementHeading.id}`;
            link.innerHTML = currentElementHeading.innerHTML;
            indexContainer.appendChild(htmlFragment);
          }
        }
      }

      if (indexContainer) {
        this.resizeIndex.call(this);
      }
    }

    resizeIndex() {
      const stickyContainer = this.querySelector('.faq-index__sticky-container');
      const faqHeaderSection = this.closest('.section-faq-header');

      let currentElement = faqHeaderSection;
      while (currentElement.nextElementSibling && currentElement.nextElementSibling.classList.contains('section-collapsible-tabs')) {
        currentElement = currentElement.nextElementSibling;
      }

      const stickyContainerRect = stickyContainer.getBoundingClientRect();
      const currentElementRect = currentElement.getBoundingClientRect();

      stickyContainer.style.height = `${currentElementRect.bottom - stickyContainerRect.top}px`;
    }

    performSearch() {
      // defer to avoid input lag
      setTimeout(() => {
        const splitValue = this.searchInput.value.split(' ');

        // sanitise terms
        const terms = [];
        splitValue.forEach((t) => {
          if (t.length > 0) {
            terms.push(t.toLowerCase());
          }
        });

        // search
        this.linkedQuestionContainers.forEach((el) => {
          if (terms.length) {
            let termFound = false;
            const matchContent = el.textContent.toLowerCase();
            terms.forEach((term) => {
              if (matchContent.indexOf(term) >= 0) {
                termFound = true;
              }
            });
            if (termFound) {
              el.classList.remove(this.classNames.questionContainerInactive);
            } else {
              el.classList.add(this.classNames.questionContainerInactive);
            }
          } else {
            el.classList.remove(this.classNames.questionContainerInactive);
          }
        });

        // hide non-question content if doing a search
        this.linkedContent.forEach((el) => {
          if (terms.length) {
            el.classList.add(this.classNames.questionContainerInactive);
          } else {
            el.classList.remove(this.classNames.questionContainerInactive);
          }
        });
      }, 10);
    }

    static handleIndexClick(evt) {
      if (evt.target.classList.contains('faq-index-item__link')) {
        evt.preventDefault();
        const id = evt.target.href.split('#')[1];
        const scrollTarget = document.getElementById(id);
        let scrollTargetY = scrollTarget.getBoundingClientRect().top + window.pageYOffset - 50;

        // sticky header offset
        const stickyHeight = getComputedStyle(document.documentElement).getPropertyValue('--theme-sticky-header-height');
        if (stickyHeight) {
          scrollTargetY -= parseInt(stickyHeight, 10);
        }

        window.scrollTo({
          top: scrollTargetY,
          behavior: 'smooth'
        });
      }
    }
  };

  window.customElements.define('faq-header', FaqHeader);
}
