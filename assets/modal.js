const trapFocusHandlers = {};

/**
 * Removes focus trap event listeners and optionally focuses an element.
 * @param {Element} [elementToFocus=null] - Element to focus when trap is removed.
 */
function removeTrapFocus(elementToFocus = null) {
  document.removeEventListener('focusin', trapFocusHandlers.focusin);
  document.removeEventListener('focusout', trapFocusHandlers.focusout);
  document.removeEventListener('keydown', trapFocusHandlers.keydown);

  if (elementToFocus) elementToFocus.focus();
}

/**
 * Traps focus within a container, e.g. modal or side drawer.
 * @param {Element} container - Container element to trap focus within.
 * @param {Element} [elementToFocus=container] - Initial element to focus when trap is applied.
 */
function trapFocus(container, elementToFocus = container) {
  const focusableEls = Array.from(
    container.querySelectorAll('summary, a[href], area[href], button:not([disabled]), input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled]), object, iframe, audio[controls], video[controls], [tabindex]:not([tabindex^="-"])')
  );

  let firstEl = null;
  let lastEl = null;
  const isVisible = (el) => el.offsetParent && getComputedStyle(el).visibility !== 'hidden';

  const setFirstLastEls = () => {
    for (let i = 0; i < focusableEls.length; i += 1) {
      if (isVisible(focusableEls[i])) {
        firstEl = focusableEls[i];
        break;
      }
    }
    for (let i = focusableEls.length - 1; i >= 0; i -= 1) {
      if (isVisible(focusableEls[i])) {
        lastEl = focusableEls[i];
        break;
      }
    }
  };

  removeTrapFocus();

  trapFocusHandlers.focusin = (evt) => {
    setFirstLastEls();

    if (evt.target !== container && evt.target !== lastEl && evt.target !== firstEl) return;
    document.addEventListener('keydown', trapFocusHandlers.keydown);
  };

  trapFocusHandlers.focusout = () => {
    document.removeEventListener('keydown', trapFocusHandlers.keydown);
  };

  trapFocusHandlers.keydown = (evt) => {
    if (evt.code !== 'Tab') return;

    setFirstLastEls();

    // If tab pressed on last focusable element, focus the first element.
    if (evt.target === lastEl && !evt.shiftKey) {
      evt.preventDefault();
      firstEl.focus();
    }

    //  If shift + tab pressed on the first focusable element, focus the last element.
    if ((evt.target === container || evt.target === firstEl) && evt.shiftKey) {
      evt.preventDefault();
      lastEl.focus();
    }
  };

  document.addEventListener('focusout', trapFocusHandlers.focusout);
  document.addEventListener('focusin', trapFocusHandlers.focusin);

  (elementToFocus || container).focus();
}

class Modal extends HTMLElement {
  constructor() {
    super();
    this.addEventListener('click', this.handleClick.bind(this));
  }

  /**
   * Handles 'click' events on the modal.
   * @param {object} evt - Event object.
   */
  handleClick(evt) {
    if (evt.target !== this && !evt.target.matches('.js-close-modal')) return;
    this.close();
  }

  /**
   * Opens the modal.
   * @param {Element} opener - Modal opener element.
   */
  open(opener) {
    this.setAttribute('open', '');
    this.openedBy = opener;

    trapFocus(this);
    window.pauseAllMedia();

    // Add event handler (so the bound event listener can be removed).
    this.keyupHandler = (evt) => evt.key === 'Escape' && this.close();

    // Add event listener (for while modal is open).
    this.addEventListener('keyup', this.keyupHandler);

    // Wrap tables in a '.scrollable-table' element for a better mobile experience.
    this.querySelectorAll('table').forEach((table) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'scrollable-table';
      table.parentNode.insertBefore(wrapper, table);
      wrapper.appendChild(table);
    });
  }

  /**
   * Closes the modal.
   */
  close() {
    this.removeAttribute('open');

    removeTrapFocus(this.openedBy);
    window.pauseAllMedia();

    // Remove event listener added on modal opening.
    this.removeEventListener('keyup', this.keyupHandler);
  }
}

customElements.define('modal-dialog', Modal);
