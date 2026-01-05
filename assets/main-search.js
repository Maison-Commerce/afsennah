const MainSearch = class extends HTMLElement {
  constructor() {
    super();

    // Clicking close button
    this.querySelectorAll('.main-search__close').forEach((el) => {
      el.addEventListener('click', (evt) => {
        evt.preventDefault();
        document.body.classList.remove('show-search');
      });
    });

    // Pressing escape key
    this.querySelector('.main-search__input').addEventListener('keyup', (evt) => {
      if (evt.key === 'Escape') {
        this.querySelector('.main-search__close').dispatchEvent(new Event('click'));
      }
    });

    // Search as you type
    if (this.dataset.quickSearch === 'true') {
      this.initQuickSearch();
    }
  }

  initQuickSearch() {
    const searchInput = this.querySelector('.main-search__input');
    const searchTimeoutThrottle = 500;
    const resultLimit = 8;
    const includeMeta = this.dataset.quickSearchMeta === 'true';
    let searchTimeoutID = -1;
    let searchAbortController = null;

    const handleInputChange = () => {
      const resultsBox = this.querySelector('.main-search__results');
      const valueToSearch = searchInput.value;

      // Only search if search string longer than 2, and it has changed
      if (valueToSearch.length && valueToSearch !== this.oldSearchValue) {
        // Save previous value
        this.oldSearchValue = valueToSearch;

        // Kill outstanding ajax request
        if (searchAbortController !== null) {
          searchAbortController.abort('Existing request not needed');
          searchAbortController = null;
        }

        // Kill previous search
        clearTimeout(searchTimeoutID);

        // Create URL for full search results
        const form = searchInput.closest('form');
        const linkURL = new URL(form.action);
        const formParams = new URLSearchParams(new FormData(form));
        formParams.forEach((value, key) => { linkURL.searchParams.set(key, value); });

        // Show loading
        this.classList.remove('main-search--has-results', 'main-search--results-on-multiple-lines', 'main-search--no-results');
        this.classList.add('main-search--loading');
        if (!this.querySelector('.main-search__results-spinner')) {
          resultsBox.innerHTML = '<div class="main-search__results-spinner"><div class="loading-spinner"></div></div>';
        }

        // Do next search (in X milliseconds)
        searchTimeoutID = setTimeout(() => {
          searchAbortController = new AbortController();
          let ajaxUrl;

          if (theme.Shopify.features.predictiveSearch) {
            // use the API
            ajaxUrl = new URL(theme.routes.base + theme.routes.predictiveSearch);
            ajaxUrl.searchParams.set('q', valueToSearch);
            ajaxUrl.searchParams.set('section_id', 'predictive-search');
            ajaxUrl.searchParams.set('resources[limit]', resultLimit);
            ajaxUrl.searchParams.set('resources[options][fields]', includeMeta ? 'title,product_type,variants.title,vendor,tag,variants.sku' : 'title,product_type,variants.title,vendor');
          } else {
            // use the theme template fallback
            ajaxUrl = new URL(linkURL);
            ajaxUrl.searchParams.set('section_id', 'main-search');
          }

          fetch(ajaxUrl, { method: 'get', signal: searchAbortController.signal })
            .then((response) => {
              if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
              }
              return response.text();
            })
            .then((response) => {
              const template = document.createElement('template');
              template.innerHTML = response;
              let resultsList = null;
              if (theme.Shopify.features.predictiveSearch) {
                resultsList = template.content.querySelector('.product-grid');
              } else {
                resultsList = template.content.querySelector('.section-search-template .product-grid');
              }

              // reset previous contents
              searchAbortController = null;
              this.classList.remove('main-search--has-results', 'main-search--results-on-multiple-lines', 'main-search--no-results');
              resultsBox.innerHTML = '';

              const resultsProducts = document.createElement('div');
              resultsProducts.className = 'main-search__results__products collection-listing';
              resultsProducts.innerHTML = '<div></div>';
              const resultsPages = document.createElement('div');
              resultsPages.className = 'main-search__results__pages';

              resultsProducts.firstElementChild.className = resultsList.className;

              // Convert standard blocks into quick search result format
              resultsList.querySelectorAll('.product-block:not(.collection-block):not(.page-block)').forEach((block, index) => {
                if (index <= resultLimit) {
                  block.classList.add('main-search-result');
                  block.querySelectorAll('.btn.quickbuy-toggle').forEach((el) => el.remove());
                  block.querySelectorAll('.quickbuy-toggle').forEach((el) => el.classList.remove('quickbuy-toggle'));
                  resultsProducts.firstElementChild.appendChild(block);
                }
              });

              resultsList.querySelectorAll('.product-block.page-block').forEach((block) => {
                const item = document.createElement('a');
                item.className = 'main-search-result main-search-result--page';
                item.href = block.querySelector('a').href;
                item.innerHTML = '<div class="main-search-result__text"></div>';
                item.firstElementChild.innerText = block.querySelector('.page-block__title').innerText;
                resultsPages.appendChild(item);
              });

              this.classList.remove('main-search--loading');

              const areProducts = !!resultsProducts.querySelector('.main-search-result');
              const arePages = !!resultsPages.querySelector('.main-search-result');
              if (areProducts || arePages) {
                // Numerous results
                this.classList.add('main-search--has-results');
                this.classList.toggle('main-search--results-on-multiple-lines', resultsProducts.querySelectorAll('.product-block').length > 4);
                if (areProducts) {
                  resultsBox.appendChild(resultsProducts);
                }
                if (arePages) {
                  const heading = document.createElement('h6');
                  heading.className = 'main-search-result__heading';
                  heading.innerHTML = theme.strings.generalSearchPages;
                  resultsPages.insertAdjacentElement('afterbegin', heading);
                  resultsBox.appendChild(resultsPages);
                }

                const allLink = document.createElement('a');
                allLink.className = 'main-search__results-all-link btn btn--secondary';
                allLink.href = linkURL;
                allLink.innerHTML = theme.strings.generalSearchViewAll;
                resultsBox.appendChild(allLink);
              } else {
                // No results - show nothing
                this.classList.add('main-search--no-results');
                const emptyMessage = document.createElement('div');
                emptyMessage.className = 'main-search__empty-message';
                emptyMessage.innerHTML = theme.strings.generalSearchNoResultsWithoutTerms;
                resultsBox.appendChild(emptyMessage);
              }
            })
            .catch((error) => {
              console.warn(error);
            });
        }, searchTimeoutThrottle);
      } else if (!valueToSearch.length) {
        // Abandon current search
        this.oldSearchValue = valueToSearch;
        if (searchAbortController !== null) {
          searchAbortController.abort('Existing request not needed');
          searchAbortController = null;
        }
        clearTimeout(searchTimeoutID);

        // Clear results
        this.classList.remove('main-search--has-results', 'main-search--results-on-multiple-lines', 'main-search--loading');
        resultsBox.innerHTML = '';
      }
    };

    searchInput.addEventListener('keyup', handleInputChange.bind(this));
    searchInput.addEventListener('change', handleInputChange.bind(this));
  }
};

window.customElements.define('main-search', MainSearch);
