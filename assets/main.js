/**
 * Adds an observer to initialise a script when an element is scrolled into view.
 * @param {Element} element - Element to observe.
 * @param {Function} callback - Function to call when element is scrolled into view.
 * @param {number} [threshold=500] - Distance from viewport (in pixels) to trigger init.
 */
function initLazyScript(element, callback, threshold = 500) {
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries, observer) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          if (typeof callback === 'function') {
            callback();
            observer.unobserve(entry.target);
          }
        }
      });
    }, { rootMargin: `0px 0px ${threshold}px 0px` });

    io.observe(element);
  } else {
    callback();
  }
}

theme.stickyHeaderHeight = () => {
  const v = getComputedStyle(document.documentElement).getPropertyValue('--theme-sticky-header-height');
  if (v) {
    return parseInt(v, 10) || 0;
  }
  return 0;
};

theme.getOffsetTopFromDoc = (el) => el.getBoundingClientRect().top + window.scrollY;

theme.getOffsetLeftFromDoc = (el) => el.getBoundingClientRect().left + window.scrollX;

theme.getScrollParent = (node) => {
  const isElement = node instanceof HTMLElement;
  const overflowY = isElement && window.getComputedStyle(node).overflowY;
  const isScrollable = overflowY !== 'visible' && overflowY !== 'hidden';

  if (!node) {
    return null;
  }

  if (isScrollable && node.scrollHeight > node.clientHeight) {
    return node;
  }

  return theme.getScrollParent(node.parentNode) || document.scrollingElement || window;
};

theme.scrollToRevealElement = (el) => {
  const scrollContainer = theme.getScrollParent(el);
  const scrollTop = scrollContainer === window ? window.scrollY : scrollContainer.scrollTop;
  const scrollVisibleHeight = scrollContainer === window
    ? window.innerHeight : scrollContainer.clientHeight;
  const elTop = theme.getOffsetTopFromDoc(el);
  const elBot = elTop + el.offsetHeight;
  const inViewTop = scrollTop + theme.stickyHeaderHeight();
  const inViewBot = scrollTop + scrollVisibleHeight - 50;

  if (elTop < inViewTop || elBot > inViewBot) {
    scrollContainer.scrollTo({
      top: elTop - 100 - theme.stickyHeaderHeight(),
      left: 0,
      behavior: 'smooth'
    });
  }
};

theme.getEmptyOptionSelectors = (formContainer) => {
  const emptySections = [];

  formContainer.querySelectorAll('[data-selector-type="dropdown"].option-selector').forEach((el) => {
    if (!el.querySelector('[aria-selected="true"][data-value]:not([data-value=""])')) {
      emptySections.push(el);
    }
  });

  formContainer.querySelectorAll('[data-selector-type="listed"].option-selector').forEach((el) => {
    if (!el.querySelector('input:checked')) {
      emptySections.push(el);
    }
  });

  return emptySections;
};

theme.suffixIds = (container, prefix) => {
  const suffixCandidates = ['id', 'for', 'aria-describedby', 'aria-controls'];
  for (let i = 0; i < suffixCandidates.length; i += 1) {
    container.querySelectorAll(`[${suffixCandidates[i]}]`).forEach((el) => el.setAttribute(suffixCandidates[i], el.getAttribute(suffixCandidates[i]) + prefix));
  }
};

theme.addDelegateEventListener = (
  element,
  eventName,
  selector,
  callback,
  addEventListenerParams = null
) => {
  const cb = (evt) => {
    const el = evt.target.closest(selector);
    if (!el) return;
    if (!element.contains(el)) return;
    callback.call(el, evt, el);
  };
  element.addEventListener(eventName, cb, addEventListenerParams);
  return cb;
};

theme.hideAndRemove = (el) => {
  // disable
  el.querySelectorAll('input').forEach((input) => { input.disabled = true; });

  // wrap
  const wrapper = document.createElement('div');
  wrapper.className = 'merge-remove-wrapper';
  el.parentNode.insertBefore(wrapper, el);
  wrapper.appendChild(el);
  el.classList.add('merge-remove-item');
  wrapper.style.height = `${wrapper.clientHeight}px`;

  const cs = getComputedStyle(el);
  const fadeDuration = parseFloat(cs.getPropertyValue('--fade-duration')) * 1000;
  const slideDuration = parseFloat(cs.getPropertyValue('--slide-duration')) * 1000;

  setTimeout(() => {
    wrapper.classList.add('merge-remove-wrapper--fade');

    setTimeout(() => {
      wrapper.classList.add('merge-remove-wrapper--slide');

      setTimeout(() => wrapper.remove(), slideDuration);
    }, fadeDuration);
  }, 10);
};

theme.insertAndReveal = (el, target, iaeCmd, delay) => {
  const initialDelay = delay || 10;
  el.classList.add('merge-add-wrapper');
  target.insertAdjacentElement(iaeCmd, el);
  el.style.height = `${el.firstElementChild.clientHeight}px`;

  const cs = getComputedStyle(el);
  const fadeDuration = parseFloat(cs.getPropertyValue('--fade-duration')) * 1000;
  const slideDuration = parseFloat(cs.getPropertyValue('--slide-duration')) * 1000;

  setTimeout(() => {
    el.classList.add('merge-add-wrapper--slide');

    setTimeout(() => {
      el.classList.add('merge-add-wrapper--fade');

      setTimeout(() => {
        // tidy up
        el.style.height = '';
        el.classList.remove('merge-add-wrapper', 'merge-add-wrapper--slide', 'merge-add-wrapper--fade');
      }, fadeDuration);
    }, slideDuration);
  }, initialDelay);
};

theme.mergeNodes = (newContent, targetContainer) => {
  try {
    // merge: replace content if changed
    newContent.querySelectorAll('[data-merge]').forEach((newEl) => {
      const targetEl = targetContainer.querySelector(`[data-merge="${newEl.dataset.merge}"]`);
      if (!newEl.dataset.mergeCache
        || !targetEl.dataset.mergeCache
        || newEl.dataset.mergeCache !== targetEl.dataset.mergeCache) {
        targetEl.innerHTML = newEl.innerHTML;
        if (newEl.dataset.mergeCache || targetEl.dataset.mergeCache) {
          targetEl.dataset.mergeCache = newEl.dataset.mergeCache;
        }
      }
    });
    // merge: attributes only
    newContent.querySelectorAll('[data-merge-attributes]').forEach((newEl) => {
      const targetEl = targetContainer.querySelector(`[data-merge-attributes="${newEl.dataset.mergeAttributes}"]`);
      const newElAttributeNames = newEl.getAttributeNames();
      for (let i = 0; i < newElAttributeNames.length; i += 1) {
        const attributeName = newElAttributeNames[i];
        targetEl.setAttribute(attributeName, newEl.getAttribute(attributeName));
      }
    });
    // merge: insert/remove/replace in list
    newContent.querySelectorAll('[data-merge-list]').forEach((newList) => {
      const targetList = targetContainer.querySelector(`[data-merge-list="${newList.dataset.mergeList}"]`);
      let targetListItems = Array.from(targetList.querySelectorAll('[data-merge-list-item]'));
      const newListItems = Array.from(newList.querySelectorAll('[data-merge-list-item]'));

      // remove
      targetListItems.forEach((targetListItem) => {
        // eslint-disable-next-line max-len
        const matchedItem = newListItems.find((item) => item.dataset.mergeListItem === targetListItem.dataset.mergeListItem);
        if (!matchedItem) {
          theme.hideAndRemove(targetListItem);
        }
      });

      // rebuild target list excluding removed items
      targetListItems = Array.from(targetList.querySelectorAll('[data-merge-list-item]:not(.merge-remove-item)'));

      for (let i = 0; i < newListItems.length; i += 1) {
        const newListItem = newListItems[i];
        // eslint-disable-next-line max-len
        const matchedItem = targetListItems.find((item) => item.dataset.mergeListItem === newListItem.dataset.mergeListItem);
        if (matchedItem) {
          // replace if changed
          if (!newListItem.dataset.mergeCache
            || !matchedItem.dataset.mergeCache
            || newListItem.dataset.mergeCache !== matchedItem.dataset.mergeCache) {
            matchedItem.innerHTML = newListItem.innerHTML;
            if (newListItem.dataset.mergeCache) {
              matchedItem.dataset.mergeCache = newListItem.dataset.mergeCache;
            }
          }
        } else {
          // add
          if (i === 0) {
            // first place
            theme.insertAndReveal(newListItem, targetList, 'afterbegin', 500);
          } else if (i >= targetListItems.length) {
            // at end
            theme.insertAndReveal(newListItem, targetList, 'beforeend', 500);
          } else {
            // before element currently at that index
            theme.insertAndReveal(newListItem, targetListItems[i], 'beforebegin', 500);
          }
          // update target list
          targetListItems.splice(i, 0, newListItem);
        }
      }
    });
  } catch (ex) {
    window.location.reload();
  }
};

// Show a short-lived text popup above an element
theme.showQuickPopup = (message, origin) => {
  const offsetLeft = theme.getOffsetLeftFromDoc(origin);
  const offsetTop = theme.getOffsetTopFromDoc(origin);
  const originLeft = origin.getBoundingClientRect().left;
  const popup = document.createElement('div');
  popup.className = 'simple-popup simple-popup--hidden';
  popup.innerHTML = message;
  popup.style.left = `${offsetLeft}px`;
  popup.style.top = `${offsetTop}px`;

  document.body.appendChild(popup);

  let marginLeft = -(popup.clientWidth - origin.clientWidth) / 2;
  if ((originLeft + marginLeft) < 0) {
    // Pull it away from the left edge of the screen
    marginLeft -= (originLeft + marginLeft) - 2;
  }
  // Pull from right edge + small gap
  const offsetRight = offsetLeft + marginLeft + popup.clientWidth + 5;
  if (offsetRight > window.innerWidth) {
    marginLeft -= (offsetRight - window.innerWidth);
  }
  popup.style.marginTop = -popup.clientHeight - 10;
  popup.style.marginLeft = marginLeft;
  setTimeout(() => {
    popup.classList.remove('simple-popup--hidden');
  }, 10);
  setTimeout(() => {
    popup.classList.add('simple-popup--hidden');
  }, 3500);
  setTimeout(() => {
    popup.remove();
  }, 4000);
};

theme.manuallyLoadImages = (container) => {
  container.querySelectorAll('img[data-manual-src]').forEach((el) => {
    el.src = el.dataset.manualSrc;
    el.removeAttribute('data-manual-src');
    if (el.dataset.manualSrcset) {
      el.srcset = el.dataset.manualSrcset;
      el.removeAttribute('data-manual-srcset');
    }
  });
};

theme.whenComponentLoaded = (component, callback) => {
  const components = Symbol.iterator in Object(component) ? [...component] : [component];
  if (!components.find((c) => !c.hasAttribute('loaded'))) {
    callback();
    return;
  }
  const onMutation = (mutationList, observer) => {
    for (let i = 0; i < mutationList.length; i += 1) {
      const mutation = mutationList[i];
      if (mutation.type === 'attributes') {
        if (!components.find((c) => !c.hasAttribute('loaded'))) {
          observer.disconnect();
          callback.call();
        }
      }
    }
  };
  const observer = new MutationObserver(onMutation);
  components.forEach((c) => observer.observe(c, { attributes: true, attributeFilter: ['loaded'] }));
};

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

window.addEventListener(
  'resize',
  debounce(() => {
    window.dispatchEvent(new CustomEvent('on:debounced-resize'));
  })
);

/**
 * Creates a 'mediaMatches' object from the media queries specified in the theme,
 * and adds listeners for each media query. If a breakpoint is crossed, the mediaMatches
 * values are updated and a 'on:breakpoint-change' event is dispatched.
 */
(() => {
  const { mediaQueries } = theme;
  if (!mediaQueries) return;

  const mqKeys = Object.keys(mediaQueries);
  const mqLists = {};
  theme.mediaMatches = {};

  /**
   * Handles a media query (breakpoint) change.
   */
  const handleMqChange = () => {
    const newMatches = mqKeys.reduce((acc, media) => {
      acc[media] = !!(mqLists[media] && mqLists[media].matches);
      return acc;
    }, {});

    // Update mediaMatches values after breakpoint change.
    Object.keys(newMatches).forEach((key) => {
      theme.mediaMatches[key] = newMatches[key];
    });

    window.dispatchEvent(new CustomEvent('on:breakpoint-change'));
  };

  mqKeys.forEach((mq) => {
    // Create mqList object for each media query.
    mqLists[mq] = window.matchMedia(mediaQueries[mq]);

    // Get initial matches for each query.
    theme.mediaMatches[mq] = mqLists[mq].matches;

    // Add an event listener to each query.
    try {
      mqLists[mq].addEventListener('change', handleMqChange);
    } catch (err1) {
      // Fallback for legacy browsers (Safari < 14).
      mqLists[mq].addListener(handleMqChange);
    }
  });
})();

/**
 * Sets a 'viewport-height' custom property on the root element.
 */
function setViewportHeight() {
  document.documentElement.style.setProperty('--viewport-height', `${window.innerHeight}px`);
}

/**
 * Sets a 'header-height' custom property on the root element.
 */
function setHeaderHeight() {
  const header = document.querySelector('.js-header-height');
  if (!header) return;
  let height = header.offsetHeight;

  // Add announcement bar height (if shown).
  const announcement = document.querySelector('.cc-announcement');
  const announcementHeight = announcement ? announcement.offsetHeight : 0;
  height += announcementHeight;

  document.documentElement.style.setProperty('--announcement-height', `${announcementHeight}px`);
  document.documentElement.style.setProperty('--header-height', `${height}px`);
}

/**
 * Sets a 'scrollbar-width' custom property on the root element.
 */
function setScrollbarWidth() {
  document.documentElement.style.setProperty(
    '--scrollbar-width',
    `${window.innerWidth - document.documentElement.clientWidth}px`
  );
}

/**
 * Sets the dimension variables.
 */
function setDimensionVariables() {
  setViewportHeight();
  setHeaderHeight();
  setScrollbarWidth();
}

// Set the dimension variables once the DOM is loaded
document.addEventListener('DOMContentLoaded', setDimensionVariables);

// Update the dimension variables if viewport resized.
window.addEventListener('resize', debounce(setDimensionVariables, 400));

// iOS alters screen width without resize event, if unexpectedly wide content is found
setTimeout(setViewportHeight, 3000);

/**
 * Pauses all media (videos/models) within an element.
 * @param {Element} [el=document] - Element to pause media within.
 */
function pauseAllMedia(el = document) {
  el.querySelectorAll('.js-youtube, .js-vimeo, video').forEach((video) => {
    const component = video.closest('video-component');
    if (component && component.dataset.background === 'true') return;

    if (video.matches('.js-youtube')) {
      video.contentWindow.postMessage('{ "event": "command", "func": "pauseVideo", "args": "" }', '*');
    } else if (video.matches('.js-vimeo')) {
      video.contentWindow.postMessage('{ "method": "pause" }', '*');
    } else {
      video.pause();
    }
  });

  el.querySelectorAll('product-model').forEach((model) => {
    if (model.modelViewerUI) model.modelViewerUI.pause();
  });
}

class DeferredMedia extends HTMLElement {
  constructor() {
    super();

    const loadBtn = this.querySelector('.js-load-media');
    if (loadBtn) {
      loadBtn.addEventListener('click', this.loadContent.bind(this));
    } else {
      this.addObserver();
    }
  }

  /**
   * Adds an Intersection Observer to load the content when viewport scroll is near
   */
  addObserver() {
    if ('IntersectionObserver' in window === false) return;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          this.loadContent(false, false, 'observer');
          observer.unobserve(this);
        }
      });
    }, { rootMargin: '0px 0px 1000px 0px' });

    observer.observe(this);
  }

  /**
   * Loads the deferred media.
   * @param {boolean} [focus=true] - Focus the deferred media element after loading.
   * @param {boolean} [pause=true] - Whether to pause all media after loading.
   * @param {string} [loadTrigger='click'] - The action that caused the deferred content to load.
   */
  loadContent(focus = true, pause = true, loadTrigger = 'click') {
    if (pause) pauseAllMedia();
    if (this.getAttribute('loaded') !== null) return;

    this.loadTrigger = loadTrigger;
    const content = this.querySelector('template').content.firstElementChild.cloneNode(true);
    this.appendChild(content);
    this.setAttribute('loaded', '');

    const deferredEl = this.querySelector('video, model-viewer, iframe');
    if (deferredEl && focus) deferredEl.focus();
  }
}

customElements.define('deferred-media', DeferredMedia);

class DetailsDisclosure extends HTMLElement {
  constructor() {
    super();
    this.disclosure = this.querySelector('details');
    this.toggle = this.querySelector('summary');
    this.panel = this.toggle.nextElementSibling;
    this.init();
  }

  init() {
    // Check if the content element has a CSS transition.
    if (window.getComputedStyle(this.panel).transitionDuration !== '0s') {
      this.toggle.addEventListener('click', this.handleToggle.bind(this));
      this.disclosure.addEventListener('transitionend', this.handleTransitionEnd.bind(this));
    }
  }

  /**
   * Handles 'click' events on the summary element.
   * @param {object} evt - Event object.
   */
  handleToggle(evt) {
    evt.preventDefault();

    if (!this.disclosure.open) {
      this.open();
    } else {
      this.close();
    }
  }

  /**
   * Handles 'transitionend' events on the details element.
   * @param {object} evt - Event object.
   */
  handleTransitionEnd(evt) {
    if (evt.target !== this.panel) return;

    if (this.disclosure.classList.contains('is-closing')) {
      this.disclosure.classList.remove('is-closing');
      this.disclosure.open = false;
    }

    this.panel.removeAttribute('style');
  }

  /**
   * Adds inline 'height' style to the content element, to trigger open transition.
   */
  addContentHeight() {
    this.panel.style.height = `${this.panel.scrollHeight}px`;
  }

  /**
   * Opens the details element.
   */
  open() {
    // Set content 'height' to zero before opening the details element.
    this.panel.style.height = '0';

    // Open the details element
    this.disclosure.open = true;

    // Set content 'height' to its scroll height, to enable CSS transition.
    this.addContentHeight();
  }

  /**
   * Closes the details element.
   */
  close() {
    // Set content height to its scroll height, to enable transition to zero.
    this.addContentHeight();

    // Add class to enable styling of content or toggle icon before or during close transition.
    this.disclosure.classList.add('is-closing');

    // Set content height to zero to trigger the transition.
    // Slight delay required to allow scroll height to be applied before changing to '0'.
    setTimeout(() => {
      this.panel.style.height = '0';
    });
  }
}

customElements.define('details-disclosure', DetailsDisclosure);

if (!customElements.get('gift-card-recipient')) {
  class GiftCardRecipient extends HTMLElement {
    connectedCallback() {
      this.recipientEmail = this.querySelector('[name="properties[Recipient email]"]');
      this.recipientEmailLabel = this.querySelector(`label[for="${this.recipientEmail.id}"]`);
      this.recipientName = this.querySelector('[name="properties[Recipient name]"]');
      this.recipientMessage = this.querySelector('[name="properties[Message]"]');
      this.recipientSendOn = this.querySelector('[name="properties[Send on]"]');
      this.recipientOffsetProperty = this.querySelector('[name="properties[__shopify_offset]"]');

      // When JS is enabled, the recipient email field is required.
      // Input labels are changed to reflect this.
      if (this.recipientEmailLabel && this.recipientEmailLabel.dataset.jsLabel) {
        this.recipientEmailLabel.innerText = this.recipientEmailLabel.dataset.jsLabel;
      }

      // Set the timezone offset property input and enable it
      if (this.recipientOffsetProperty) {
        this.recipientOffsetProperty.value = new Date().getTimezoneOffset().toString();
        this.recipientOffsetProperty.removeAttribute('disabled');
      }

      this.recipientCheckbox = this.querySelector('.gift-card-recipient__checkbox');
      this.recipientCheckbox.addEventListener('change', () => this.synchronizeProperties());
      this.synchronizeProperties();
    }

    synchronizeProperties() {
      if (this.recipientCheckbox.checked) {
        this.recipientEmail.setAttribute('required', '');
        this.recipientEmail.removeAttribute('disabled');
        this.recipientName.removeAttribute('disabled');
        this.recipientMessage.removeAttribute('disabled');
        this.recipientSendOn.removeAttribute('disabled');
        if (this.recipientOffsetProperty) {
          this.recipientOffsetProperty.removeAttribute('disabled');
        }
      } else {
        this.recipientEmail.removeAttribute('required');
        this.recipientEmail.setAttribute('disabled', '');
        this.recipientName.setAttribute('disabled', '');
        this.recipientMessage.setAttribute('disabled', '');
        this.recipientSendOn.setAttribute('disabled', '');
        if (this.recipientOffsetProperty) {
          this.recipientOffsetProperty.setAttribute('disabled', '');
        }
      }
    }
  }

  customElements.define('gift-card-recipient', GiftCardRecipient);
}

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

class ModalOpener extends HTMLElement {
  constructor() {
    super();

    const button = this.querySelector('button');
    if (!button) return;

    button.addEventListener('click', () => {
      const modal = document.getElementById(this.dataset.modal);
      if (modal) modal.open(button);
    });
  }
}

customElements.define('modal-opener', ModalOpener);

class SideDrawer extends HTMLElement {
  constructor() {
    super();
    this.overlay = document.querySelector('.js-overlay');
  }

  /**
   * Handles a 'click' event on the drawer.
   * @param {object} evt - Event object.
   */
  handleClick(evt) {
    if (evt.target.matches('.js-close-drawer') || evt.target === this.overlay) {
      this.close();
    }
  }

  /**
   * Opens the drawer.
   * @param {Element} [opener] - Element that triggered opening of the drawer.
   * @param {Element} [elementToFocus] - Element to focus after drawer opened.
   * @param {Function} [callback] - Callback function to trigger after the open has completed
   */
  open(opener, elementToFocus, callback) {
    this.dispatchEvent(new CustomEvent(`on:${this.dataset.name}:before-open`, {
      bubbles: true
    }));

    this.overlay.classList.add('is-visible');
    this.setAttribute('open', '');
    this.setAttribute('aria-hidden', 'false');
    this.opener = opener;

    trapFocus(this, elementToFocus);

    // Create event handler variables (so the bound event listeners can be removed).
    this.clickHandler = this.clickHandler || this.handleClick.bind(this);
    this.keyupHandler = (evt) => {
      if (evt.key !== 'Escape' || evt.target.closest('.cart-drawer-popup')) return;
      this.close();
    };

    // Add event listeners (for while drawer is open).
    this.addEventListener('click', this.clickHandler);
    this.addEventListener('keyup', this.keyupHandler);
    this.overlay.addEventListener('click', this.clickHandler);

    // Handle events after the drawer opens
    const transitionDuration = parseFloat(getComputedStyle(this).getPropertyValue('--longest-transition-in-ms'));
    setTimeout(() => {
      if (callback) callback();
      this.dispatchEvent(new CustomEvent(`on:${this.dataset.name}:after-open`, {
        bubbles: true
      }));
    }, transitionDuration);
  }

  /**
   * Closes the drawer.
   * @param {Function} [callback] - Call back function to trigger after the close has completed
   */
  close(callback) {
    this.dispatchEvent(new CustomEvent(`on:${this.dataset.name}:before-close`, {
      bubbles: true
    }));

    this.removeAttribute('open');
    this.setAttribute('aria-hidden', 'true');
    this.overlay.classList.remove('is-visible');

    removeTrapFocus(this.opener);

    // Remove event listeners added on drawer opening.
    this.removeEventListener('click', this.clickHandler);
    this.removeEventListener('keyup', this.keyupHandler);
    this.overlay.removeEventListener('click', this.clickHandler);

    // Handle events after the drawer closes
    const transitionDuration = parseFloat(getComputedStyle(this).getPropertyValue('--longest-transition-in-ms'));
    setTimeout(() => {
      if (callback) callback();
      this.dispatchEvent(new CustomEvent(`on:${this.dataset.name}:after-close`, {
        bubbles: true
      }));
    }, transitionDuration);
  }
}

customElements.define('side-drawer', SideDrawer);

class BuyButtons extends HTMLElement {
  constructor() {
    super();
    window.initLazyScript(this, this.initLazySection.bind(this));
  }

  initLazySection() {
    this.dynamicPaymentButtonTemplate = this.querySelector('.dynamic-payment-button-template');

    if (this.dynamicPaymentButtonTemplate) {
      this.variantIdInput = this.querySelector('[name="id"]');

      if (this.variantIdInput.value) {
        this.tryInitDynamicPaymentButton();
      } else {
        this.boundTryInitDynamicPaymentButtonOnChange = this.tryInitDynamicPaymentButton.bind(this);
        this.variantIdInput.addEventListener('change', this.boundTryInitDynamicPaymentButtonOnChange);
      }
    }
  }

  /**
   * Initialise dynamic payment button, if variant exists
   */
  tryInitDynamicPaymentButton() {
    if (this.variantIdInput.value) {
      if (this.boundTryInitDynamicPaymentButtonOnChange) {
        this.variantIdInput.removeEventListener('change', this.boundTryInitDynamicPaymentButtonOnChange);
      }

      this.dynamicPaymentButtonTemplate.insertAdjacentHTML('afterend', this.dynamicPaymentButtonTemplate.innerHTML);
      this.dynamicPaymentButtonTemplate.remove();

      if (Shopify.PaymentButton) {
        Shopify.PaymentButton.init();
      }
    }
  }
}

customElements.define('buy-buttons', BuyButtons);

const CartForm = class extends HTMLElement {
  connectedCallback() {
    this.enableAjaxUpdate = this.dataset.ajaxUpdate;

    if (this.enableAjaxUpdate) {
      this.sectionId = this.dataset.sectionId;
      this.boundRefresh = this.refresh.bind(this);
      document.addEventListener('on:cart:change', this.boundRefresh);

      theme.addDelegateEventListener(this, 'click', '.cart-item__remove', (evt) => {
        evt.preventDefault();
        this.adjustItemQuantity(evt.target.closest('.cart-item'), { to: 0 });
      });

      theme.addDelegateEventListener(this, 'click', '.quantity-down', (evt) => {
        evt.preventDefault();
        this.adjustItemQuantity(evt.target.closest('.cart-item'), { decrease: true });
      });

      theme.addDelegateEventListener(this, 'click', '.quantity-up', (evt) => {
        evt.preventDefault();
        this.adjustItemQuantity(evt.target.closest('.cart-item'), { increase: true });
      });

      theme.addDelegateEventListener(this, 'change', '.cart-item__quantity-input', (evt) => {
        this.adjustItemQuantity(evt.target.closest('.cart-item'), { currentValue: true });
      });
    }
  }

  disconnectedCallback() {
    if (this.enableAjaxUpdate) {
      document.removeEventListener('on:cart:change', this.boundRefresh);
    }
  }

  refresh() {
    this.classList.add('cart-form--refreshing');
    fetch(`${window.Shopify.routes.root}?section_id=${this.sectionId}`)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
        return response.text();
      })
      .then((response) => {
        this.refreshFromHtml(response);
      });
  }

  refreshFromHtml(html) {
    const frag = document.createDocumentFragment();
    const newContent = document.createElement('div');
    frag.appendChild(newContent);
    newContent.innerHTML = html;

    newContent.querySelectorAll('[data-cc-animate]').forEach((el) => el.removeAttribute('data-cc-animate'));

    theme.mergeNodes(newContent, this);

    this.classList.remove('cart-form--refreshing');
    this.querySelectorAll('.merge-item-refreshing').forEach((el) => el.classList.remove('merge-item-refreshing'));

    this.dispatchEvent(
      new CustomEvent('on:cart:after-merge', { bubbles: true, cancelable: false })
    );

    if (theme.settings.afterAddToCart === 'drawer' && this.closest('.drawer') && !this.closest('.drawer').hasAttribute('open')) {
      document.dispatchEvent(
        new CustomEvent('theme:open-cart-drawer', { bubbles: true, cancelable: false })
      );
    }
  }

  adjustItemQuantity(item, change) {
    const quantityInput = item.querySelector('.cart-item__quantity-input');

    let newQuantity = parseInt(quantityInput.value, 10);
    if (typeof change.to !== 'undefined') {
      newQuantity = change.to;
      quantityInput.value = newQuantity;
    } else if (change.increase) {
      newQuantity += quantityInput.step || 1;
      quantityInput.value = newQuantity;
    } else if (change.decrease) {
      newQuantity -= quantityInput.step || 1;
      quantityInput.value = newQuantity;
    } else if (change.currentValue) ;

    if (quantityInput.max && parseInt(quantityInput.value, 10) > parseInt(quantityInput.max, 10)) {
      newQuantity = quantityInput.max;
      quantityInput.value = newQuantity;
      theme.showQuickPopup(theme.strings.cartItemsQuantityError.replace('[QUANTITY]', quantityInput.max), quantityInput);
    }

    clearTimeout(this.adjustItemQuantityTimeout);
    this.adjustItemQuantityTimeout = setTimeout(() => {
      const updateParam = { updates: {} };
      this.querySelectorAll('.cart-item__quantity-input:not([disabled])').forEach((el) => {
        updateParam.updates[el.dataset.key] = el.value;
        if (el.value !== el.dataset.initialValue) {
          el.closest('[data-merge-list-item]').classList.add('merge-item-refreshing');
        }
      });
      fetch(theme.routes.cartUpdate, {
        method: 'POST',
        body: JSON.stringify(updateParam),
        headers: {
          'Content-Type': 'application/json'
        }
      })
        .then((response) => {
          if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
          }
          document.dispatchEvent(
            new CustomEvent('on:cart:change', { bubbles: true, cancelable: false })
          );
        })
        .catch((error) => {
          // eslint-disable-next-line no-console
          console.log(error.message);
          this.dispatchEvent(new CustomEvent('on:cart:error', {
            bubbles: true,
            detail: {
              error: error.message
            }
          }));
          // Uncertainty... Reload page.
          window.location.reload();
        });
    }, newQuantity === 0 ? 10 : 700);
  }
};

window.customElements.define('cart-form', CartForm);

const CCCartCrossSell = class extends HTMLElement {
  init() {
    this.productList = this.querySelector('.product-grid');

    if (this.dataset.from) {
      fetch(this.dataset.from)
        .then((response) => {
          if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
          }
          return response.text();
        })
        .then((response) => {
          const frag = document.createDocumentFragment();
          const newContent = document.createElement('div');
          frag.appendChild(newContent);
          newContent.innerHTML = response;

          const pl = newContent.querySelector('.product-grid');
          if (pl) {
            this.productList.innerHTML = pl.innerHTML;
            this.querySelectorAll('carousel-slider').forEach((el) => el.refresh());
          } else {
            this.classList.add('hidden');
          }
        });
    }
  }
};

window.customElements.define('cc-cart-cross-sell', CCCartCrossSell);

const CCFetchedContent = class extends HTMLElement {
  connectedCallback() {
    fetch(this.dataset.url)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
        return response.text();
      })
      .then((response) => {
        const frag = document.createDocumentFragment();
        const fetchedContent = document.createElement('div');
        frag.appendChild(fetchedContent);
        fetchedContent.innerHTML = response;

        const replacementContent = fetchedContent.querySelector(`[data-id="${this.dataset.id}"]`);
        if (replacementContent) {
          this.innerHTML = replacementContent.innerHTML;
        }
      });
  }
};

window.customElements.define('cc-fetched-content', CCFetchedContent);

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

const FilterContainer = class extends HTMLElement {
  constructor() {
    super();
    this.section = this.closest('.shopify-section');
    this.filters = this.querySelector('.filters');

    const utilityBar = document.querySelector('.utility-bar');
    if (utilityBar) {
      // duplicate utility bar for mobile
      this.utilBarClone = utilityBar.cloneNode(true);
      this.utilBarClone.classList.add('utility-bar--sticky-mobile-copy');
      this.utilBarClone.removeAttribute('data-ajax-container');
      utilityBar.insertAdjacentElement('afterend', this.utilBarClone);
      // ensure ids are unique
      theme.suffixIds(this.utilBarClone, 'dupe');

      this.previousScrollTop = window.scrollY;
      this.throttledCheckStickyScroll = throttle(this.checkStickyScroll.bind(this), 200);
    }

    if (this.filters) {
      // auto-select availability
      this.allowAutoApplyHideUnavailable = this.filters.dataset.autoApplyHideUnavailable === 'true';
      if (this.allowAutoApplyHideUnavailable) {
        theme.addDelegateEventListener(this, 'change', '.filter-group__checkbox, .cc-price-range__input', (evt, delEl) => {
          if (this.allowAutoApplyHideUnavailable) {
            if ((delEl.type === 'checkbox' && delEl.checked) || (delEl.type === 'text' && delEl.value)) {
              const toEnable = this.filters.querySelector('[name="filter.v.availability"][value="1"]');
              if (toEnable) {
                toEnable.checked = true;
                toEnable.dispatchEvent(
                  new CustomEvent('change', { bubbles: true, cancelable: false })
                );
              }
            }
          }
        });

        theme.addDelegateEventListener(this, 'change', '.filter-group--availability .filter-toggle__input', (evt, delEl) => {
          if (delEl.checked && delEl.value === '1') {
            this.allowAutoApplyHideUnavailable = false;
          }
        });
      }

      // ajax filter
      if (this.dataset.ajaxFiltering === 'true') {
        // ajax load form submission
        const debouncedAjaxLoadForm = debounce(this.ajaxLoadForm.bind(this), 700);
        theme.addDelegateEventListener(this, 'change', '#CollectionFilterForm', debouncedAjaxLoadForm);
        theme.addDelegateEventListener(this, 'submit', '#CollectionFilterForm', debouncedAjaxLoadForm);
      } else {
        theme.addDelegateEventListener(this, 'change', '#CollectionFilterForm', (_evt, delEl) => delEl.submit());
      }

      // init things that may need re-initialising on ajax load
      this.initFiltersEtc();
    }

    // ajax sort, filter, and pagination
    if (this.dataset.ajaxFiltering === 'true') {
      // ajax load on link click
      theme.addDelegateEventListener(this.section, 'click', '.link-dropdown__link, .filter-group__applied-item, .filter-group__clear-link, .pagination a', (evt, delEl) => {
        evt.preventDefault();
        this.ajaxLoadUrl(delEl.href);
      });
    }
  }

  connectedCallback() {
    // scroll
    if (this.throttledCheckStickyScroll) {
      window.addEventListener('scroll', this.throttledCheckStickyScroll);
    }

    // back button
    if (this.dataset.ajaxFiltering === 'true') {
      this.boundAjaxPopState = this.ajaxPopState.bind(this);
      window.addEventListener('popstate', this.boundAjaxPopState);
    }

    // layout switch
    if (this.section.querySelector('.layout-switchers')) {
      this.boundSwitchGridLayout = theme.addDelegateEventListener(this.section, 'click', '.layout-switch', this.switchGridLayout.bind(this));
    }

    // show/hide filters
    this.delegatedToggleFiltersCallback = theme.addDelegateEventListener(this.section, 'click', '[data-toggle-filters]', (evt) => {
      evt.preventDefault();
      this.classList.toggle('filter-container--show-filters-desktop');
      this.classList.toggle('filter-container--show-filters-mobile');
      const isNowVisible = this.classList.contains('filter-container--show-filters-desktop');
      this.section.querySelectorAll('.toggle-btn[data-toggle-filters]').forEach((el) => {
        el.classList.toggle('toggle-btn--revealed-desktop', isNowVisible);
      });
    });
  }

  disconnectedCallback() {
    if (this.boundCheckStickyScroll) {
      window.removeEventListener('scroll', this.throttledCheckStickyScroll);
    }

    if (this.boundAjaxPopState) {
      window.removeEventListener('popstate', this.boundAjaxPopState);
    }
  }

  initFiltersEtc() {
    this.classList.add('filter-container--mobile-initialised');

    // append query vars onto sort urls (e.g. filters, vendor collection)
    if (window.location.href.indexOf('?') >= 0) {
      document.querySelectorAll('#sort-dropdown-options .link-dropdown__link').forEach((el) => {
        const queryTerms = window.location.href.split('?')[1].split('&');
        let newHref = el.href;
        queryTerms.forEach((term) => {
          if (term.indexOf('sort_by=') === -1) {
            newHref += `&${term}`;
          }
        });
        el.href = newHref;
      });
    }
  }

  switchGridLayout(evt) {
    evt.preventDefault();
    if (evt.target.classList.contains('layout-switch--one-column')) {
      this.querySelectorAll('.product-grid').forEach((el) => {
        el.classList.remove('product-grid--per-row-mob-2');
        el.classList.add('product-grid--per-row-mob-1');
      });
    } else {
      this.querySelectorAll('.product-grid').forEach((el) => {
        el.classList.remove('product-grid--per-row-mob-1');
        el.classList.add('product-grid--per-row-mob-2');
      });
    }
    evt.target.classList.add('layout-switch--active');
    (evt.target.nextElementSibling || evt.target.previousElementSibling).classList.remove('layout-switch--active');
  }

  checkStickyScroll() {
    const utilityBarOffsetY = theme.getOffsetTopFromDoc(this.section.querySelector('.utility-bar'));
    if (window.innerWidth < 768
        && this.previousScrollTop > window.scrollY
        && window.scrollY > utilityBarOffsetY) {
      document.body.classList.add('utility-bar-sticky-mobile-copy-reveal');
    } else {
      document.body.classList.remove('utility-bar-sticky-mobile-copy-reveal');
    }
    this.previousScrollTop = window.scrollY;
  }

  ajaxLoadForm(evt) {
    if (evt.type === 'submit') {
      evt.preventDefault();
    }
    const queryVals = [];
    this.filters.querySelectorAll('input, select').forEach((input) => {
      if (
        ((input.type !== 'checkbox' && input.type !== 'radio') || input.checked) // is an active input value
        && input.value !== '' // has a value
      ) {
        queryVals.push([input.name, encodeURIComponent(input.value)]);
      }
    });
    // new url
    let newUrl = window.location.pathname;
    queryVals.forEach((value) => {
      newUrl += `&${value[0]}=${value[1]}`;
    });
    newUrl = newUrl.replace('&', '?');
    // load
    this.ajaxLoadUrl.call(this, newUrl);
  }

  ajaxPopState() {
    this.ajaxLoadUrl.call(this, document.location.href, true);
  }

  ajaxLoadUrl(url, noPushState) {
    if (!noPushState) {
      // update url history
      let fullUrl = url;
      if (fullUrl.slice(0, 1) === '/') {
        fullUrl = `${window.location.protocol}//${window.location.host}${fullUrl}`;
      }
      window.history.pushState({ path: fullUrl }, '', fullUrl);
    }

    // limit render to section, if possible (added after pushState)
    let fetchUrl = url;
    if (this.dataset.filterSectionId) {
      fetchUrl = `${url}${url.indexOf('?') >= 0 ? '&' : '?'}section_id=${this.dataset.filterSectionId}`;
    }

    // start fetching URL
    const refreshContainerSelector = '[data-ajax-container]';
    const ajaxContainers = this.section.querySelectorAll(refreshContainerSelector);

    // loading state
    ajaxContainers.forEach((el) => el.classList.add('ajax-loading'));

    // cancel current fetch & fetch next
    if (this.ajaxLoadUrlFetchAbortController) {
      this.ajaxLoadUrlFetchAbortController.abort('Existing request not needed');
    }
    this.ajaxLoadUrlFetchAbortController = new AbortController();

    fetch(fetchUrl, {
      method: 'get',
      signal: this.ajaxLoadUrlFetchAbortController.signal
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
        return response.text();
      })
      .then((response) => {
        // save active element
        if (document.activeElement) {
          this.activeElementId = document.activeElement.id;
        }

        // before replace - check if container scrolls, if so find item at scroll top
        const scrollContainer = this.querySelector('.filters');
        let elAboveScrollTopData = null;
        if (scrollContainer && getComputedStyle(scrollContainer).overflow === 'auto') {
          const allFilterChildren = scrollContainer.querySelectorAll('.filters *');
          let elAboveScrollTop = allFilterChildren[0];
          for (let i = 1; i < allFilterChildren.length; i += 1) {
            if (allFilterChildren[i].offsetTop) {
              // if above fold
              if (allFilterChildren[i].offsetTop < scrollContainer.scrollTop) {
                // if below previously assigned element, assign
                if (allFilterChildren[i].offsetTop > elAboveScrollTop.offsetTop) {
                  elAboveScrollTop = allFilterChildren[i];
                }
              } else {
                break;
              }
            }
          }
          if (elAboveScrollTop.offsetTop === 0) {
            elAboveScrollTop = false;
          } else {
            // determine how to identify this element
            elAboveScrollTopData = {
              selector: '',
              textContent: elAboveScrollTop.textContent,
              extraScrollOffset: scrollContainer.scrollTop - elAboveScrollTop.offsetTop
            };
            const attributeNames = elAboveScrollTop.getAttributeNames();
            for (let i = 0; i < attributeNames.length; i += 1) {
              const attrName = attributeNames[i];
              if (attrName === 'class') {
                Array.from(elAboveScrollTop.classList).filter((a) => a !== 'filter-group__item--disabled').forEach((cl) => {
                  elAboveScrollTopData.selector += `.${cl}`;
                });
              } else {
                elAboveScrollTopData.selector += `[${attrName}="${CSS.escape(elAboveScrollTop.getAttribute(attrName))}"]`;
              }
            }
          }
        }

        // replace contents
        const template = document.createElement('template');
        template.innerHTML = response;
        const newAjaxContainers = template.content.querySelectorAll(refreshContainerSelector);
        newAjaxContainers.forEach((el, index) => {
          ajaxContainers[index].innerHTML = el.innerHTML;
        });

        // init js
        this.initFiltersEtc();

        // after replace
        if (elAboveScrollTopData) {
          this.querySelectorAll(elAboveScrollTopData.selector).forEach((el) => {
            if (el.textContent === elAboveScrollTopData.textContent) {
              scrollContainer.scrollTop = el.offsetTop + elAboveScrollTopData.extraScrollOffset;
            }
          });
        }

        // update mobile count
        if (this.utilBarClone) {
          const from = document.querySelector('.utility-bar:not(.utility-bar--sticky-mobile-copy) .utility-bar__centre');
          const to = this.utilBarClone.querySelector('.utility-bar__centre');
          if (from && to) {
            to.innerHTML = from.innerHTML;
          }
        }

        // remove loading state
        ajaxContainers.forEach((el) => el.classList.remove('ajax-loading'));

        // restore active element
        if (this.activeElementId) {
          const el = document.getElementById(this.activeElementId);
          if (el) {
            el.focus();
          }
        }

        // scroll viewport (must be done after any page size changes)
        const scrollToY = theme.getOffsetTopFromDoc(this.section.querySelector('[data-ajax-scroll-to]')) - document.querySelector('.section-header').clientHeight;
        window.scrollTo({
          top: scrollToY,
          behavior: 'smooth'
        });
      })
      .catch((error) => {
        console.warn(error);
      });
  }
};

window.customElements.define('filter-container', FilterContainer);

/* eslint-disable max-len */
const GalleryViewer = class extends HTMLElement {
  connectedCallback() {
    if (!this.initialised) {
      this.initialised = true;

      // ui
      this.classList.add('gallery-viewer--pre-reveal');
      this.zoomContainer = this.querySelector('.gallery-viewer__zoom-container');
      this.thumbContainer = this.querySelector('.gallery-viewer__thumbs');
      this.controlsContainer = this.querySelector('.gallery-viewer__controls');
      this.previousBtn = this.querySelector('.gallery-viewer__prev');
      this.nextBtn = this.querySelector('.gallery-viewer__next');

      // consts
      this.wheelZoomMultiplier = -0.001;
      this.pinchZoomMultiplier = 0.003;
      this.touchPanModifier = 1.0;

      // vars
      this.currentZoomImage = null;
      this.currentTransform = {
        panX: 0,
        panY: 0,
        zoom: 1
      };
      this.pinchTracking = {
        isTracking: false,
        lastPinchDistance: 0
      };
      this.touchTracking = {
        isTracking: false,
        lastTouchX: 0,
        lastTouchY: 0
      };

      // events
      theme.addDelegateEventListener(this, 'click', '.gallery-viewer__thumb', this.onThumbClick.bind(this));
      this.addEventListener('touchend', this.stopTrackingTouch.bind(this));
      this.addEventListener('touchmove', this.trackInputMovement.bind(this));
      this.addEventListener('mousemove', this.trackInputMovement.bind(this));
      this.addEventListener('wheel', this.trackWheel.bind(this));
      // prevent pan while swiping thumbnails
      this.thumbContainer.addEventListener('touchmove', (evt) => evt.stopPropagation());
      this.previousBtn.addEventListener('click', this.selectPreviousThumb.bind(this));
      this.nextBtn.addEventListener('click', this.selectNextThumb.bind(this));
      this.zoomContainer.addEventListener('click', this.onZoomContainerClick.bind(this));
      new ResizeObserver(() => this.setInitialImagePosition()).observe(this);
    }

    document.documentElement.classList.add('gallery-viewer-open');
    this.addEventListener('keyup', this.handleKeyup.bind(this));
    setTimeout(() => this.classList.remove('gallery-viewer--pre-reveal'), 10);
  }

  // eslint-disable-next-line class-methods-use-this
  disconnectedCallback() {
    document.documentElement.classList.remove('gallery-viewer-open');
  }

  static createEl(type, className, appendTo, innerHTML) {
    const el = document.createElement(type);
    el.className = className;
    if (type === 'a') {
      el.href = '#';
    }
    if (appendTo) {
      appendTo.insertAdjacentElement('beforeend', el);
    }
    if (innerHTML) {
      el.innerHTML = innerHTML;
    }
    return el;
  }

  init(currentFullUrl) {
    this.selectThumb([...this.thumbContainer.children].find((el) => el.dataset.zoomUrl === currentFullUrl) || this.thumbContainer.firstElementChild);
  }

  panZoomImageFromCoordinate(inputX, inputY) {
    // do nothing if the image fits, pan if not
    const doPanX = this.currentZoomImage.clientWidth > this.clientWidth;
    const doPanY = this.currentZoomImage.clientHeight > this.clientHeight;

    if (doPanX || doPanY) {
      const midX = this.clientWidth / 2;
      const midY = this.clientHeight / 2;

      const offsetFromCentreX = inputX - midX;
      const offsetFromCentreY = inputY - midY;

      // the offsetMultipler ensures it can only pan to the edge of the image, no further
      let finalOffsetX = 0;
      let finalOffsetY = 0;

      if (doPanX) {
        const offsetMultiplierX = ((this.currentZoomImage.clientWidth - this.clientWidth) / 2) / midX;
        finalOffsetX = Math.round(-offsetFromCentreX * offsetMultiplierX);
      }
      if (doPanY) {
        const offsetMultiplierY = ((this.currentZoomImage.clientHeight - this.clientHeight) / 2) / midY;
        finalOffsetY = Math.round(-offsetFromCentreY * offsetMultiplierY);
      }

      this.currentTransform.panX = finalOffsetX;
      this.currentTransform.panY = finalOffsetY;
      this.alterCurrentPanBy(0, 0); // sanitise
      this.updateImagePosition();
    }
  }

  alterCurrentPanBy(x, y) {
    this.currentTransform.panX += x;
    // limit offset to keep most of image on screen
    let panXMax = (this.currentZoomImage.naturalWidth * this.currentTransform.zoom - this.clientWidth) / 2.0;
    panXMax = Math.max(panXMax, 0);
    this.currentTransform.panX = Math.min(this.currentTransform.panX, panXMax);
    this.currentTransform.panX = Math.max(this.currentTransform.panX, -panXMax);

    this.currentTransform.panY += y;
    let panYMax = (this.currentZoomImage.naturalHeight * this.currentTransform.zoom - this.clientHeight) / 2.0;
    panYMax = Math.max(panYMax, 0);
    this.currentTransform.panY = Math.min(this.currentTransform.panY, panYMax);
    this.currentTransform.panY = Math.max(this.currentTransform.panY, -panYMax);
    this.updateImagePosition();
  }

  setCurrentTransform(panX, panY, zoom) {
    this.currentTransform.panX = panX;
    this.currentTransform.panY = panY;
    this.currentTransform.zoom = zoom;
    this.alterCurrentTransformZoomBy(0);
  }

  alterCurrentTransformZoomBy(delta) {
    this.currentTransform.zoom += delta;
    // do not zoom out further than fit
    const maxZoomX = this.clientWidth / this.currentZoomImage.naturalWidth;
    const maxZoomY = this.clientHeight / this.currentZoomImage.naturalHeight;
    this.currentTransform.zoom = Math.max(this.currentTransform.zoom, Math.min(maxZoomX, maxZoomY));

    // do not zoom in further than native size
    this.currentTransform.zoom = Math.min(this.currentTransform.zoom, 1.0);

    // reasses pan bounds
    this.alterCurrentPanBy(0, 0);
    this.updateImagePosition();
  }

  setInitialImagePosition() {
    this.currentZoomImage.style.top = `${this.clientHeight / 2 - this.currentZoomImage.clientHeight / 2}px`;
    this.currentZoomImage.style.left = `${this.clientWidth / 2 - this.currentZoomImage.clientWidth / 2}px`;
    this.setCurrentTransform(0, 0, 0); // centre, zoomed out
    this.classList.toggle('gallery-viewer--zoomable', this.currentZoomImage.naturalWidth > this.clientWidth || this.currentZoomImage.naturalHeight > this.clientHeight);
  }

  updateImagePosition() {
    this.currentZoomImage.style.transform = `translate3d(${this.currentTransform.panX}px, ${this.currentTransform.panY}px, 0) scale(${this.currentTransform.zoom})`;
  }

  selectThumb(thumb) {
    [...thumb.parentElement.children].forEach((el) => {
      if (el === thumb) {
        el.classList.add('gallery-viewer__thumb--active');
      } else {
        el.classList.remove('gallery-viewer__thumb--active');
      }
    });

    // replace zoom image
    this.zoomContainer.classList.add('gallery-viewer__zoom-container--loading');
    this.currentZoomImage = GalleryViewer.createEl('img', 'gallery-viewer__zoom-image');
    this.currentZoomImage.alt = '';
    this.currentZoomImage.style.visibility = 'hidden';
    this.currentZoomImage.onload = () => {
      this.zoomContainer.classList.remove('gallery-viewer__zoom-container--loading');
      this.currentZoomImage.style.visibility = '';
      this.setInitialImagePosition();
    };
    this.currentZoomImage.src = thumb.dataset.zoomUrl;
    this.zoomContainer.replaceChildren(this.currentZoomImage);
  }

  selectPreviousThumb(evt) {
    if (evt) evt.preventDefault();
    if (this.thumbContainer.childElementCount < 2) return;

    let previous = this.thumbContainer.querySelector('.gallery-viewer__thumb--active').previousElementSibling;
    while (!previous || !previous.offsetParent) {
      if (!previous) {
        previous = this.thumbContainer.lastElementChild;
      } else {
        previous = previous.previousElementSibling;
      }
    }
    this.selectThumb(previous);
  }

  selectNextThumb(evt) {
    if (evt) evt.preventDefault();
    if (this.thumbContainer.childElementCount < 2) return;

    let next = this.thumbContainer.querySelector('.gallery-viewer__thumb--active').nextElementSibling;
    while (!next || !next.offsetParent) {
      if (!next) {
        next = this.thumbContainer.firstElementChild;
      } else {
        next = next.nextElementSibling;
      }
    }
    this.selectThumb(next);
  }

  stopTrackingTouch() {
    this.pinchTracking.isTracking = false;
    this.touchTracking.isTracking = false;
  }

  trackInputMovement(evt) {
    evt.preventDefault();
    if (evt.type === 'touchmove' && evt.touches.length > 0) {
      // pan
      const touch1 = evt.touches[0];
      if (!this.touchTracking.isTracking) {
        this.touchTracking.isTracking = true;
        this.touchTracking.lastTouchX = touch1.clientX;
        this.touchTracking.lastTouchY = touch1.clientY;
      } else {
        this.alterCurrentPanBy(
          (touch1.clientX - this.touchTracking.lastTouchX) * this.touchPanModifier,
          (touch1.clientY - this.touchTracking.lastTouchY) * this.touchPanModifier
        );
        this.touchTracking.lastTouchX = touch1.clientX;
        this.touchTracking.lastTouchY = touch1.clientY;
      }

      if (evt.touches.length === 2) {
        // pinch
        const touch2 = evt.touches[1];
        const pinchDistance = Math.sqrt((touch1.clientX - touch2.clientX) ** 2 + (touch1.clientY - touch2.clientY) ** 2);
        if (!this.pinchTracking.isTracking) {
          this.pinchTracking.lastPinchDistance = pinchDistance;
          this.pinchTracking.isTracking = true;
        } else {
          const pinchDelta = pinchDistance - this.pinchTracking.lastPinchDistance;
          this.alterCurrentTransformZoomBy(pinchDelta * this.pinchZoomMultiplier);
          this.pinchTracking.lastPinchDistance = pinchDistance;
        }
      } else {
        this.pinchTracking.isTracking = false;
      }
    } else {
      // mousemove
      this.panZoomImageFromCoordinate(evt.clientX, evt.clientY);
    }
  }

  trackWheel(evt) {
    evt.preventDefault();
    if (evt.deltaY !== 0) {
      this.alterCurrentTransformZoomBy(evt.deltaY * this.wheelZoomMultiplier);
    }
  }

  onThumbClick(evt, thumb) {
    evt.preventDefault();
    this.selectThumb(thumb);
  }

  onZoomContainerClick(evt) {
    evt.preventDefault();

    if (this.currentTransform.zoom === 1.0) {
      this.currentTransform.zoom = 0;
      this.alterCurrentTransformZoomBy(0);
    } else {
      this.currentTransform.zoom = 1;
      this.alterCurrentTransformZoomBy(0);
      this.panZoomImageFromCoordinate(evt.clientX, evt.clientY);
    }
  }

  handleKeyup(evt) {
    switch (evt.key) {
      case 'ArrowLeft':
        evt.preventDefault();
        this.selectPreviousThumb();
        break;
      case 'ArrowRight':
        evt.preventDefault();
        this.selectNextThumb();
        break;
    }
  }
};

window.customElements.define('gallery-viewer', GalleryViewer);

const LinkDropdown = class extends HTMLElement {
  constructor() {
    super();

    this.open = false;
    this.button = this.querySelector('.link-dropdown__button');
    this.button.addEventListener('click', this.toggle.bind(this));
  }

  connectedCallback() {
    if (this.open) {
      this.addDismissListener();
    }
  }

  disconnectedCallback() {
    if (this.open) {
      this.removeDismissListener();
    }
  }

  toggle(evt, isDismiss) {
    if (!isDismiss) {
      evt.preventDefault();
      evt.stopPropagation();
    }

    const doExpand = this.button.getAttribute('aria-expanded') === 'false';
    this.button.setAttribute('aria-expanded', doExpand);
    this.button.style.width = `${this.button.clientWidth}px`;

    let newWidth = null;
    const optsBox = this.button.nextElementSibling;
    const isLeftAligned = this.button.closest('.link-dropdown').classList.contains('link-dropdown--left-aligned');
    if (!isLeftAligned) {
      if (doExpand) {
        newWidth = optsBox.clientWidth;
        // rtl - could be either side
        if (document.querySelector('html[dir=rtl]')) {
          newWidth += parseInt(getComputedStyle(optsBox).left, 10);
        } else {
          newWidth += parseInt(getComputedStyle(optsBox).right, 10);
        }
        newWidth -= parseInt(getComputedStyle(optsBox.querySelector('.link-dropdown__link')).paddingInlineStart, 10);
      } else {
        newWidth = parseInt(getComputedStyle(this.button).paddingInlineEnd, 10) + Math.ceil(this.button.querySelector('.link-dropdown__button-text').getBoundingClientRect().width);
      }
      setTimeout(() => {
        this.button.style.width = `${newWidth}px`;
      }, 10);
    }

    if (doExpand) {
      this.open = true;
      this.addDismissListener();
    } else {
      this.open = false;
      this.removeDismissListener();
    }
  }

  addDismissListener() {
    this.dismissCallback = this.toggle.bind(this, true);
    document.addEventListener('click', this.dismissCallback);
  }

  removeDismissListener() {
    document.removeEventListener('click', this.dismissCallback);
    this.dismissCallback = null;
  }
};

window.customElements.define('link-dropdown', LinkDropdown);

const MainNavigation = class extends HTMLElement {
  constructor() {
    super();

    this.navHoverDelay = 250;
    this.navLastOpenDropdown = null;
    this.navOpenTimeoutId = -1;

    // hover
    this.querySelectorAll('.navigation__tier-1 > .navigation__item--with-children').forEach((el) => {
      el.addEventListener('mouseenter', this.onNavParentHoverIn.bind(this));
    });
    this.querySelectorAll('.navigation__tier-1 > .navigation__item--with-children').forEach((el) => {
      el.addEventListener('mouseleave', this.onNavParentHoverOut.bind(this));
    });

    // touch
    theme.addDelegateEventListener(this, 'touchstart', '.navigation__tier-1 > .navigation__item--with-children > .navigation__link', (evt, el) => { this.handleTouch(evt, el); }, { passive: true });
    theme.addDelegateEventListener(this, 'touchend', '.navigation__tier-1 > .navigation__item--with-children > .navigation__link', (evt, el) => { this.handleTouch(evt, el); });
    theme.addDelegateEventListener(this, 'click', '.navigation__tier-1 > .navigation__item--with-children > .navigation__link', this.onNavParentHoverIn.bind(this));

    // keypress
    theme.addDelegateEventListener(this, 'keydown', '.navigation__tier-1 > .navigation__item--with-children > .navigation__link', this.onNavKeydown.bind(this));

    // click #-link - open child nav
    this.querySelectorAll('.navigation__link[href="#"][aria-haspopup="true"]').forEach((el) => {
      el.addEventListener('click', (evt) => {
        evt.preventDefault();
        evt.currentTarget.nextElementSibling.dispatchEvent(new Event('click', { bubbles: true }));
      });
    });

    // transparent header hover
    this.addEventListener('mouseenter', this.handleNavHover.bind(this));
    this.addEventListener('mouseleave', this.handleNavHover.bind(this));
  }

  ensureDropdownsInPageBounds() {
    this.querySelectorAll('.navigation__item--with-small-menu > .navigation__child-tier').forEach((el) => {
      const parentBcr = el.parentElement.getBoundingClientRect();
      const childBcr = el.getBoundingClientRect();
      const diff = window.innerWidth - (parentBcr.left + childBcr.width);
      if (diff < 25) {
        el.style.setProperty('--nav-side-offset', `${diff - 25}px`);
      }
    });
  }

  connectedCallback() {
    // shuffle dropdowns off RHS of viewport
    const debouncedEnsureDropdownsInPageBounds = debounce(
      this.ensureDropdownsInPageBounds.bind(this),
      300
    );
    debouncedEnsureDropdownsInPageBounds();
    this.resizeObserver = new ResizeObserver((entries) => {
      for (let i = 0; i < entries.length; i += 1) {
        const entry = entries[i];
        if (entry.contentBoxSize || entry.contentRect) {
          debouncedEnsureDropdownsInPageBounds();
        }
      }
    });
    this.resizeObserver.observe(this);

    // proxy for desktop nav interaction events
    this.proxyTier1Nav = document.getElementById(this.dataset.proxyNav);

    if (this.proxyTier1Nav) {
      // reposition small menu
      this.proxyTier1NavBoundEvents = [];

      const boundOnProxyNavEnterSmallMenu = this.onProxyNavEnterSmallMenu.bind(this);
      this.proxyTier1Nav.querySelectorAll('.navigation__item--with-small-menu').forEach((el) => {
        el.addEventListener('mouseenter', boundOnProxyNavEnterSmallMenu);
        this.proxyTier1NavBoundEvents.push({ element: el, name: 'mouseenter', fn: boundOnProxyNavEnterSmallMenu });
      });

      this.proxyTier1NavBoundEvents.push({
        element: this.proxyTier1Nav,
        name: 'touchstart',
        fn: theme.addDelegateEventListener(this.proxyTier1Nav, 'touchstart', '.navigation__item--with-small-menu', this.onProxyNavEnterSmallMenu.bind(this), { passive: true })
      });

      // transfer all events to main menu
      const onProxyNavEnterLeaveLargeMenu = (evt) => {
        const elIndex = [...evt.currentTarget.parentNode.children].indexOf(evt.currentTarget);
        this.querySelectorAll('.navigation__tier-1 > .navigation__item')[elIndex].dispatchEvent(new Event(evt.type));
      };
      this.proxyTier1Nav.querySelectorAll('.navigation__tier-1 > .navigation__item--with-children').forEach((el) => {
        el.addEventListener('mouseenter', onProxyNavEnterLeaveLargeMenu);
        this.proxyTier1NavBoundEvents.push({ element: el, name: 'mouseenter', fn: onProxyNavEnterLeaveLargeMenu });
        el.addEventListener('mouseleave', onProxyNavEnterLeaveLargeMenu);
        this.proxyTier1NavBoundEvents.push({ element: el, name: 'mouseleave', fn: onProxyNavEnterLeaveLargeMenu });
      });

      const eventNames = ['touchstart', 'touchend', 'click'];
      for (let i = 0; i < eventNames.length; i += 1) {
        const eventName = eventNames[i];
        this.proxyTier1NavBoundEvents.push({
          element: this.proxyTier1Nav,
          name: eventName,
          fn: theme.addDelegateEventListener(this.proxyTier1Nav, eventName, '.navigation__tier-1 > .navigation__item--with-children > .navigation__link', (evt, el) => {
            const elIndex = [...el.parentNode.parentNode.children].indexOf(el.parentNode);
            const proxiedLink = this.querySelectorAll('.navigation__tier-1 > .navigation__item')[elIndex].firstElementChild;
            this.handleTouch(evt, proxiedLink);
          }, { passive: eventName === 'touchstart' })
        });
      }

      this.proxyTier1NavBoundEvents.push({
        element: this.proxyTier1Nav,
        name: 'keydown',
        fn: theme.addDelegateEventListener(this.proxyTier1Nav, 'keydown', '.navigation__tier-1 > .navigation__item--with-children > .navigation__link', (evt, el) => {
          if (evt.key === 'Enter') {
            const elIndex = [...el.parentNode.parentNode.children].indexOf(el.parentNode);
            const proxiedLink = this.querySelectorAll('.navigation__tier-1 > .navigation__item')[elIndex].firstElementChild;
            el.setAttribute('aria-expanded', !proxiedLink.parentElement.classList.contains('navigation__item--show-children'));
            this.onNavKeydown(evt, proxiedLink);
          }
        })
      });

      // transparent header hover
      const boundHandleNavHover = this.handleNavHover.bind(this);
      this.proxyTier1Nav.addEventListener('mouseenter', boundHandleNavHover);
      this.proxyTier1Nav.addEventListener('mouseleave', boundHandleNavHover);
      this.proxyTier1NavBoundEvents.push({ element: this.proxyTier1Nav, name: 'mouseenter', fn: boundHandleNavHover });
      this.proxyTier1NavBoundEvents.push({ element: this.proxyTier1Nav, name: 'mouseleave', fn: boundHandleNavHover });
    }

    // create mobile nav
    const tDiv = document.createElement('div');
    tDiv.innerHTML = this.querySelector('.mobile-navigation-drawer-template').innerHTML;
    this.mobileDrawer = tDiv.firstElementChild;

    // add announcement bar items
    const mobileDrawerFooter = this.mobileDrawer.querySelector('.mobile-navigation-drawer__footer');
    const annBarMenu = document.querySelector('.announcement-bar .inline-menu');
    if (annBarMenu) {
      const clone = annBarMenu.cloneNode(true);
      clone.classList.remove('desktop-only');
      mobileDrawerFooter.appendChild(clone);
    }

    const annBarLocalizations = document.querySelector('.announcement-bar .header-localization');
    if (annBarLocalizations) {
      const clone = annBarLocalizations.cloneNode(true);
      clone.classList.remove('desktop-only');
      mobileDrawerFooter.appendChild(clone);

      clone.querySelector('form').addEventListener('change', (evt) => {
        const input = evt.target.previousElementSibling;
        if (input && input.tagName === 'INPUT') {
          input.value = evt.detail.selectedValue;
          evt.currentTarget.submit();
        }
      });
    }

    const annBarSocial = document.querySelector('.announcement-bar .social');
    if (annBarSocial) {
      const clone = annBarSocial.cloneNode(true);
      clone.classList.remove('desktop-only');
      mobileDrawerFooter.appendChild(clone);
    }

    // ensure ids are unique
    theme.suffixIds(this.mobileDrawer, 'MobileNav');

    // insert into page
    document.querySelector('.section-header').insertAdjacentElement('afterend', this.mobileDrawer);

    // event: open second tier
    theme.addDelegateEventListener(this.mobileDrawer, 'click', '.navigation__tier-1 > .navigation__item > .navigation__children-toggle', (evt, delEl) => {
      evt.preventDefault();

      // set text in header
      delEl.parentElement.classList.add('navigation__item--open');
      this.mobileDrawer.classList.add('mobile-navigation-drawer--child-open');
      this.mobileDrawer.querySelector('.mobile-nav-title').innerText = delEl.previousElementSibling.innerText;

      // position under header
      delEl.nextElementSibling.style.top = `${Math.ceil(this.mobileDrawer.querySelector('.navigation__mobile-header').clientHeight + 1)}px`;

      // scroll container
      this.mobileDrawer.closest('.mobile-navigation-drawer').scrollTo({ top: 0, left: 0, behavior: 'instant' }); // 'smooth' not working in iOS 15
    });

    if (this.mobileDrawer.dataset.mobileExpandWithEntireLink === 'true') {
      theme.addDelegateEventListener(this.mobileDrawer, 'click', '.navigation__item--with-children > .navigation__link', (evt, delEl) => {
        evt.preventDefault();
        delEl.nextElementSibling.dispatchEvent(new Event('click', { bubbles: true, cancelable: true }));
      });
    } else {
      theme.addDelegateEventListener(this.mobileDrawer, 'click', '.navigation__item--with-children > .navigation__link[href="#"]', (evt, delEl) => {
        evt.preventDefault();
        delEl.nextElementSibling.dispatchEvent(new Event('click', { bubbles: true, cancelable: true }));
      });
    }

    // event: close second tier
    theme.addDelegateEventListener(this.mobileDrawer, 'click', '.mobile-nav-back', (evt) => {
      evt.preventDefault();
      this.mobileDrawer.classList.remove('mobile-navigation-drawer--child-open');
      this.mobileDrawer.querySelectorAll('.navigation__tier-1 > .navigation__item--open').forEach((el) => {
        el.classList.remove('navigation__item--open');
      });
    });

    // event: toggle third tier
    theme.addDelegateEventListener(this.mobileDrawer, 'click', '.navigation__tier-2 > .navigation__item > .navigation__children-toggle', (evt, delEl) => {
      evt.preventDefault();
      const doOpen = !delEl.parentElement.classList.contains('navigation__item--open');

      if (doOpen) {
        delEl.parentElement.classList.add('navigation__item--open');
        delEl.nextElementSibling.style.height = `${delEl.nextElementSibling.firstElementChild.clientHeight}px`;
      } else {
        delEl.parentElement.classList.remove('navigation__item--open');
        delEl.nextElementSibling.style.height = '';
      }
    });
  }

  handleNavHover(evt) {
    this.closest('.section-header').classList.toggle('section-header--nav-hover', evt.type === 'mouseenter');
  }

  onNavParentHoverIn(evt) {
    const dropdownContainer = evt.currentTarget;
    clearTimeout(this.navOpenTimeoutId);
    clearTimeout(dropdownContainer.dataset.navCloseTimeoutId);
    const openSiblings = [...dropdownContainer.parentNode.children].filter((child) => child !== dropdownContainer && child.classList.contains('navigation__item--show-children'));

    // close all menus but last opened
    openSiblings.filter((el) => el !== this.navLastOpenDropdown).forEach((el) => el.classList.remove('navigation__item--show-children'));
    this.navLastOpenDropdown = dropdownContainer;

    // show after a delay, based on first-open or not
    const timeoutDelay = openSiblings.length === 0 ? 0 : this.navHoverDelay;

    // open it
    const newNavOpenTimeoutId = setTimeout(() => {
      [...dropdownContainer.parentNode.children].forEach((el) => {
        if (el === dropdownContainer) {
          el.classList.add('navigation__item--show-children');
        } else {
          el.classList.remove('navigation__item--show-children');
        }
      });
      dropdownContainer.closest('.section-header').classList.add('section-header--nav-open');
    }, timeoutDelay);

    this.navOpenTimeoutId = newNavOpenTimeoutId;
    dropdownContainer.dataset.navOpenTimeoutId = newNavOpenTimeoutId;

    dropdownContainer.firstElementChild.setAttribute('aria-expanded', true);
  }

  onNavParentHoverOut(evt) {
    // cancel opening, close after delay, and clear transforms
    const dropdownContainer = evt.currentTarget;
    clearTimeout(dropdownContainer.dataset.navOpenTimeoutId);
    dropdownContainer.dataset.navCloseTimeoutId = setTimeout(() => {
      dropdownContainer.classList.remove('navigation__item--show-children');
      dropdownContainer.closest('.section-header').classList.remove('section-header--nav-open');
    }, this.navHoverDelay);

    dropdownContainer.firstElementChild.setAttribute('aria-expanded', false);
  }

  handleTouch(evt, link) {
    if (window.innerWidth > 767) {
      if (evt.type === 'touchstart') {
        link.dataset.touchstartedAt = evt.timeStamp.toString();
      } else if (evt.type === 'touchend') {
        // down & up in under a second - presume tap
        if (evt.timeStamp - parseInt(link.dataset.touchstartedAt, 10) < 1000) {
          link.dataset.touchOpenTriggeredAt = evt.timeStamp.toString();
          if (link.parentElement.classList.contains('navigation__item--show-children')) {
            // trigger close
            link.parentElement.dispatchEvent(new Event('mouseleave'));
          } else {
            // trigger close on any open items
            this.querySelectorAll('.navigation__item--show-children').forEach((el) => el.dispatchEvent(new Event('mouseleave')));
            // trigger open
            link.parentElement.dispatchEvent(new Event('mouseenter'));
          }
          // prevent fake click
          evt.preventDefault();
          evt.stopPropagation();
        }
      } else if (evt.type === 'click') {
        // if touch open was triggered very recently, prevent click event
        if (link.dataset.touchOpenTriggeredAt
            && evt.timeStamp - parseInt(link.dataset.touchOpenTriggeredAt, 10) < 1000) {
          evt.preventDefault();
          evt.stopPropagation();
        }
      }
    }
  }

  // eslint-disable-next-line class-methods-use-this
  onNavKeydown(evt, el) {
    if (evt.key === 'Enter') {
      if (el.parentElement.classList.contains('navigation__item--show-children')) {
        el.parentElement.dispatchEvent(new Event('mouseleave'));
      } else {
        el.parentElement.dispatchEvent(new Event('mouseenter'));
      }
      evt.preventDefault();
    }
  }

  onProxyNavEnterSmallMenu(evt, delEl) {
    const el = delEl || evt.currentTarget;
    const elIndex = [...el.parentNode.children].indexOf(el);
    const dropdown = this.querySelectorAll('.navigation__tier-1 > .navigation__item')[elIndex].querySelector('.navigation__tier-2-container');
    if (document.querySelector('html[dir="rtl"]')) {
      dropdown.style.right = `${dropdown.offsetParent.clientWidth - (theme.getOffsetLeftFromDoc(el) + el.clientWidth)}px`;
    } else {
      dropdown.style.left = `${theme.getOffsetLeftFromDoc(el)}px`;
    }
  }

  disconnectedCallback() {
    // remove externalities
    this.mobileDrawer.remove();

    if (this.proxyTier1NavBoundEvents) {
      for (let i = 0; i < this.proxyTier1NavBoundEvents.length; i += 1) {
        this.proxyTier1NavBoundEvents[i].element.removeEventListener(
          this.proxyTier1NavBoundEvents[i].name,
          this.proxyTier1NavBoundEvents[i].fn
        );
      }
    }
  }
};

window.customElements.define('main-navigation', MainNavigation);

const ProductBlock = class extends HTMLElement {
  constructor() {
    super();
    window.initLazyScript(this, this.init.bind(this));
  }

  init() {
    this.images = Array.from(this.querySelectorAll('.product-block__image'));
    if (this.images.length > 1) {
      this.initImagePagination();
      this.monitorSwatchSelection();
      if (this.matches(':hover')) {
        this.lazyLoadAll();
      } else {
        this.initCustomLazyLoading();
      }
    }
  }

  initCustomLazyLoading() {
    // preload hover images after a delay
    setTimeout(() => {
      this.querySelector('.product-block__image--show-on-hover').classList.remove('product-block__image--inactivated');
    }, 1000);
    // activate all images after first interaction
    this.boundLazyLoadAll = this.lazyLoadAll.bind(this);
    this.addEventListener('mouseenter', this.boundLazyLoadAll);
    this.addEventListener('touchstart', this.boundLazyLoadAll, { passive: true });
  }

  lazyLoadAll() {
    this.querySelectorAll('.product-block__image--inactivated').forEach((el) => el.classList.remove('product-block__image--inactivated'));
    this.removeEventListener('mouseenter', this.boundLazyLoadAll);
    this.removeEventListener('touchstart', this.boundLazyLoadAll);
  }

  // get image at index, safely wrapping index
  getImageAt(index) {
    // positive modulo, like it should be, JS does not do *maths* correctly
    return this.images[((index % this.images.length) + this.images.length) % this.images.length];
  }

  incrementActiveImage(increment) {
    let index = 0;
    for (let i = 0; i < this.images.length; i += 1) {
      if (this.images[i].classList.contains('product-block__image--active')) {
        index = i;
        break;
      }
    }
    this.setActiveImage(index + increment);
  }

  setActiveImage(index) {
    const newActiveImage = this.getImageAt(index);
    const hoverImage = this.getImageAt(index + 1);

    // set new active image visibility
    [...newActiveImage.parentElement.children].forEach((el) => {
      el.classList.toggle('product-block__image--active', el === newActiveImage);
      el.classList.toggle('product-block__image--show-on-hover', el === hoverImage);
    });

    // dots
    this.querySelectorAll('.product-block__image-dot').forEach((el, iter) => {
      el.classList.toggle('product-block__image-dot--active', iter === index);
    });
  }

  initImagePagination() {
    // next button
    this.querySelector('.image-page-button--next').addEventListener('click', (evt) => {
      evt.preventDefault();
      this.incrementActiveImage(1);
    });

    // previous button
    this.querySelector('.image-page-button--previous').addEventListener('click', (evt) => {
      evt.preventDefault();
      this.incrementActiveImage(-1);
    });

    // swipe (when not in a carousel)
    if (!this.closest('.carousel, .product-grid--scrollarea')) {
      const touchContainer = this.querySelector('.image-cont--with-secondary-image');
      touchContainer.addEventListener('touchstart', (evt) => {
        // swipe may end in another block
        theme.productBlockTouchTracking = true;
        theme.productBlockTouchStartX = evt.touches[0].clientX;
        theme.productBlockTouchStartY = evt.touches[0].clientY;
      }, { passive: true });

      touchContainer.addEventListener('touchmove', (evt) => {
        if (theme.productBlockTouchTracking) {
          if (Math.abs(evt.touches[0].clientY - theme.productBlockTouchStartY) < 30) {
            const deltaX = evt.touches[0].clientX - theme.productBlockTouchStartX;
            if (deltaX > 25) {
              this.incrementActiveImage(-1);
              theme.productBlockTouchTracking = false;
            } else if (deltaX < -25) {
              this.incrementActiveImage(1);
              theme.productBlockTouchTracking = false;
            }
          }
        }
      }, { passive: true });

      touchContainer.addEventListener('touchend', () => {
        theme.productBlockTouchTracking = false;
      });
    }
  }

  onSelectSwatch(evt) {
    evt.preventDefault();
    let index = -1;

    for (let i = 0; i < this.images.length; i += 1) {
      if (this.images[i].dataset.mediaId === evt.currentTarget.dataset.media) {
        index = i;
        break;
      }
    }

    if (index < 0) return;

    this.setActiveImage(index);

    // include in URL
    const { optionName } = evt.currentTarget.closest('.product-block-options').dataset;
    const optionValue = evt.currentTarget.dataset.optionItem;
    this.querySelectorAll('.product-link, .quickbuy-toggle').forEach((el) => {
      const url = new URL(el.href);
      const params = new URLSearchParams(url.search);
      params.set(optionName, optionValue);
      el.href = `${url.pathname}?${params}`;
      el.rel = 'nofollow';
    });
  }

  monitorSwatchSelection() {
    this.querySelectorAll('[data-media].product-block-options__item').forEach((el) => {
      el.addEventListener('mouseenter', this.onSelectSwatch.bind(this));
      el.addEventListener('click', this.onSelectSwatch.bind(this));
    });
  }
};

window.customElements.define('product-block', ProductBlock);

const MediaGallery = class extends HTMLElement {
  constructor() {
    super();
    this.section = this.closest('.js-product');
    this.mainImageContainer = this.querySelector('.main-image');
    this.slideshow = this.mainImageContainer.querySelector('.main-image carousel-slider');
    this.collage = this.querySelector('.product-media-collage');
    this.xrButton = this.querySelector('[data-shopify-xr]');
    this.variantPicker = this.section.querySelector('variant-picker');
    this.mediaGroupingEnabled = this.variantPicker && this.hasAttribute('data-media-grouping-enabled') && this.getMediaGroupData();
    this.mediaLists = [
      this.querySelectorAll('.main-image .slider__item'),
      this.querySelectorAll('.product-media-collage__item'),
      this.querySelectorAll('.thumbnails .slider__item')
    ];

    if (this.variantPicker) {
      const toLoad = [this.variantPicker];
      if (this.slideshow.offsetParent) {
        toLoad.push(this.slideshow);
      }
      const thumbnailSlider = this.querySelector('carousel-slider.thumbnails');
      if (thumbnailSlider && thumbnailSlider.offsetParent) {
        toLoad.push(thumbnailSlider);
      }
      theme.whenComponentLoaded(toLoad, this.setFromVariantPicker.bind(this));
    }

    if (this.hasAttribute('data-zoom-enabled')) {
      this.galleryModal = this.querySelector('.js-media-zoom-template').content.firstElementChild.cloneNode(true);
      this.mediaLists.push(this.galleryModal.querySelectorAll('.gallery-viewer__thumb'));
      theme.addDelegateEventListener(this, 'click', '.show-gallery', this.openGalleryViewer.bind(this));

      if (this.hasAttribute('data-preload')) {
        this.mainImageContainer.addEventListener('mouseover', MediaGallery.hoverMainImage.bind(this));
        this.mainImageContainer.addEventListener('touchstart', MediaGallery.hoverMainImage.bind(this), { passive: true });
      }
    }

    this.section.addEventListener('on:carousel-slider:select', this.selectMainMedia.bind(this));
    theme.addDelegateEventListener(this, 'click', '.thumbnail', this.selectThumbnail.bind(this));
    this.section.addEventListener('on:variant:change', this.onVariantChange.bind(this));

    if (this.hasAttribute('data-preload')) {
      // Preload slideshow images after a short delay, if slideshow is visible
      setTimeout(() => {
        if (this.slideshow.offsetParent) {
          this.slideshow.querySelectorAll('.theme-img').forEach((el) => { el.loading = 'eager'; });
        }
      }, 3000);
    }
  }

  setFromVariantPicker() {
    if (this.mediaGroupingEnabled) {
      this.setMediaGroupOnFirstLoad();
    } else {
      // Find which variant is selected and set active media.
      const variant = this.variantPicker.getSelectedVariant();
      if (variant && variant.featured_media) {
        this.setActiveMedia(variant.featured_media.id, true, true);
      }
    }
  }

  /**
   * Run on first load to set initial media group and focussed image
   */
  setMediaGroupOnFirstLoad() {
    this.setActiveMediaGroup(this.getMediaGroupFromOptionSelectors());

    // Find which variant is selected and set active media.
    const variant = this.variantPicker.getSelectedVariant();
    if (variant && variant.featured_media) {
      this.setActiveMedia(variant.featured_media.id, true, true);
      return;
    }

    // Default to first visible image.
    this.setActiveMedia(this.querySelector('.thumbnails .slider__item:not([hidden])').dataset.mediaId, false, true);
  }

  /**
   * Hover main image.
   * @param {Event} evt - hover event for image
   */
  static hoverMainImage(evt) {
    MediaGallery.loadImage(evt.currentTarget.querySelector('.slider__item.is-active a.show-gallery'));
  }

  /**
   * Open large image viewer.
   * @param {Event} evt - click event for image
   * @param {Element} imageLink - link clicked on
   */
  openGalleryViewer(evt, imageLink) {
    evt.preventDefault();

    // add to document on first open
    if (!this.galleryModal.parentElement) {
      document.body.appendChild(this.galleryModal);
    }

    this.galleryModal.open(imageLink);
    const viewer = this.galleryModal.querySelector('gallery-viewer');
    viewer.init(imageLink.getAttribute('href'));
    viewer.focus();

    if (this.hasAttribute('data-preload')) {
      this.mediaLists[0].forEach((sliderItem) => {
        MediaGallery.loadImage(sliderItem.querySelector('a.show-gallery'));
      });
    }
  }

  /**
   * Load an image.
   * @param {Element} anchor - anchor element
   */
  static loadImage(anchor) {
    if (!anchor || anchor.hasAttribute('data-loading') || anchor.hasAttribute('data-loaded')) return;

    anchor.setAttribute('data-loading', '');

    const image = new Image(5000);
    image.addEventListener('load', () => {
      anchor.removeAttribute('data-loading');
      anchor.setAttribute('data-loaded', '');
    }, {
      once: true
    });
    image.src = anchor.href;
  }

  /**
   * Handle a change in variant on the page.
   * @param {Event} evt - variant change event dispatched by variant-picker
   */
  onVariantChange(evt) {
    if (this.mediaGroupingEnabled) {
      this.setActiveMediaGroup(this.getMediaGroupFromOptionSelectors(evt));
    }

    if (evt.detail.variant && evt.detail.variant.featured_media) {
      this.setActiveMedia(evt.detail.variant.featured_media.id, true);
    } else if (this.mediaGroupChanged) {
      // default to first visible image, if group changed and current variant has no related image
      this.setActiveMedia(this.querySelector('.thumbnails .slider__item:not([hidden])').dataset.mediaId, true);
    }
  }

  /**
   * Gets the media group from currently selected variant options.
   * @param {Event} evt - variant change event dispatched by variant-picker
   * @returns {?object}
   */
  getMediaGroupFromOptionSelectors(evt) {
    if (evt) {
      return evt.detail.selectedOptions[this.getMediaGroupData().groupOptionIndex];
    }

    return this.variantPicker.getSelectedOptions()[this.getMediaGroupData().groupOptionIndex];
  }

  /**
   * Gets the variant media associations for a product.
   * @returns {?object}
   */
  getMediaGroupData() {
    if (typeof this.variantMediaData === 'undefined') {
      const dataEl = this.querySelector('.js-data-variant-media');
      if (dataEl) {
        this.variantMediaData = JSON.parse(dataEl.textContent);
      } else {
        this.variantMediaData = false;
      }
    }

    return this.variantMediaData;
  }

  /**
   * Show only images associated to the current variant.
   * @param {string} groupName - optional - Group to show (uses this.currentItem if empty)
   */
  setActiveMediaGroup(groupName) {
    this.mediaGroupChanged = this.currentMediaGroup !== groupName;
    this.currentMediaGroup = groupName;

    if (!this.mediaGroupChanged) return;

    if (!groupName) {
      this.mediaLists.forEach((list) => {
        list.forEach((mediaItem) => { mediaItem.hidden = false; });
      });
      return;
    }

    const mediaGroupData = this.getMediaGroupData();

    this.mediaLists.forEach((list) => {
      // Set hidden
      list.forEach((el) => {
        const mediaItemGroup = mediaGroupData.media[el.dataset.mediaId].group;
        const showThis = mediaItemGroup === groupName || mediaItemGroup === true;
        el.hidden = !showThis;
      });

      // Move all-groups media to start/end
      [...list].forEach((el) => {
        if (mediaGroupData.media[el.dataset.mediaId].group === true) {
          if (mediaGroupData.media[el.dataset.mediaId].position === 'start') {
            el.parentElement.prepend(el);
          } else {
            el.parentElement.append(el);
          }
        }
      });

      // Move hidden elements to the end (to allow nth-child CSS in layouts)
      [...list].filter((el) => el.hidden).forEach((el) => el.parentElement.append(el));

      // Refresh slider
      if (list.length > 0) {
        const slider = list[0].closest('carousel-slider');
        if (slider && slider.offsetParent) {
          slider.refresh();
        }
      }
    });
  }

  /**
   * Sets the active media item.
   * @param {number} mediaId - Media ID to set as active.
   * @param {boolean} [scrollToItem=true] - Scroll to the active media item.
   * @param {boolean} [firstLoad=false] - Is gallery initialising.
   */
  setActiveMedia(mediaId, scrollToItem = true, firstLoad = false) {
    const strMediaId = mediaId.toString();
    const mediaEl = this.mainImageContainer.querySelector(`[data-media-id="${strMediaId}"]`);

    if (scrollToItem) {
      // slideshow (if visible)
      if (this.slideshow.hasAttribute('loaded') && this.slideshow.offsetParent) {
        this.slideshow.scrollToElement(mediaEl, 'instant');
      }

      // collage (if visible and not first load)
      if (this.collage && this.collage.offsetParent && !firstLoad) {
        const collageMediaEl = this.collage.querySelector(`[data-media-id="${strMediaId}"]`);
        if (collageMediaEl) {
          theme.scrollToRevealElement(collageMediaEl);

          clearTimeout(this.collage.dataset.highlightTimeoutId);
          // When media group changes, assume first media has attention
          if (this.mediaGroupChanged) {
            this.collage.querySelectorAll('.product-media-collage__item--highlight-off').forEach((el) => {
              el.classList.remove('product-media-collage__item--highlight-off');
            });
          } else {
            this.collage.querySelectorAll('.product-media-collage__item').forEach((el) => {
              if (el === collageMediaEl) {
                el.classList.remove('product-media-collage__item--highlight-off');
              } else {
                el.classList.add('product-media-collage__item--highlight-off');
              }
            });
            this.collage.dataset.highlightTimeoutId = setTimeout(() => {
              this.collage.querySelectorAll('.product-media-collage__item--highlight-off').forEach((el) => {
                el.classList.remove('product-media-collage__item--highlight-off');
              });
            }, 1200);
          }
        }
      }
    }

    this.mediaLists.forEach((list) => {
      list.forEach((mediaItem) => {
        if (mediaItem.dataset.mediaId === strMediaId) {
          mediaItem.classList.add('is-active');
          const carousel = mediaItem.closest('carousel-slider');
          if (carousel && carousel.offsetParent) {
            carousel.scrollToElement(mediaItem);
          }
        } else {
          mediaItem.classList.remove('is-active');
        }
      });
    });

    // play media
    window.pauseAllMedia();
    if (mediaEl) {
      // deferred
      const deferredMedia = mediaEl.querySelector('deferred-media, product-model');
      if (deferredMedia) deferredMedia.loadContent(true);

      // video tag
      const playableMedia = mediaEl.querySelector('video');
      if (playableMedia) {
        playableMedia.play();
      }
    }

    // set model ID
    if (this.xrButton && this.mediaIsModel(mediaId)) {
      this.xrButton.dataset.shopifyModel3dId = mediaId;
    }

    document.dispatchEvent(
      new CustomEvent('on:media-gallery:change', { bubbles: true, cancelable: false })
    );
  }

  /**
   * Check if media is a 3D model
   * @param {number} mediaId - Media ID to check.
   * @returns {boolean} - If it is a 3D model.
   */
  mediaIsModel(mediaId) {
    return !!this.querySelector(`.product-media--model[data-model-id="${mediaId}"]`);
  }

  selectThumbnail(evt, thumbnail) {
    evt.preventDefault();
    this.setActiveMedia(thumbnail.parentNode.dataset.mediaId, true);
  }

  selectMainMedia(evt) {
    if (evt.detail.slide.dataset.mediaId) {
      this.setActiveMedia(evt.detail.slide.dataset.mediaId, false);
    }
  }
};

window.customElements.define('media-gallery', MediaGallery);

/* eslint-disable max-len */
/* eslint-disable no-multiple-empty-lines */
const ProductForm = class extends HTMLElement {
  constructor() {
    super();

    this.form = this.querySelector('.js-product-form');
    if (this.form) {
      const idInput = this.form.querySelector('[name="id"]');
      idInput.required = true;

      if (theme.settings.afterAddToCart !== 'no-js') {
        this.submitBtn = this.querySelector('[name="add"]');
        this.form.addEventListener('submit', this.handleSubmit.bind(this));
      }
    }
  }

  /**
   * Handles submission of the product form.
   * @param {object} evt - Event object.
   */
  async handleSubmit(evt) {
    evt.preventDefault();
    if (this.submitBtn.getAttribute('aria-disabled') === 'true') return;

    this.setErrorMsgState();

    const formValid = this.validate();
    if (!formValid) return;

    // Disable "Add to Cart" button until submission is complete.
    this.submitBtn.setAttribute('aria-disabled', 'true');
    this.submitBtn.classList.add('is-loading');

    const formData = new FormData(this.form);
    const sectionsToUpdate = ['page-header', 'cart-drawer'].map((sel) => document.querySelector(sel)).filter((el) => el);
    const sectionIds = sectionsToUpdate.map((el) => el.dataset.sectionId);

    formData.append('sections_url', window.location.pathname);
    formData.append('sections', sectionIds.join(','));

    const fetchRequestOpts = {
      method: 'POST',
      headers: {
        Accept: 'application/javascript',
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: formData
    };

    try {
      const response = await fetch(theme.routes.cartAdd, fetchRequestOpts);
      const data = await response.json();
      let error = typeof data.description === 'string' ? data.description : data.message;
      if (data.errors && typeof data.errors === 'object') {
        error = Object.entries(data.errors).map((item) => item[1].join(', '));
      }
      if (data.status) this.setErrorMsgState(error);
      if (!response.ok) throw new Error(response.status);

      if (document.querySelector('.template-cart')) {
        // Cart page
        const cartForm = document.querySelector('cart-form');
        if (cartForm && cartForm.enableAjaxUpdate) {
          cartForm.refresh();
        }
      } else if (theme.settings.afterAddToCart === 'page') {
        // Allow the tick animation to complete
        setTimeout(() => {
          window.location.href = theme.routes.cart;
        }, 300);
      } else {
        if (data.sections && sectionsToUpdate.length === Object.keys(data.sections).length) {
          sectionsToUpdate.forEach((el) => {
            el.updateFromCartChange(data.sections[el.dataset.sectionId]);
          });
        } else {
          // Unexpected null section return has been observed
          this.dispatchEvent(new CustomEvent('on:cart:change', { bubbles: true }));
        }

        if (theme.settings.afterAddToCart === 'notification') {
          const notification = document.getElementById('AddedNotification').content.firstElementChild.cloneNode(true);
          notification.dataset.productTitle = data.product_title;
          let notificationContainer = document.querySelector('.pageheader--sticky');
          if (!notificationContainer) {
            notificationContainer = document.querySelector('body');
          }
          notificationContainer.appendChild(notification);
        } else if (theme.settings.afterAddToCart === 'drawer') {
          document.querySelector('.js-cart-drawer').open(this.submitBtn);
        }
      }

      this.dispatchEvent(new CustomEvent('on:cart:add', {
        bubbles: true,
        detail: {
          variantId: data.variant_id
        }
      }));

      // Re-enable 'Add to Cart' button.
      this.submitBtn.classList.add('is-success');
      this.submitBtn.removeAttribute('aria-disabled');
      setTimeout(() => {
        this.submitBtn.classList.remove('is-loading');
        this.submitBtn.classList.remove('is-success');
      }, 2000);
    } catch (error) {
      console.log(error); // eslint-disable-line
      this.dispatchEvent(new CustomEvent('on:cart:error', {
        bubbles: true,
        detail: {
          error: this.errorMsg.textContent
        }
      }));

      // Cart may change despite error
      this.dispatchEvent(new CustomEvent('on:cart:change', { bubbles: true }));

      // Re-enable 'Add to Cart' button.
      this.submitBtn.classList.remove('is-loading');
      this.submitBtn.classList.remove('is-success');
      this.submitBtn.removeAttribute('aria-disabled');
    }
  }

  /**
   * Shows/hides an error message.
   * @param {string} [error=false] - Error to show a message for.
   */
  setErrorMsgState(error = false) {
    this.errorMsg = this.errorMsg || this.querySelector('.js-form-error');
    if (!this.errorMsg) return;

    this.errorMsg.hidden = !error;
    if (error) {
      this.errorMsg.innerHTML = '';
      const errorArray = Array.isArray(error) ? error : [error];
      errorArray.forEach((err, index) => {
        if (index > 0) this.errorMsg.insertAdjacentHTML('beforeend', '<br>');
        this.errorMsg.insertAdjacentText('beforeend', err);
      });
    }
  }

  /**
   * Validate form & show errors.
   * @returns {boolean} - Is form valid.
   */
  validate() {
    let isAnyValid = true;
    this.querySelectorAll('variant-picker .option-selector').forEach((el) => {
      // Clear prior errors
      let isValid = true;
      el.querySelectorAll('.label__prefix').forEach((label) => label.remove());
      el.querySelectorAll('.label--contains-error').forEach((label) => label.classList.remove('label--contains-error'));

      // Check for errors
      if (el.dataset.selectorType === 'listed') {
        const input = el.querySelector('input');
        const inputIsValid = input.checkValidity();
        if (!inputIsValid) {
          isValid = false;
        }
      } else {
        const selectedOption = el.querySelector('.custom-select .js-option[aria-selected="true"]');
        if (!selectedOption) {
          isValid = false;
        }
      }

      // Show custom message and scroll to it
      if (!isValid) {
        isAnyValid = false;
        const label = el.querySelector('.label');
        label.setAttribute('aria-live', 'polite');
        label.classList.add('label--contains-error');
        const labelPrefix = document.createElement('span');
        labelPrefix.innerText = `${theme.strings.productsProductChooseA} `;
        labelPrefix.className = 'label__prefix';
        label.prepend(labelPrefix);
        theme.scrollToRevealElement(el);
      }
    });

    return isAnyValid;
  }
};

window.customElements.define('product-form', ProductForm);

class ProductInventory extends HTMLElement {
  constructor() {
    super();
    window.initLazyScript(this, this.initLazySection.bind(this));
  }

  initLazySection() {
    this.threshold = parseInt(this.dataset.threshold, 10);
    this.productInventory = this.querySelector('.product-inventory');
    this.inventoryNotice = this.querySelector('.product-inventory__status');
    this.variantInventory = this.getVariantInventory();

    this.closest('.js-product').addEventListener('on:variant:change', this.handleVariantChange.bind(this));
  }

  /**
   * Gets the inventory data for all product variants
   * @returns {?object}
   */
  getVariantInventory() {
    const dataEl = this.querySelector('[type="application/json"]');
    return this.variantInventory || JSON.parse(dataEl.textContent);
  }

  /**
   * Handles a 'change' event on the variant picker element
   * @param {object} evt - Event object
   */
  handleVariantChange(evt) {
    this.updateInventory(
      evt.detail.variant
        ? this.variantInventory.find((v) => v.id === evt.detail.variant.id)
        : null
    );
  }

  /**
   *
   * Updates the inventory notice
   * @param {?object} inventory - the inventory data
   */
  updateInventory(inventory) {
    if (!inventory) {
      this.productInventory.hidden = true;
      return;
    }

    const count = inventory.inventory_quantity;
    const showCount = this.dataset.showInventoryCount === 'always'
      || (
        this.dataset.showInventoryCount === 'low'
        && count <= this.threshold
      );

    let notice = null;
    if (showCount) {
      if (count <= this.threshold) {
        notice = this.dataset.textXLeftLow.replace('[QTY]', count);
      } else {
        notice = this.dataset.textXLeftOk.replace('[QTY]', count);
      }
    } else {
      // eslint-disable-next-line no-lonely-if
      if (count <= this.threshold) {
        notice = this.dataset.textLow;
      } else {
        notice = this.dataset.textOk;
      }
    }

    this.productInventory.classList.toggle('product-inventory--low', count <= this.threshold);
    this.productInventory.classList.toggle('product-inventory--ok', count > this.threshold);
    this.inventoryNotice.innerText = notice;
    this.productInventory.hidden = false;
  }
}

customElements.define('product-inventory', ProductInventory);

if (!customElements.get('quantity-wrapper')) {
  class QuantityWrapper extends HTMLElement {
    connectedCallback() {
      this.addEventListener('click', this.handleClick.bind(this));
    }

    handleClick(evt) {
      const btn = evt.target.closest('[data-quantity]');
      if (btn) {
        evt.preventDefault();
        const input = this.querySelector('[name="quantity"]');
        let change = btn.dataset.quantity === 'up' ? 1 : -1;
        if (input.step) {
          change *= parseInt(input.step, 10);
        }
        input.value = Math.max(1, parseInt(input.value, 10) + change);
        input.dispatchEvent(
          new CustomEvent('change', { bubbles: true, cancelable: false })
        );
      }
    }
  }

  customElements.define('quantity-wrapper', QuantityWrapper);
}

if (theme.settings.quickbuyStyle !== 'off') {
  theme.quickbuy = {
    quickbuyResizeObserver: null,
    init: () => {
      theme.quickbuy.quickbuyResizeObserver = new ResizeObserver((entries) => {
        for (let i = 0; i < entries.length; i += 1) {
          const entry = entries[i];
          if (entry.contentBoxSize || entry.contentRect) {
            theme.quickbuy.debouncedQuickbuyResize(entry.target);
          }
        }
      });

      theme.addDelegateEventListener(document, 'click', '.quickbuy-toggle', (evt, delEl) => {
        const productUrl = delEl.href;

        // Only show dropdown if screen is large enough for it to be useful
        if (window.innerWidth >= 768) {
          evt.preventDefault();

          // cancel current request if one exists
          if (theme.quickbuy.currentRequestAbortController) {
            theme.quickbuy.currentRequestAbortController.abort('Existing request not needed');
          }
          theme.quickbuy.currentRequestAbortController = new AbortController();

          const block = delEl.closest('.product-block');
          const slider = delEl.closest('.collection-slider');
          let detailCont = null;
          let quickbuyCont = null;
          let sliderRow = null;

          // do different things if it's inside a slideshow
          if (slider) {
            sliderRow = slider.closest('.collection-slider-row');
            // slider without detail
            if (!sliderRow.querySelector('.quickbuy-container')) {
              return;
            }
            quickbuyCont = sliderRow.querySelector('.quickbuy-container');
          } else {
            theme.quickbuy.setBlockHeights(block);
            quickbuyCont = block.querySelector('.quickbuy-container');
          }
          detailCont = quickbuyCont.querySelector('.inner');

          // toggle active class on block
          block.classList.toggle('expanded');
          if (block.classList.contains('expanded')) {
            quickbuyCont.dispatchEvent(new CustomEvent('on:quickbuy:before-open', { bubbles: true }));

            // expanding
            if (slider) {
              // if another block is expanded, remove its expanded class
              const otherExpanded = Array.from(slider.querySelectorAll('.product-block.expanded')).filter((el) => el !== block);
              otherExpanded.forEach((el) => el.classList.remove('expanded'));

              // if expanding from empty, set initial detail container height to 0
              if (otherExpanded.length === 0) {
                quickbuyCont.style.height = 0;
              }
            } else {
              // close expanded siblings
              [...block.parentElement.children].forEach((el) => {
                if (el !== block && el.classList.contains('expanded')) {
                  theme.quickbuy.contractDetail(el, true);
                }
              });
            }

            // monitor for contents changing size
            theme.quickbuy.quickbuyResizeObserver.disconnect();
            theme.quickbuy.quickbuyResizeObserver.observe(detailCont);

            // add spinner
            detailCont.innerHTML = '<div class="loading-spinner"></div>';

            // load in content
            fetch(productUrl, {
              method: 'get',
              signal: theme.quickbuy.currentRequestAbortController.signal
            })
              .then((response) => {
                if (!response.ok) {
                  throw new Error(`HTTP error! Status: ${response.status}`);
                }
                return response.text();
              })
              .then((response) => {
                const tmpl = document.createElement('template');
                tmpl.innerHTML = response;
                const newDetail = tmpl.content.querySelector('.quickbuy-content').cloneNode(true);

                // convert to quickbuy content
                newDetail.querySelectorAll('.more').forEach((el) => { el.href = productUrl; });
                newDetail.querySelectorAll('.product-title').forEach((el) => {
                  el.innerHTML = `<a href="">${el.innerHTML}</a>`;
                  el.firstElementChild.href = productUrl;
                });
                newDetail.querySelectorAll('.show-gallery').forEach((el) => {
                  el.classList.remove('show-gallery');
                  el.href = productUrl;
                });
                newDetail.querySelectorAll('.not-in-quickbuy').forEach((el) => { el.remove(); });
                newDetail.querySelectorAll('.only-in-quickbuy').forEach((el) => { el.classList.remove('only-in-quickbuy'); });
                newDetail.querySelectorAll('.sticky-content-container').forEach((el) => { el.classList.remove('sticky-content-container'); });
                newDetail.querySelectorAll('pickup-availability').forEach((el) => { el.remove(); });
                newDetail.querySelectorAll('variant-picker[data-update-url="true"]').forEach((el) => { el.dataset.updateUrl = false; });
                newDetail.querySelectorAll('noscript').forEach((el) => el.remove());

                // enforce thumbnails-under gallery layout
                newDetail.querySelectorAll('.media-gallery .main-image carousel-slider').forEach((el) => { el.classList.remove('mobile-only'); });
                newDetail.querySelectorAll('.product-media-collage').forEach((el) => { el.remove(); });
                newDetail.querySelectorAll('.media-gallery .thumbnails').forEach((el) => { el.classList.remove('mobile-only'); });
                ['media-gallery--layout-carousel-beside', 'media-gallery--layout-columns-1', 'media-gallery--layout-columns-2', 'media-gallery--layout-collage-1', 'media-gallery--layout-collage-2'].forEach((cl) => {
                  newDetail.querySelectorAll(`.${cl}`).forEach((el) => {
                    el.classList.remove(cl);
                    el.classList.add('media-gallery--layout-carousel-under');
                  });
                });

                // add any external resources
                tmpl.content.querySelectorAll('.section-main-product link[rel="stylesheet"]').forEach((el) => {
                  if (!document.querySelector(`link[rel="stylesheet"][href="${el.getAttribute('href')}"]`)) {
                    document.head.insertAdjacentHTML('beforeend', el.outerHTML);
                  }
                });
                tmpl.content.querySelectorAll('.section-main-product script[src]').forEach((el) => {
                  if (!document.querySelector(`script[src="${el.getAttribute('src')}"]`)) {
                    const scr = document.createElement('script');
                    scr.src = el.getAttribute('src');
                    scr.defer = 'defer';
                    document.head.appendChild(scr);
                  }
                });

                detailCont.innerHTML = '';
                detailCont.appendChild(newDetail);

                quickbuyCont.dispatchEvent(new CustomEvent('on:quickbuy:after-open', { bubbles: true }));
              })
              .catch((error) => {
                console.warn(error);
              });

            // enable close button
            const closeButton = quickbuyCont.querySelector('.close-detail');
            closeButton.removeAttribute('tabindex');
            closeButton.removeAttribute('aria-hidden');
            closeButton.addEventListener('click', theme.quickbuy.onCloseClick);

            // Scroll to an appropriate position
            const scrollOffset = -120 - theme.stickyHeaderHeight();
            if (slider) {
              // Simple for a carousel
              window.scrollTo({ top: theme.getOffsetTopFromDoc(quickbuyCont) + scrollOffset, behavior: 'smooth' });
            } else {
              // Grid - calculate where to scroll if quickbuys above this block will collapse
              theme.quickbuy.saveProductGridSpacingData();
              window.scrollTo({ top: parseFloat((block.dataset.qbScrollTo || theme.getOffsetTopFromDoc(quickbuyCont))) + scrollOffset, behavior: 'smooth' });
            }
          } else {
            // Close quick buy
            if (slider) {
              // collapse detail container & empty
              quickbuyCont.style.height = '0px';
              setTimeout(() => {
                if (quickbuyCont.style.height === '0px') {
                  detailCont.innerHTML = '';
                }
              }, parseFloat(
                getComputedStyle(quickbuyCont).transitionDuration
              ) * 1000);
            } else {
              theme.quickbuy.contractDetail(block);
            }

            // scroll to top of closing block, after reflow
            setTimeout(() => {
              window.scrollTo({ top: theme.getOffsetTopFromDoc(block) - theme.stickyHeaderHeight() - 20, behavior: 'smooth' });
            }, 100);

            // disable close button
            const closeButton = quickbuyCont.querySelector('.close-detail');
            closeButton.blur();
            closeButton.setAttribute('tabindex', '-1');
            closeButton.setAttribute('aria-hidden', true);
            closeButton.removeEventListener('click', theme.quickbuy.onCloseClick);
          }
        }
      });
    },

    debouncedQuickbuyResizeTimeoutID: -1,
    debouncedQuickbuyResize: (qbInner) => {
      clearTimeout(theme.quickbuy.debouncedQuickbuyResizeTimeoutID);
      theme.quickbuy.debouncedQuickbuyResizeTimeoutID = setTimeout(() => {
        const qbc = qbInner.closest('.quickbuy-container');
        const block = qbc.closest('.product-block');
        if (block) {
          // use padding in grid
          // also check expanded class in case it's mid close transition
          if (block.classList.contains('expanded')) {
            const targetHeight = qbInner.clientHeight;
            block.style.paddingBottom = `${targetHeight + 20}px`;
            qbc.style.height = `${targetHeight}px`;
          }
        } if (qbInner.childElementCount > 0) {
          // use height in carousel
          // - if not empty (e.g. post-close tidy-up)
          qbc.style.height = `${qbInner.clientHeight}px`;
        }
      }, 100);
    },

    contractDetail: (block, instant) => {
      // Cancel everything
      theme.quickbuy.quickbuyResizeObserver.disconnect();
      clearTimeout(theme.quickbuy.debouncedQuickbuyResizeTimeoutID);

      block.classList.remove('expanded');
      const quickbuyCont = block.querySelector('.quickbuy-container');
      if (instant) {
        quickbuyCont.style.transitionDuration = '0ms';
        block.style.transitionDuration = '0ms';
      }
      quickbuyCont.style.height = 0;
      block.style.paddingBottom = 0;
      // empty .inner after transition
      const msToClose = parseFloat(getComputedStyle(quickbuyCont).transitionDuration) * 1000;
      setTimeout(() => {
        if (quickbuyCont.style.height === '0px') {
          quickbuyCont.querySelector('.inner').innerHTML = '';
        }
        if (instant) {
          quickbuyCont.style.transitionDuration = '';
          block.style.transitionDuration = '';
        }
      }, msToClose);

      quickbuyCont.dispatchEvent(new CustomEvent('on:quickbuy:after-close', { bubbles: true }));
    },

    saveProductGridSpacingData: () => {
      document.querySelectorAll('.product-grid').forEach((el) => {
        const blocks = el.querySelectorAll('.product-block .block-inner');
        if (blocks.length <= 1) return; // Skip for empty colls
        let row = 0;
        let currTop = 0;
        let runningHeight = 0;
        const gutter = parseFloat(getComputedStyle(el).rowGap);
        const listingOffset = theme.getOffsetTopFromDoc(blocks[0]);
        const rowOffsets = [listingOffset];
        blocks.forEach((block, index) => {
          if (block.clientHeight > runningHeight) {
            runningHeight = block.clientHeight;
          }

          const currOffsetTop = theme.getOffsetTopFromDoc(block);
          if (index === 0) {
            currTop = currOffsetTop;
          } else if (currOffsetTop > currTop) {
            row += 1;
            currTop = currOffsetTop;
            rowOffsets.push(gutter + runningHeight + rowOffsets[row - 1]);
            runningHeight = 0;
          }

          block.dataset.gridRow = row;
        });

        blocks.forEach((block) => {
          block.dataset.qbScrollTo = rowOffsets[block.dataset.gridRow] + block.clientHeight;
        });
      });
    },

    setBlockHeights: (block) => {
      // Align product block heights in this row
      const list = block.closest('.product-grid');
      if (!list) return;

      let tallest = 0;
      const blockTop = block.offsetTop;
      const blocksInThisRow = [...list.querySelectorAll('.product-block')].filter((el) => el.offsetTop === blockTop);
      blocksInThisRow.forEach((el) => {
        const elInnerHeight = el.querySelector('.block-inner .block-inner-inner').clientHeight;
        if (elInnerHeight > tallest) tallest = elInnerHeight;
      });
      blocksInThisRow.forEach((el) => {
        el.querySelector('.block-inner').style.setProperty('--qb-block-height', `${tallest}px`);
      });
    },

    onCloseClick: (evt) => {
      evt.preventDefault();
      evt.stopPropagation();
      const slider = evt.target.closest('.collection-slider-row');
      if (slider) {
        slider.querySelector('.product-block.expanded .quickbuy-toggle').dispatchEvent(new CustomEvent('click', { bubbles: true, cancelable: true }));
      } else {
        evt.target.closest('.product-block').querySelector('.quickbuy-toggle').dispatchEvent(new CustomEvent('click', { bubbles: true, cancelable: true }));
      }
    }
  };

  theme.quickbuy.init();
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

const TermsAgreement = class extends HTMLElement {
  connectedCallback() {
    this.delegatedEvent = theme.addDelegateEventListener(document, 'click', '#cartform [name="checkout"], .additional-checkout-buttons input, a[href*="/checkout"]', this.handleFormSubmittingEvent.bind(this));
  }

  disconnectedCallback() {
    document.removeEventListener('click', this.delegatedEvent);
  }

  handleFormSubmittingEvent(evt) {
    if (!this.querySelector('input:checked')) {
      evt.preventDefault();
      theme.showQuickPopup(theme.strings.cartTermsConfirmation, this.querySelector('[type="checkbox"]'));
    }
  }
};

window.customElements.define('terms-agreement', TermsAgreement);

const ToggleTarget = class extends HTMLElement {
  constructor() {
    super();
    this.addEventListener('click', this.toggleOpen.bind(this));
    this.addEventListener('keyup', this.handleKeyUp.bind(this));
    if (this.dataset.toggleCloseLabel) {
      this.dataset.toggleOpenLabel = this.innerHTML;
    }
  }

  /**
   * Handles 'keyup' events on the document.
   * @param {object} evt - Event object.
   */
  handleKeyUp(evt) {
    if (evt.key === 'Enter') this.toggleOpen(evt);
  }

  /**
   * Opens or closes the target element.
   * @param {object} evt - Event object.
   */
  toggleOpen(evt) {
    evt.preventDefault();

    const target = document.querySelector(this.dataset.toggleTarget);
    const transCont = target.querySelector('.toggle-target-container');
    const doCollapse = !target.classList.contains('toggle-target--hidden');
    const transitionDuration = parseFloat(getComputedStyle(target).transitionDuration) * 1000;

    if (!target.classList.contains('toggle-target--in-transition')) {
      if (doCollapse) {
        this.classList.add('toggle-target-toggler--is-hidden');
        target.classList.add('toggle-target--in-transition', 'toggle-target--hiding');
        target.style.height = `${transCont.clientHeight}px`;
        target.style.opacity = 1;

        if (this.dataset.toggleCloseLabel) {
          this.innerHTML = this.dataset.toggleOpenLabel;
        }

        setTimeout(() => {
          target.style.height = 0;
          target.style.opacity = 0;

          setTimeout(() => {
            target.classList.add('toggle-target--hidden');
            target.classList.remove('toggle-target--in-transition', 'toggle-target--hiding');
            target.style.height = '';
            target.style.opacity = '';
          }, transitionDuration);
        }, 10);
      } else {
        this.classList.remove('toggle-target-toggler--is-hidden');
        target.classList.add('toggle-target--in-transition', 'toggle-target--revealing');
        target.style.height = 0;
        target.style.opacity = 0;
        target.style.display = 'block';

        if (this.dataset.toggleCloseLabel) {
          this.innerHTML = this.dataset.toggleCloseLabel;
        }

        setTimeout(() => {
          target.style.height = `${transCont.clientHeight}px`;
          target.style.opacity = 1;

          setTimeout(() => {
            target.classList.remove('toggle-target--hidden', 'toggle-target--in-transition', 'toggle-target--revealing');
            target.style.height = '';
            target.style.opacity = '';
            target.style.display = '';
          }, transitionDuration);
        }, 10);
      }
    }
  }
};

window.customElements.define('toggle-target', ToggleTarget);

class VariantContent extends HTMLElement {
  constructor() {
    super();
    if (this.childElementCount > 0) {
      this.closest('.js-product').addEventListener('on:variant:change', this.handleVariantChange.bind(this));
    }
  }

  /**
   * Handles a 'change' event on the variant picker element
   * @param {object} evt - Event object
   */
  handleVariantChange(evt) {
    [...this.childNodes].filter((el) => el.tagName !== 'SCRIPT').forEach((el) => el.remove());
    this.querySelectorAll(':not(script)').forEach((el) => el.remove());
    const contentToShow = this.querySelector(`[data-variant="${evt.detail.variant ? evt.detail.variant.id : ''}"]`);
    if (contentToShow) {
      this.insertAdjacentHTML('beforeend', contentToShow.innerHTML);
    }
  }
}

customElements.define('variant-content', VariantContent);

const AnnouncementBar = class extends HTMLElement {
  constructor() {
    super();

    this.announcements = this.querySelectorAll('.announcement');
    if (this.announcements.length > 1) {
      this.backgrounds = Array.from(this.querySelectorAll('.announcement-bg'));
      this.changeDelay = 5000;
      this.currentAnnouncement = 0;
      this.querySelector('.announcement-bar__middle').addEventListener('focusin', this.pauseAnnouncements.bind(this));
      this.querySelector('.announcement-bar__middle').addEventListener('focusout', this.playAnnouncements.bind(this));
      this.querySelector('.announcement-button--previous').addEventListener('click', this.previousAnnouncement.bind(this));
      this.querySelector('.announcement-button--next').addEventListener('click', this.nextAnnouncement.bind(this));
      this.observer = new IntersectionObserver(this.handleIntersect.bind(this));
      this.observer.observe(this);
    }
  }

  handleIntersect(entries) {
    entries.forEach((entry) => {
      if (entry.target === this) {
        if (entry.isIntersecting) {
          this.playAnnouncements(this);
        } else {
          this.pauseAnnouncements(this);
        }
      }
    });
  }

  playAnnouncements() {
    if (this.announcements.length > 1) {
      this.announcementInterval = setInterval(() => {
        this.setCurrentAnnouncement(this.currentAnnouncement + 1);
      }, this.changeDelay);
    }
  }

  pauseAnnouncements() {
    if (this.announcementInterval) {
      clearInterval(this.announcementInterval);
    }
  }

  setCurrentAnnouncement(newIndex) {
    this.currentAnnouncement = Math.abs(newIndex % this.announcements.length);
    this.announcements.forEach((announcement, index) => {
      const background = this.backgrounds.find((bg) => bg.dataset.index === index.toString());
      if (index !== this.currentAnnouncement) {
        announcement.classList.add('announcement--inactive');
        if (background) {
          background.classList.remove('is-active');
        }
      } else {
        announcement.classList.remove('announcement--inactive');
        if (background) {
          background.classList.add('is-active');
        }
      }
    });

    const headingColor = this.announcements[this.currentAnnouncement].style.getPropertyValue('--heading-color');
    const textColor = this.announcements[this.currentAnnouncement].style.getPropertyValue('--text-color');
    const linkColor = this.announcements[this.currentAnnouncement].style.getPropertyValue('--link-color');
    if (headingColor) {
      this.style.setProperty('--heading-color', headingColor);
    }
    if (textColor) {
      this.style.setProperty('--text-color', textColor);
    }
    if (linkColor) {
      this.style.setProperty('--link-color', linkColor);
    }
  }

  previousAnnouncement() {
    this.setCurrentAnnouncement(this.currentAnnouncement - 1);
  }

  nextAnnouncement() {
    this.setCurrentAnnouncement(this.currentAnnouncement + 1);
  }
};

window.customElements.define('announcement-bar', AnnouncementBar);

/*
  If the following conditions are met:
  1. This section directly follows the header
  2. This section is set to be full page height

  Then:
  If the header is transparent, subtract the height of messages and announcement bar.
  If the header if not transparent, subtract the height of the header.
*/

const ImageWithTextOverlay = class extends HTMLElement {
  constructor() {
    super();

    this.fullHeightContainer = this.classList.contains('height--full') ? this : this.querySelector('.height--full');

    if (this.fullHeightContainer) {
      if (this.closest('.shopify-section').previousElementSibling) return;
      const ph = document.querySelector('.pageheader');
      if (!ph) {
        this.fullHeightContainer.classList.add('height--full-ignore-header-height');
        return;
      }

      const thisOffsetTop = theme.getOffsetTopFromDoc(this);
      const phOffsetTop = theme.getOffsetTopFromDoc(ph);
      if (phOffsetTop - 5 > thisOffsetTop) { // Must be lower. For trans header, it'll roughly match
        this.fullHeightContainer.classList.add('height--full-ignore-header-height');
        return;
      }

      this.fullHeightContainer.classList.add('height--full-minus-header-height');
      this.checkForHeaderHeightSubtraction();

      const handleResize = debounce(this.checkForHeaderHeightSubtraction.bind(this), 300);
      this.resizeObserver = new ResizeObserver((entries) => {
        for (let i = 0; i < entries.length; i += 1) {
          const entry = entries[i];
          if (entry.contentBoxSize || entry.contentRect) {
            handleResize();
          }
        }
      });
      this.resizeObserver.observe(this);
    }
  }

  checkForHeaderHeightSubtraction() {
    let height = window.innerHeight;
    // transparent header & top section? slightly different calculation
    if (document.querySelector('.pageheader--transparent-permitted') && !this.closest('.shopify-section').previousElementSibling) {
      document.querySelectorAll('.section-store-messages, .section-announcement-bar').forEach((el) => {
        height -= el.clientHeight;
      });
    } else {
      height -= document.querySelector('.section-header').clientHeight;
    }
    this.fullHeightContainer.style.setProperty('--image-height', `${height}px`);
  }
};

window.customElements.define('image-with-text-overlay', ImageWithTextOverlay);

const PageHeader = class extends HTMLElement {
  constructor() {
    super();

    // Search (delegate event as contents may update with cart changes)
    const mainSearch = this.querySelector('.main-search');
    if (mainSearch) {
      theme.addDelegateEventListener(this, 'click', '.show-search-link', (evt) => {
        evt.preventDefault();
        theme.manuallyLoadImages(mainSearch);
        document.body.classList.add('show-search');
        setTimeout(() => {
          this.querySelector('.main-search__input').focus();
        }, 500);
      });
    }

    // Navigation
    theme.inlineNavigationCheck();

    // Reveal cart drawer
    if (theme.settings.cartType === 'drawer' && document.querySelector('.js-cart-drawer') && this.querySelector('.cart-link')) {
      theme.addDelegateEventListener(this, 'click', '.cart-link', (evt) => {
        evt.preventDefault();
        document.querySelector('.js-cart-drawer').open(evt.target);
      });
    }

    // Init mobile nav again if it's open and this is a reload
    if (window.Shopify.designMode && document.body.classList.contains('reveal-mobile-nav')) {
      theme.openMobileNav();
    }

    // Preload images after any interaction
    this.preloadOnFirstInteraction = () => {
      theme.manuallyLoadImages(this);
      this.removeEventListener('mouseenter', this.preloadOnFirstInteraction);
      this.removeEventListener('touchstart', this.preloadOnFirstInteraction);
      this.removeEventListener('keydown', this.preloadOnFirstInteraction);
    };

    this.addEventListener('mouseenter', this.preloadOnFirstInteraction);
    this.addEventListener('touchstart', this.preloadOnFirstInteraction);
    this.addEventListener('keydown', this.preloadOnFirstInteraction);

    // Preload all images after a delay
    setTimeout(() => this.preloadOnFirstInteraction(), 5000);
  }

  connectedCallback() {
    this.section = document.querySelector('.section-header');
    this.transparentPageheader = document.querySelector('.pageheader--transparent-permitted');

    this.setTransparency();
    this.setSticky();
    this.setHeaderHeightProperty();

    window.addEventListener('scroll', this.afterScroll.bind(this));

    this.refreshHeader = () => {
      fetch(`${window.location.origin}?sections=header`)
        .then((response) => response.json())
        .then((data) => {
          const template = document.createElement('template');
          template.innerHTML = data.header;
          const selectorsForRefresh = ['#pageheader .logo-area__right__inner .cart-link .cart-link__icon .cart-link__count'];
          for (let i = 0; i < selectorsForRefresh.length; i += 1) {
            const newEl = template.content.querySelector(selectorsForRefresh[i]);
            const currentEl = this.querySelector(selectorsForRefresh[i]);
            currentEl.innerHTML = newEl.innerHTML;
          }
        });
    };
    document.addEventListener('on:cart:change', this.refreshHeader);

    const debouncedAfterResize = debounce(this.afterResize.bind(this), 300);
    this.resizeObserver = new ResizeObserver((entries) => {
      for (let i = 0; i < entries.length; i += 1) {
        const entry = entries[i];
        if (entry.contentBoxSize || entry.contentRect) {
          debouncedAfterResize();
        }
      }
    });
    this.resizeObserver.observe(this);
  }

  disconnectedCallback() {
    this.resizeObserver.disconnect();
    document.removeEventListener('on:cart:change', this.refreshHeader);
  }

  afterScroll() {
    this.setTransparency();
  }

  afterResize() {
    if (theme.inlineNavigationCheck) {
      theme.inlineNavigationCheck();
    }
    this.setSticky();
    this.setHeaderHeightProperty();
  }

  setTransparency() {
    if (this.transparentPageheader) {
      const bar = document.querySelector('.section-announcement-bar');
      const scrollThreshold = bar ? (bar.offsetTop + bar.clientHeight) : 0;
      if (!this.isSticky || window.scrollY <= scrollThreshold) {
        this.transparentPageheader.classList.add('pageheader--transparent');
      } else {
        this.transparentPageheader.classList.remove('pageheader--transparent');
      }
    }
  }

  setSticky() {
    this.isSticky = getComputedStyle(this.section).position === 'sticky' || getComputedStyle(this.section).position === '-webkit-sticky';
  }

  setHeaderHeightProperty() {
    let headerHeight = 0;
    let stickyHeaderHeight = 0;

    if (this.section) {
      headerHeight = Math.ceil(this.section.clientHeight);

      if (this.isSticky) {
        stickyHeaderHeight = headerHeight;
      }
    }

    document.documentElement.style.setProperty('--theme-header-height', `${headerHeight}px`);
    document.documentElement.style.setProperty('--theme-sticky-header-height', `${stickyHeaderHeight}px`);
  }

  updateFromCartChange(html) {
    const selectorForUpdate = '.logo-area__right';
    const template = document.createElement('template');
    template.innerHTML = html;

    const elToUpdate = this.querySelector(selectorForUpdate);
    if (elToUpdate) {
      elToUpdate.innerHTML = template.content.querySelector(selectorForUpdate).innerHTML;
    }
  }
};

window.customElements.define('page-header', PageHeader);

const RelatedCollectionLinkButtons = class extends HTMLElement {
  constructor() {
    super();

    const handleResize = debounce(this.truncateButtons.bind(this), 300);
    this.resizeObserver = new ResizeObserver((entries) => {
      for (let i = 0; i < entries.length; i += 1) {
        const entry = entries[i];
        if (entry.contentBoxSize || entry.contentRect) {
          handleResize();
        }
      }
    });
    this.resizeObserver.observe(this);

    this.truncateButtons();
  }

  truncateButtons() {
    if (getComputedStyle(this).display === 'flex') {
      const limit = 4;
      const btns = this.querySelectorAll('.btn');
      if (btns.length > limit && !this.querySelector('.related-collection-links__expander')) {
        Array.from(btns).slice(limit - 1).forEach((el) => el.classList.add('hidden'));
        const expander = document.createElement('a');
        expander.className = 'btn btn--tertiary related-collection-links__expander';
        expander.href = '#';
        expander.innerText = this.dataset.expanderBtnText;
        expander.addEventListener('click', (evt) => {
          evt.preventDefault();
          this.resizeObserver.disconnect();
          [...evt.currentTarget.parentElement.children].forEach((el) => el.classList.remove('hidden'));
          evt.currentTarget.remove();
        });
        this.insertAdjacentElement('beforeend', expander);
      }
    } else {
      const expander = this.querySelector('.related-collection-links__expander');
      if (expander) {
        [...expander.parentElement.children].forEach((el) => el.classList.remove('hidden'));
        expander.remove();
      }
    }
  }
};

window.customElements.define('related-collection-link-buttons', RelatedCollectionLinkButtons);

window.initLazyScript = initLazyScript;

if (!theme.Shopify) theme.Shopify = {};
try {
  theme.Shopify.features = JSON.parse(document.documentElement.querySelector('#shopify-features').textContent);
} catch (e) {
  theme.Shopify.features = {};
}

document.addEventListener('DOMContentLoaded', () => {
  // Smooth scroll to an internal link
  const internalLinksSmoothScroll = (evt) => {
    const link = evt.target.tagName === 'A' ? evt.target : evt.target.closest('a');
    if (link && link.getAttribute('href') && link.getAttribute('href').length > 1 && link.getAttribute('href')[0] === '#') {
      const target = document.querySelector(link.getAttribute('href'));
      if (target && target.offsetParent) {
        evt.preventDefault();
        theme.scrollToRevealElement(target);
      }
    }
  };

  if (theme.settings.internalLinksSmoothScroll) {
    document.addEventListener('click', internalLinksSmoothScroll);
  }

  // Enable focus outlines after using the tab key, and remove scroll internal link scroll handler
  const tabCheck = (evt) => {
    if (evt.code === 'Tab') {
      document.body.classList.add('tab-used');
      document.removeEventListener('keydown', tabCheck);
      document.removeEventListener('click', internalLinksSmoothScroll);
    }
  };
  document.addEventListener('keydown', tabCheck);

  // Opening links in a new tab
  if (theme.settings.externalLinksNewTab) {
    document.addEventListener('click', (evt) => {
      const link = evt.target.tagName === 'A' ? evt.target : evt.target.closest('a');
      if (link && link.href && link.tagName === 'A' && window.location.hostname !== new URL(link.href).hostname) {
        link.target = '_blank';
      }
    });
  }

  // Mobile nav
  theme.addDelegateEventListener(document, 'click', '.mobile-nav-toggle', (evt) => {
    evt.preventDefault();
    if (document.body.classList.contains('enable-mobile-nav-transition')) {
      // hide nav
      document.body.classList.remove('reveal-mobile-nav', 'reveal-mobile-nav--revealed');
      setTimeout(() => {
        document.body.classList.remove('enable-mobile-nav-transition');
      }, 750);
    } else {
      // show nav
      theme.openMobileNav();
    }
  });

  theme.openMobileNav = () => {
    document.body.classList.add('enable-mobile-nav-transition');
    setTimeout(() => {
      document.body.classList.add('reveal-mobile-nav');

      // after reveal, add class
      const cs = getComputedStyle(document.querySelector('.mobile-navigation-drawer .navigation__tier-1 > .navigation__item > .navigation__link'));
      const delayS = parseFloat(cs.transitionDelay.split(',')[0]) + parseFloat(cs.transitionDuration.split(',')[0]);
      setTimeout(() => {
        document.body.classList.add('reveal-mobile-nav--revealed');
      }, delayS * 1000);

      // restore all disabled images
      theme.manuallyLoadImages(document.querySelector('.mobile-navigation-drawer'));
    }, 10);
  };

  // Window shade
  const shade = document.querySelector('.page-shade');
  if (shade) {
    shade.addEventListener('click', (evt) => {
      evt.preventDefault();
      document.body.classList.remove('reveal-mobile-nav', 'show-search');
      setTimeout(() => {
        document.body.classList.remove('enable-mobile-nav-transition');
      }, 750);
    });
  }
});

window.onpageshow = () => {
  fetch(`${theme.routes.cart}.js`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json'
    }
  })
    .then((response) => {
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      return response.json();
    })
    .then(async (data) => {
      const { items } = data;
      const cartString = items.map((item) => `${item.key}|${item.quantity}`).join(',');
      const cartUint8 = new TextEncoder().encode(cartString);
      const cartHashBuffer = await crypto.subtle.digest('SHA-256', cartUint8);
      const cartHashArray = Array.from(new Uint8Array(cartHashBuffer));
      const cartHashHex = cartHashArray.map((x) => x.toString(16).padStart(2, '0')).join('');
      const cartHash = cartHashHex.toString();
      const cartHashFromDom = document.querySelector('.cart-link').dataset.hash;
      if (cartHash !== cartHashFromDom) {
        document.dispatchEvent(
          new CustomEvent('on:cart:change', { bubbles: true, cancelable: false })
        );
      }
    })
    .catch((error) => {
      // eslint-disable-next-line no-console
      console.log(error.message);
    });
};
