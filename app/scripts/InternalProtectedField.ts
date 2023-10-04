export default class InternalProtectedField {
  fieldId: number
  element: HTMLElement
  options: object

  constructor(fieldId: number, element: HTMLElement, options: object) {
    this.fieldId = fieldId
    this.element = element
    this.options = options

    this.sendMessage({
      operation: 'fieldCreated',
    })
  }

  addClickListener() {
    this.element.addEventListener('click', event => {
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