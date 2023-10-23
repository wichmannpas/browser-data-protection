import KeyStore, { KeyAgreementKeyPair, PasswordKey, StoredKey, SymmetricKey } from "./KeyStore"
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
  othersPublicKey?: KeyAgreementKeyPair
  ownPublicKeyId?: string
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
   * Encrypt a plaintext using the options of this field and the provided key, returning the ciphertext.
   * Does not store the plaintext.
   * Called from the browser action popup.
   */
  async encryptNewValue(plaintext: string, key: StoredKey, keyStore: KeyStore): Promise<string> {
    switch (this.options.protectionMode) {
      case 'symmetric':
        return await keyStore.encryptWithSymmetricKey(plaintext, key as SymmetricKey, this.origin)
      case 'password':
        return await keyStore.encryptWithPasswordKey(plaintext, key as PasswordKey, this.origin)
      default:
        throw new Error(`Invalid protectionMode '${this.options.protectionMode}'`)
    }
  }

  /**
   * Updates the ciphertextValue on this field. Can be used to clear the value.
   * Propagates the change to the content script.
   * Called from the browser action popup.
   */
  async propagateNewValue(value: string | null) {
    this.ciphertextValue = value

    // Send message to the API script.
    if (this.fieldTabId === null) {
      throw new Error(`InternalProtectedField ${this.fieldId} has no tabId`)
    }
    await chrome.scripting.executeScript({
      func: (fieldId: number, ciphertextValue: string | null) => {
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
   * Propagates to the service worker.
   */
  async setCiphertextValue(ciphertextValue: string) {
    this.ciphertextValue = ciphertextValue
    this.sendMessage({
      operation: 'setFieldCiphertext',
      ciphertextValue,
    })
  }

  /**
   * Set a ciphertext value for this field.
   * Called from the content script upon receiving a request from the web application.
   * Propagates to the service worker.
   */
  async setPublicKeyData(othersPublicKey: string, ownPublicKeyId?: string) {
    try {
      this.othersPublicKey = await (new KeyStore()).loadOthersKeyAgreementPublicKey(othersPublicKey)
    } catch {
      console.warn('Invalid (other\'s) public key received.')
    }
    this.ownPublicKeyId = ownPublicKeyId
    this.sendMessage({
      operation: 'setPublicKeyData',
      othersPublicKey,
      ownPublicKeyId,
    })
  }

  /**
   * Propagate a generated public key for key agreement to this field.
   * Propagates the key to the content script.
   * Called from the browser action popup.
   */
  async propagateKeyAgreementPublicKey(publicKey: string, publicKeyId: string) {
    this.ownPublicKeyId = publicKeyId

    // Send message to the API script.
    if (this.fieldTabId === null) {
      throw new Error(`InternalProtectedField ${this.fieldId} has no tabId`)
    }
    await chrome.scripting.executeScript({
      func: (fieldId: number, publicKey: string, publicKeyId: string) => {
        // @ts-expect-error
        window._bdp_internal_message({
          operation: 'providePublicKey',
          fieldId,
          publicKey,
          publicKeyId,
        })
      },
      args: [this.fieldId, publicKey, publicKeyId],
      target: {
        tabId: this.fieldTabId,
      },
      world: 'MAIN'
    })

    // Send message to service worker (tab state)
    chrome.runtime.sendMessage({
      context: 'bdp',
      operation: 'updateOwnPublicKeyId',
      tabId: this.fieldTabId,
      fieldId: this.fieldId,
      ownPublicKeyId: publicKeyId,
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