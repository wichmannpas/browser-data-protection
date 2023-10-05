/**
 * Content script injected into the MAIN world (i.e., the web application) at document_start.
 */
(function () {
  const VALID_OPTIONS = {
    protectionMode: [
      'user-only',
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
        mode: 'direct',
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
    #fieldId = -1
    #options: any = {}

    constructor(fieldId: number, options: any) {
      this.#fieldId = fieldId
      this.#options = Object.assign({}, options)

      this.#validateOptions()
    }

    #validateOptions() {
      if (this.#options.protectionMode === undefined) {
        throw new Error(`ProtectedField missing required option 'protectionMode'`)
      }
      if (!VALID_OPTIONS.protectionMode.includes(this.#options.protectionMode)) {
        throw new Error(`ProtectedField invalid protectionMode '${this.#options.protectionMode}'`)
      }

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
  }

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
      options,
      fieldId
    })

    return protectedField
  }

  // @ts-expect-error
  window.browserDataProtection = {
    createProtectedField
  }
})();