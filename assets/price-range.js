if (!customElements.get('price-range')) {
  class PriceRange extends HTMLElement {
    constructor() {
      super();
      this.selectors = {
        inputMin: '.cc-price-range__input--min',
        inputMax: '.cc-price-range__input--max',
        control: '.cc-price-range__control',
        controlMin: '.cc-price-range__control--min',
        controlMax: '.cc-price-range__control--max',
        bar: '.cc-price-range__bar',
        activeBar: '.cc-price-range__bar-active'
      };
      this.controls = {
        min: {
          barControl: this.querySelector(this.selectors.controlMin),
          input: this.querySelector(this.selectors.inputMin)
        },
        max: {
          barControl: this.querySelector(this.selectors.controlMax),
          input: this.querySelector(this.selectors.inputMax)
        }
      };
      this.controls.min.value = parseInt(this.controls.min.input.value === '' ? this.controls.min.input.placeholder : this.controls.min.input.value, 10);
      this.controls.max.value = parseInt(this.controls.max.input.value === '' ? this.controls.max.input.placeholder : this.controls.max.input.value, 10);
      this.valueMin = this.controls.min.input.min;
      this.valueMax = this.controls.max.input.max;
      this.valueRange = this.valueMax - this.valueMin;

      [this.controls.min, this.controls.max].forEach((item) => {
        item.barControl.setAttribute('aria-valuemin', this.valueMin);
        item.barControl.setAttribute('aria-valuemax', this.valueMax);
        item.barControl.setAttribute('tabindex', 0);
      });
      this.controls.min.barControl.setAttribute('role', 'slider');
      this.controls.min.barControl.setAttribute('aria-valuenow', this.controls.min.value);
      this.controls.max.barControl.setAttribute('role', 'slider');
      this.controls.max.barControl.setAttribute('aria-valuenow', this.controls.max.value);

      this.bar = this.querySelector(this.selectors.bar);
      this.activeBar = this.querySelector(this.selectors.activeBar);
      this.inDrag = false;
      this.rtl = document.querySelector('html[dir=rtl]');

      this.bindEvents();
      this.render();
    }

    getPxToValueRatio() {
      const r = this.bar.clientWidth / (this.valueMax - this.valueMin);
      return this.rtl ? -r : r;
    }

    getPcToValueRatio() {
      return 100.0 / (this.valueMax - this.valueMin);
    }

    setActiveControlValue(valueIn) {
      let value = valueIn;
      // only accept valid numbers
      if (Number.isNaN(parseInt(value, 10))) return;

      // clamp & default
      if (this.activeControl === this.controls.min) {
        if (value === '') {
          value = this.valueMin;
        }
        value = Math.min(value, this.controls.max.value - 1);
        value = Math.max(this.valueMin, value);
      } else {
        if (value === '') {
          value = this.valueMax;
        }
        value = Math.max(value, this.controls.min.value + 1);
        value = Math.min(this.valueMax, value);
      }

      // round
      this.activeControl.value = Math.round(value);

      // update input
      if (this.activeControl.input.value !== this.activeControl.value) {
        if (this.activeControl.value === this.activeControl.input.placeholder) {
          this.activeControl.input.value = '';
        } else {
          this.activeControl.input.value = this.activeControl.value;
        }
        this.activeControl.input.dispatchEvent(new CustomEvent('change', { bubbles: true, cancelable: false, detail: { sender: 'theme:component:price_range' } }));
      }

      // a11y
      this.activeControl.barControl.setAttribute('aria-valuenow', this.activeControl.value);
    }

    render() {
      this.drawControl(this.controls.min);
      this.drawControl(this.controls.max);
      this.drawActiveBar();
    }

    drawControl(control) {
      const x = `${((control.value - this.valueMin) * this.getPcToValueRatio())}%`;
      if (this.rtl) {
        control.barControl.style.right = x;
      } else {
        control.barControl.style.left = x;
      }
    }

    drawActiveBar() {
      const s = `${((this.controls.min.value - this.valueMin) * this.getPcToValueRatio())}%`;
      const e = `${((this.valueMax - this.controls.max.value) * this.getPcToValueRatio())}%`;
      if (this.rtl) {
        this.activeBar.style.left = e;
        this.activeBar.style.right = s;
      } else {
        this.activeBar.style.left = s;
        this.activeBar.style.right = e;
      }
    }

    handleControlTouchStart(e) {
      e.preventDefault();
      this.startDrag(e.target, e.touches[0].clientX);
      this.boundControlTouchMoveEvent = this.handleControlTouchMove.bind(this);
      this.boundControlTouchEndEvent = this.handleControlTouchEnd.bind(this);
      window.addEventListener('touchmove', this.boundControlTouchMoveEvent, { passive: true });
      window.addEventListener('touchend', this.boundControlTouchEndEvent);
    }

    handleControlTouchMove(e) {
      this.moveDrag(e.touches[0].clientX);
    }

    handleControlTouchEnd(e) {
      e.preventDefault();
      window.removeEventListener('touchmove', this.boundControlTouchMoveEvent);
      window.removeEventListener('touchend', this.boundControlTouchEndEvent);
      this.stopDrag();
    }

    handleControlMouseDown(e) {
      e.preventDefault();
      this.startDrag(e.target, e.clientX);
      this.boundControlMouseMoveEvent = this.handleControlMouseMove.bind(this);
      this.boundControlMouseUpEvent = this.handleControlMouseUp.bind(this);
      window.addEventListener('mousemove', this.boundControlMouseMoveEvent);
      window.addEventListener('mouseup', this.boundControlMouseUpEvent);
    }

    handleControlMouseMove(e) {
      this.moveDrag(e.clientX);
    }

    handleControlMouseUp(e) {
      e.preventDefault();
      window.removeEventListener('mousemove', this.boundControlMouseMoveEvent);
      window.removeEventListener('mouseup', this.boundControlMouseUpEvent);
      this.stopDrag();
    }

    startDrag(target, startX) {
      if (this.controls.min.barControl === target) {
        this.activeControl = this.controls.min;
      } else {
        this.activeControl = this.controls.max;
      }
      this.dragStartX = startX;
      this.dragStartValue = this.activeControl.value;
      this.inDrag = true;
    }

    moveDrag(moveX) {
      if (this.inDrag) {
        const value = this.dragStartValue + (moveX - this.dragStartX) / this.getPxToValueRatio();
        this.setActiveControlValue(value);
        this.render();
      }
    }

    stopDrag() {
      this.inDrag = false;
    }

    handleControlKeyDown(evt) {
      if (evt.key === 'ArrowRight') {
        this.adjustControlFromKeypress(evt.target, 10.0);
        evt.preventDefault();
      } else if (evt.key === 'ArrowLeft') {
        this.adjustControlFromKeypress(evt.target, -10.0);
        evt.preventDefault();
      } else if (evt.key === 'Home') {
        this.adjustControlFromKeypress(evt.target, false, 'min');
        evt.preventDefault();
      } else if (evt.key === 'End') {
        this.adjustControlFromKeypress(evt.target, false, 'max');
        evt.preventDefault();
      }
    }

    adjustControlFromKeypress(control, pxAmount, minMax) {
      if (this.controls.min.barControl === control) {
        this.activeControl = this.controls.min;
      } else {
        this.activeControl = this.controls.max;
      }
      if (!minMax) {
        this.setActiveControlValue(this.activeControl.value + pxAmount / this.getPxToValueRatio());
      } else if (minMax === 'min') {
        this.setActiveControlValue(this.activeControl.input.min);
      } else {
        this.setActiveControlValue(this.activeControl.input.max);
      }
      this.render();
    }

    handleInputChange(e) {
      // strip out non numeric values
      e.target.value = e.target.value.replace(/\D/g, '');

      if (!e.detail || e.detail.sender !== 'theme:component:price_range') {
        if (this.controls.min.input === e.target) {
          this.activeControl = this.controls.min;
        } else {
          this.activeControl = this.controls.max;
        }
        this.setActiveControlValue(e.target.value);
        this.render();
      }
    }

    static handleInputKeyup(e) {
      // enforce numeric chars in the input
      setTimeout(() => {
        e.target.value = e.target.value.replace(/\D/g, '');
      }, 10);
    }

    bindEvents() {
      [this.controls.min, this.controls.max].forEach((item) => {
        item.barControl.addEventListener('touchstart', this.handleControlTouchStart.bind(this), { passive: false });
        item.barControl.addEventListener('mousedown', this.handleControlMouseDown.bind(this));
        item.barControl.addEventListener('keydown', this.handleControlKeyDown.bind(this));
        item.input.addEventListener('change', this.handleInputChange.bind(this));
        item.input.addEventListener('keyup', PriceRange.handleInputKeyup);
      });
    }
  }

  customElements.define('price-range', PriceRange);
}
