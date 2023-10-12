import { ProtectedFieldOptions } from "./ProtectedFieldOptions";

/**
 * Content script injected into the MAIN world (i.e., the web application) at document_start.
 * Consequently, this script does not get access to any sensitive data, as it can be manipulated by the web application's code.
 */
(function () {
  const VALID_OPTIONS = {
    protectionMode: [
      'user-only',
      'password',
      'symmetric',
      'recipient',
    ],
    // distribution mode and the protection modes that are allowed to use it
    distributionMode: [
      {
        mode: 'local',
        protectionModes: ['user-only'],
      },
      {
        mode: 'direct-plain',
        protectionModes: ['recipient'],
      },
      {
        mode: 'direct-wrapped',
        protectionModes: ['recipient'],
      },
      {
        mode: 'external',
        protectionModes: ['symmetric', 'recipient'],
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
    #ciphertextChangedCallback?: (ciphertext: string) => void

    constructor(fieldId: number, options: any) {
      this.#fieldId = fieldId
      this.#options = Object.assign(Object.create(null), options)
      if (this.#options.ciphertextChangedCallback !== undefined) {
        this.#ciphertextChangedCallback = this.#options.ciphertextChangedCallback
        delete this.#options.ciphertextChangedCallback
      }
      this.#ciphertextValue = null

      this.#validateOptions()
    }

    get options(): ProtectedFieldOptions {
      return Object.assign(Object.create(null), this.#options)
    }

    /**
     * Update the ciphertext value, not caused by the web application.
     * If provided, the callback of this field is executed.
     */
    _updateCiphertextValue(ciphertextValue: string) {
      this.#ciphertextValue = ciphertextValue
      if (this.#ciphertextChangedCallback !== undefined) {
        this.#ciphertextChangedCallback(ciphertextValue)
      }
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
    setCiphertext(ciphertext: string) {
      this.#ciphertextValue = ciphertext
      window.postMessage({
        context: 'bdp',
        operation: 'setFieldCiphertext',
        ciphertext: ciphertext,
        fieldId: this.#fieldId,
      })
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
      default:
        throw new Error(`BDP: Unknown operation: ${message.operation}`)
    }
  }

  // @ts-expect-error
  window.browserDataProtection = {
    createProtectedField
  }
})();