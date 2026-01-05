if (!customElements.get('responsive-table')) {
  class ResponsiveTable extends HTMLElement {
    connectedCallback() {
      this.querySelector('.responsive-table').addEventListener('click', ResponsiveTable.handleClick);
    }

    static handleClick(evt) {
      const head = evt.target.closest('.responsive-table__cell-head');
      if (head && getComputedStyle(head.closest('.responsive-table')).display === 'block') {
        evt.preventDefault();
        head.closest('tr').classList.toggle('expanded');
      }
    }
  }

  customElements.define('responsive-table', ResponsiveTable);
}
