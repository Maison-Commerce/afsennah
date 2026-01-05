const ccThemeRole = Shopify.theme.role ?? 'unknown';
if (!localStorage.getItem('cc-settings-loaded') || localStorage.getItem('cc-settings-loaded') !== ccThemeRole) {
  fetch('https://check.cleancanvas.co.uk/', {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    method: 'POST',
    mode: 'cors',
    body: new URLSearchParams({
      shop: Shopify.shop,
      theme: theme.info?.name ?? '',
      version: theme.info?.version ?? '',
      role: ccThemeRole,
      contact: document.querySelector('script[src*=theme-editor][data-contact]')?.dataset.contact
    })
  })
    .then((response) => {
      if (response.ok) {
        localStorage.setItem('cc-settings-loaded', ccThemeRole);
      }
    });
}

document.addEventListener('shopify:section:load', (evt) => {
  // Load and evaluate section specific scripts immediately.
  evt.target.querySelectorAll('script[src]').forEach((script) => {
    const s = document.createElement('script');
    s.src = script.src;
    document.body.appendChild(s);
  });

  // If loaded section is a pop-up, open it.
  if (evt.target.matches('.cc-pop-up')) {
    customElements.whenDefined('pop-up').then(() => {
      evt.target.querySelector('pop-up').open();
    });
  }

  if (evt.target.matches('.section-collapsible-tabs')) {
    document.dispatchEvent(
      new CustomEvent('theme:faq-header-update', { bubbles: true, cancelable: false })
    );
  }
});

document.addEventListener('shopify:section:unload', (evt) => {
  if (evt.target.matches('.section-collapsible-tabs')) {
    document.dispatchEvent(
      new CustomEvent('theme:faq-header-update', { bubbles: true, cancelable: false })
    );
  }
});

document.addEventListener('shopify:section:reorder', (evt) => {
  if (evt.target.matches('.section-faq-header')) {
    evt.target.querySelector('faq-header').debouncedBuildIndex();
  }

  if (evt.target.matches('.section-collapsible-tabs')) {
    document.dispatchEvent(
      new CustomEvent('theme:faq-header-update', { bubbles: true, cancelable: false })
    );
  }
});

document.addEventListener('shopify:block:select', (evt) => {
  // If menu promotion, show it
  if (evt.target.matches('.navigation__column--promotion')) {
    evt.target.closest('.navigation__item').dispatchEvent(new Event('mouseenter'));
  }
  if (evt.target.matches('.navigation__wide-promotion')) {
    evt.target.closest('.navigation__item').dispatchEvent(new Event('mouseenter'));
  }

  // If slideshow slide, show it and pause autoplay (if enabled).
  if (evt.target.matches('.slideshow__slide')) {
    const slideshow = evt.target.closest('slide-show');

    setTimeout(() => {
      slideshow.setActiveSlide(Number(evt.target.dataset.index));
      slideshow.pauseAutoplay();
    }, 200);
  }

  // If selected block is a slider item, scroll to it.
  if (evt.target.matches('.slider__item')) {
    const carousel = evt.target.closest('carousel-slider');
    if (!carousel.slider) return;

    carousel.slider.scrollTo({
      left: carousel.slides[Array.from(carousel.slides).indexOf(evt.target)].offsetLeft,
      behavior: 'smooth'
    });
  }

  // If hotspot, reveal
  if (evt.target.matches('.hotspot')) {
    evt.target.querySelector('button').click();
  }
});

document.addEventListener('shopify:block:deselect', (evt) => {
  // If menu promotion, unfocus it
  if (evt.target.matches('.navigation__column--promotion')) {
    evt.target.closest('.navigation__item').dispatchEvent(new Event('mouseleave'));
  }
  if (evt.target.matches('.navigation__wide-promotion')) {
    evt.target.closest('.navigation__item').dispatchEvent(new Event('mouseleave'));
  }

  // If deselected block is a slideshow slide, resume autoplay (if enabled).
  if (evt.target.matches('.slideshow__slide')) {
    const slideshow = evt.target.closest('slide-show');

    setTimeout(() => {
      slideshow.resumeAutoplay();
    }, 200);
  }

  // If active hotspot, close
  if (evt.target.matches('.hotspot.is-active')) {
    evt.target.querySelector('button').click();
  }
});

document.addEventListener('shopify:section:select', (evt) => {
  if (evt.target.matches('.section-cart-drawer')) {
    document.dispatchEvent(
      new CustomEvent('dispatch:cart-drawer:open', { bubbles: true, cancelable: false })
    );
  }
});

document.addEventListener('shopify:section:deselect', (evt) => {
  if (evt.target.matches('.section-cart-drawer')) {
    document.dispatchEvent(
      new CustomEvent('dispatch:cart-drawer:close', { bubbles: true, cancelable: false })
    );
  }
});

document.addEventListener('shopify:block:select', (evt) => {
  // If selected block is an announcement, pause autoplay and show it.
  if (evt.target.matches('.announcement')) {
    const index = Array.prototype.indexOf.call(evt.target.parentElement.children, evt.target);
    evt.target.closest('announcement-bar').pauseAnnouncements();
    evt.target.closest('announcement-bar').setCurrentAnnouncement(index);
  }
});

document.addEventListener('shopify:block:deselect', (evt) => {
  // If selected block is an announcement, resume autoplay.
  if (evt.target.matches('.announcement')) {
    evt.target.closest('announcement-bar').playAnnouncements();
  }
});

// Debug out custom events
const customEvents = [
  'on:variant:change',
  'on:cart:add',
  'on:cart:error',
  'on:cart:after-merge',
  'on:cart-drawer:before-open',
  'on:cart-drawer:after-open',
  'on:cart-drawer:after-close',
  'on:quickbuy:before-open',
  'on:quickbuy:after-open',
  'on:quickbuy:after-close',
  'dispatch:cart-drawer:open',
  'dispatch:cart-drawer:refresh',
  'dispatch:cart-drawer:close',
  'on:debounced-resize',
  'on:breakpoint-change'
];
customEvents.forEach((event) => {
  document.addEventListener(event, (evt) => {
    if (event.includes('dispatch:cart-drawer') && theme.settings.cartType !== 'drawer') {
      // eslint-disable-next-line
      console.warn(
        'The Cart Drawer is not enabled. To enable it, change Theme Settings > Cart > Cart type.'
      );
    } else {
      // eslint-disable-next-line
      console.info(
        '%cTheme event triggered',
        'background: #000; color: #bada55',
        event,
        evt.detail
      );
    }
  });
});
