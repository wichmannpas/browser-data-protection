(function () {
  class ProtectedField {
    constructor(fieldId, options) {
      this.#fieldId = fieldId
      this.#options = Object.assign({}, options)
    }

    #fieldId = -1
    #options = {}
  }

  function createProtectedField(element, options) {
    const fieldId = window.crypto.getRandomValues(new Uint32Array(1))[0]
    element.setAttribute('bdp-fieldId', fieldId)
    element.classList.add('bdpfield')
    element.classList.add(`bdpfield-${fieldId}`)
    window.postMessage({
      context: 'bdp',
      operation: 'createProtectedField',
      options,
      fieldId
    })

    return new ProtectedField(fieldId, options)
  }

  window.browserDataProtection = {
    createProtectedField
  }
})();