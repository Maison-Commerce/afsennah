if (!customElements.get('search-suggestions')) {
  const SearchSuggestions = class extends HTMLElement {
    connectedCallback() {
      this.searchTimeoutID = -1;
      this.searchInput = this.closest('form').querySelector('input[name="q"]');
      this.searchInput.addEventListener('keyup', this.handleInputChange.bind(this));
      this.searchInput.addEventListener('change', this.handleInputChange.bind(this));
    }

    handleInputChange() {
      const valueToSearch = this.searchInput.value;

      if (valueToSearch.length && valueToSearch !== this.oldSearchValue) {
        clearTimeout(this.searchTimeoutID);

        this.searchTimeoutID = setTimeout(() => {
          this.fetchSuggestions(valueToSearch);
        }, 500);
      } else if (!valueToSearch.length) {
        clearTimeout(this.searchTimeoutID);

        if (this.searchSuggestionsAbortController) {
          this.searchSuggestionsAbortController.abort('Existing request not needed');
          this.searchSuggestionsAbortController = null;
        }

        this.innerHTML = '';
      }

      this.oldSearchValue = valueToSearch;
    }

    fetchSuggestions(terms) {
      if (this.searchSuggestionsAbortController) {
        this.searchSuggestionsAbortController.abort('Existing request not needed');
      }
      this.searchSuggestionsAbortController = new AbortController();

      fetch(`${theme.routes.predictiveSearch}?q=${encodeURIComponent(terms)}&section_id=search-suggestions`, {
        signal: this.searchSuggestionsAbortController.signal
      })
        .then((response) => {
          if (!response.ok) {
            throw new Error(response.status);
          }
          return response.text();
        })
        .then((text) => {
          const results = new DOMParser()
            .parseFromString(text, 'text/html')
            .querySelector('.search-suggestions-wrapper');

          this.innerHTML = '';
          this.insertAdjacentElement('beforeend', results.firstElementChild);
        })
        .catch((error) => {
          console.warn(error);
          if (error.code === 20) {
            return; // aborted
          }
          throw error;
        });
    }
  };

  window.customElements.define('search-suggestions', SearchSuggestions);
}
