import { ProtectedFieldOptions } from "./ProtectedFieldOptions";

/**
 * Content script injected into the MAIN world (i.e., the web application) at document_start.
 * Consequently, this script does not get access to any sensitive data, as it can be manipulated by the web application's code.
 */
(function () {
  const VALID_OPTIONS = {
    protectionMode: [
      'symmetric',
      'password',
      'recipient',
    ],
    // distribution mode and the protection modes that are allowed to use it
    distributionMode: [
      {
        mode: 'user-only',
        protectionModes: ['symmetric'],
      },
      {
        mode: 'external',
        protectionModes: ['symmetric', 'recipient'],
      },
      {
        mode: 'direct-plain',
        protectionModes: ['recipient'],
      },
      {
        mode: 'key-agreement',
        protectionModes: ['symmetric'],
      },
    ]
  }

  class ProtectedField {
    #fieldId: number
    #options: ProtectedFieldOptions
    #ciphertextValue: null | string
    #ciphertextChangedCallback?: (ciphertext: string | null) => void
    #publicKeyProvidedCallback?: (publicKey: string, publicKeyId: string) => void

    constructor(fieldId: number, options: any) {
      this.#fieldId = fieldId
      this.#options = Object.assign(Object.create(null), options)
      if (this.#options.ciphertextChangedCallback !== undefined) {
        this.#ciphertextChangedCallback = this.#options.ciphertextChangedCallback
        delete this.#options.ciphertextChangedCallback
      }
      if (this.#options.publicKeyProvidedCallback !== undefined) {
        this.#publicKeyProvidedCallback = this.#options.publicKeyProvidedCallback
        delete this.#options.publicKeyProvidedCallback
      }
      this.#ciphertextValue = null

      this.#validateOptions()
    }

    get options(): ProtectedFieldOptions {
      return Object.assign(Object.create(null), this.#options)
    }

    get ciphertextValue(): string | null {
      return this.#ciphertextValue
    }

    /**
     * Provide the public key of the other party for this field.
     * Also, if already generated before, provide the public key id of this party again to the web application to allow for an unambiguous key derivation.
     */
    providePublicKey(othersPublicKey: string, ownPublicKeyId?: string) {
      if (this.#options.distributionMode !== 'key-agreement') {
        throw new Error(`ProtectedField ${this.#fieldId}: providePublicKey is only supported for key-agreement distribution mode, where the other parties' public key may be provided asynchronously.`)
      }

      window.postMessage({
        context: 'bdp',
        operation: 'provideFieldPublicKey',
        othersPublicKey,
        ownPublicKeyId,
        fieldId: this.#fieldId,
      })
    }

    /**
     * Update the ciphertext value, not caused by the web application.
     * If provided, the callback of this field is executed.
     */
    _updateCiphertextValue(ciphertextValue: string | null) {
      this.#ciphertextValue = ciphertextValue
      if (this.#ciphertextChangedCallback !== undefined) {
        this.#ciphertextChangedCallback(ciphertextValue)
      }
    }

    /**
     * Provide a public key for this field.
     */
    _providePublicKey(publicKey: string, publicKeyId: string) {
      if (this.#publicKeyProvidedCallback !== undefined) {
        this.#publicKeyProvidedCallback(publicKey, publicKeyId)
        return
      }
      console.warn(`ProtectedField ${this.#fieldId} received a public key, but no callback was provided.`)
    }

    #validateOptions() {
      if (this.#options.protectionMode === undefined) {
        throw new Error(`ProtectedField missing required option 'protectionMode'`)
      }
      if (!VALID_OPTIONS.protectionMode.includes(this.#options.protectionMode)) {
        throw new Error(`ProtectedField invalid protectionMode '${this.#options.protectionMode}'`)
      }

      if (this.#options.protectionMode === 'password') {
        if (this.#options.distributionMode !== undefined) {
          throw new Error(`ProtectedField protectionMode '${this.#options.protectionMode}' does not allow a distribution mode`)
        }
      } else {
        if (this.#options.distributionMode === undefined) {
          throw new Error(`ProtectedField missing required option 'distributionMode'`)
        }
        const validCombinations = VALID_OPTIONS.distributionMode.find((x: any) => x.mode === this.#options.distributionMode)
        if (validCombinations === undefined) {
          throw new Error(`ProtectedField invalid distributionMode '${this.#options.distributionMode}'`)
        }
        if (!validCombinations.protectionModes.includes(this.#options.protectionMode)) {
          throw new Error(`ProtectedField invalid combination of protectionMode '${this.#options.protectionMode}' and distributionMode '${this.#options.distributionMode}'`)
        }
      }

      if (this.#options.readOnly === undefined) {
        this.#options.readOnly = false
      }
      if (typeof this.#options.readOnly !== 'boolean') {
        throw new Error(`ProtectedField invalid readOnly '${this.#options.readOnly}'`)
      }

      if (this.#options.updateMode === undefined) {
        this.#options.updateMode = 'immediate'
      }
      if (this.#options.updateMode !== 'immediate' && this.#options.updateMode !== 'on-submit') {
        throw new Error(`ProtectedField invalid updateMode '${this.#options.updateMode}'`)
      }
    }

    /**
     * Set the ciphertext of this field.
     */
    setCiphertext(ciphertext: null | string) {
      this._updateCiphertextValue(ciphertext)
      window.postMessage({
        context: 'bdp',
        operation: 'setFieldCiphertext',
        ciphertext: ciphertext,
        fieldId: this.#fieldId,
      })
    }

    clearCiphertext() {
      this.setCiphertext(null)
    }
  }

  const protectedFields: { [key: number]: ProtectedField } = {}

  function createProtectedField(element: Element, options: any) {
    const fieldId = window.crypto.getRandomValues(new Uint32Array(1))[0]

    if (element.getAttribute('bdp-fieldId') !== null) {
      throw new Error('Element already initialized as a ProtecedField')
    }

    // ProtectedField constructor validates options
    const protectedField = new ProtectedField(fieldId, options)

    element.setAttribute('bdp-fieldId', fieldId.toString())
    element.classList.add('bdpfield')
    element.classList.add(`bdpfield-${fieldId}`)
    window.postMessage({
      context: 'bdp',
      operation: 'createProtectedField',
      options: protectedField.options,
      fieldId
    })

    protectedFields[fieldId] = protectedField
    return protectedField
  }

  // @ts-expect-error
  window._bdp_internal_message = (message: any) => {
    switch (message.operation) {
      case 'updateCiphertext':
        if (protectedFields[message.fieldId] === undefined) {
          throw new Error(`BDP: Unknown fieldId: ${message.fieldId}`)
        }
        protectedFields[message.fieldId]._updateCiphertextValue(message.ciphertextValue)
        break
      case 'providePublicKey':
        if (protectedFields[message.fieldId] === undefined) {
          throw new Error(`BDP: Unknown fieldId: ${message.fieldId}`)
        }
        protectedFields[message.fieldId]._providePublicKey(message.publicKey, message.publicKeyId)
        break
      default:
        throw new Error(`BDP: Unknown operation: ${message.operation}`)
    }
  }

  // @ts-expect-error
  window.browserDataProtection = {
    createProtectedField
  }
})();