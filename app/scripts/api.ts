(function () {
  class ProtectedField {
    constructor(fieldId: number, options: any) {
      this.#fieldId = fieldId
      this.#options = Object.assign({}, options)
    }

    #fieldId = -1
    #options = {}
  }

  function createProtectedField(element: Element, options: any) {
    const fieldId = window.crypto.getRandomValues(new Uint32Array(1))[0]
    element.setAttribute('bdp-fieldId', fieldId.toString())
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

  // @ts-expect-error
  window.browserDataProtection = {
    createProtectedField
  }
})();