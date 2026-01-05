if (!customElements.get('added-notification')) {
  const AddedNotification = class extends HTMLElement {
    connectedCallback() {
      this.dismissOthers();
      this.setProductTitle(this.dataset.productTitle);
      this.display();
    }

    disconnectedCallback() {
      clearTimeout(this.delayedDismissTimeout);
    }

    dismissOthers() {
      document.querySelectorAll('.added-notification').forEach((notification) => {
        if (notification !== this) {
          notification.dismiss();
        }
      });
    }

    setProductTitle(productTitle) {
      this.querySelector('.added-notification__message-title').innerText = productTitle;
    }

    display() {
      // reveal
      setTimeout(() => this.classList.remove('added-notification--hidden'), 10);

      // dismiss after a short period of time
      this.delayedDismissTimeout = setTimeout(this.dismiss.bind(this), 6000);

      // add events to internal links
      this.querySelector('.added-notification__close').addEventListener('click', this.dismiss.bind(this));
      if (theme.settings.cartType === 'drawer') {
        const cartLinks = this.querySelectorAll('.added-notification__message-text a[href$="/cart"]');
        cartLinks.forEach((el) => {
          el.addEventListener('click', (evt) => {
            evt.preventDefault();
            document.querySelector('.js-cart-drawer').open(evt.currentTarget);
            this.dismiss();
          });
        });
      }
    }

    dismiss(evt) {
      if (evt) { evt.preventDefault(); }
      this.classList.add('added-notification--dismissed');
      setTimeout(this.remove.bind(this), 2000);
    }
  };

  window.customElements.define('added-notification', AddedNotification);
}
