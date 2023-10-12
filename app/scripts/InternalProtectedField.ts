import KeyStore, { StoredKey, UserOnlyKey } from "./KeyStore"
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
  fieldTabId: number | null = null

  constructor(fieldId: number, origin: string, element: HTMLElement, options: ProtectedFieldOptions, ciphertextValue: null | string = null) {
    this.fieldId = fieldId
    this.origin = origin
    this.element = element
    this.options = options
    this.ciphertextValue = ciphertextValue
  }

  sendFieldCreated() {
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
   * Propagates the change to the content script.
   * Called from the browser action popup.
   */
  async encryptNewValue(plaintext: string, key: StoredKey, keyStore: KeyStore) {
    switch (this.options.protectionMode) {
      case 'user-only':
        this.ciphertextValue = await keyStore.encryptWithUserOnlyKey(plaintext, key as UserOnlyKey, this.origin)
        break
      default:
        throw new Error(`Invalid protectionMode '${this.options.protectionMode}'`)
    }

    // Send message to the API script.
    if (this.fieldTabId === null) {
      throw new Error(`InternalProtectedField ${this.fieldId} has no tabId`)
    }
    await chrome.scripting.executeScript({
      func: (fieldId: number, ciphertextValue: string) => {
        // @ts-expect-error
        window._bdp_internal_message({
          operation: 'updateCiphertext',
          fieldId,
          ciphertextValue,
        })
      },
      args: [this.fieldId, this.ciphertextValue],
      target: {
        tabId: this.fieldTabId,
      },
      world: 'MAIN'
    })

    // Send message to service worker (tab state)
    chrome.runtime.sendMessage({
      context: 'bdp',
      operation: 'updateCiphertext',
      tabId: this.fieldTabId,
      fieldId: this.fieldId,
      ciphertextValue: this.ciphertextValue,
    })
  }

  /**
   * Set a ciphertext value for this field.
   * Called from the content script upon receiving a request from the web application.
   */
  async setCiphertextValue(ciphertextValue: string) {
    this.ciphertextValue = ciphertextValue
    this.sendMessage({
      operation: 'setFieldCiphertext',
      ciphertextValue,
    })
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