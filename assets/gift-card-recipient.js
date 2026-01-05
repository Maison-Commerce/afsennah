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
