import { StoredKey } from "./KeyStore"
import { ProtectedFieldOptions } from "./ProtectedFieldOptions"

/**
 * Internal version of the protected field. Used in the popup, ISOLATED content, and service worker context.
 * These are NEVER exposed to the main (not isolated) world.
 */
export default class InternalProtectedField {
  fieldId: number
  origin: string
  element: HTMLElement
  options: ProtectedFieldOptions
  ciphertextValue: null | string

  constructor(fieldId: number, origin: string, element: HTMLElement, options: ProtectedFieldOptions, ciphertextValue: null | string = null) {
    this.fieldId = fieldId
    this.origin = origin
    this.element = element
    this.options = options
    this.ciphertextValue = ciphertextValue

    this.sendMessage({
      operation: 'fieldCreated',
    })
  }

  addClickListener() {
    this.element.addEventListener('click', event => {
      this.sendMessage({
        operation: 'closePopup'
      })
      if (this.element.classList.contains('editActive')) {
        this.element.classList.remove('editActive')
        this.sendMessage({
          operation: 'stopEdit',
        })
      } else {
        InternalProtectedField.clearAllActiveFields()
        this.element.classList.add('editActive')
        this.sendMessage({
          operation: 'startEdit',
        })
      }
    })
  }

  /**
   * Encrypt a plaintext using the options of this field and the provided key.
   * Updates the ciphertextValue on this field. Does not store the plaintext.
   */
  encryptNewValue(plaintext: string, key: StoredKey) {
    switch (this.options.protectionMode) {
      case 'user-only':
        break
      default:
        throw new Error(`Invalid protectionMode '${this.options.protectionMode}'`)
        break
    }
  }

  /**
   * Clear (selection of) all active fields.
   */
  static clearAllActiveFields() {
    const allFields = document.getElementsByClassName('bdpfield')
    for (let i = 0; i < allFields.length; i++) {
      allFields[i].classList.remove('editActive')
    }
  }

  private sendMessage(data: object) {
    chrome.runtime.sendMessage(Object.assign({
      context: 'bdp',
      internalProtectedField: this,
    }, data))
  }
}