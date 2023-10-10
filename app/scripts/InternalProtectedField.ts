import { ProtectedFieldOptions } from "./ProtectedFieldOptions"

export default class InternalProtectedField {
  fieldId: number
  origin: string
  element: HTMLElement
  options: ProtectedFieldOptions

  constructor(fieldId: number, origin: string, element: HTMLElement, options: ProtectedFieldOptions) {
    this.fieldId = fieldId
    this.origin = origin
    this.element = element
    this.options = options

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