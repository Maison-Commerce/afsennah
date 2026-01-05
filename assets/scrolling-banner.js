if (!customElements.get('scrolling-banner')) {
  const ScrollingBanner = class extends HTMLElement {
    constructor() {
      super();
      window.initLazyScript(this, this.init.bind(this));
    }

    init() {
      // Transforms can confuse lazy loading in browsers, so we coordinate loading here
      // Load all countdown timers
      customElements.whenDefined('countdown-timer').then(() => {
        this.querySelectorAll('countdown-timer').forEach((el) => el.init());
      });

      // Load all images
      this.querySelectorAll('img[loading="lazy"]').forEach((el) => {
        el.loading = 'eager';
      });

      // After fonts have loaded
      document.fonts.ready.then(() => this.querySelector('.marquee').classList.add('marquee--animate'));
    }
  };

  window.customElements.define('scrolling-banner', ScrollingBanner);
}
