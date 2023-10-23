import InternalProtectedField from "./InternalProtectedField"
import KeyStore from "./KeyStore"
import { serializeValue } from "./utils"

export class TabState {
  activeFieldId: number | null = null
  fields: InternalProtectedField[] = []
}
export class State {
  activeTabId = -1
  state: { [key: number]: TabState } = {}

  getStateForTab(tabId: number): TabState {
    if (this.state[tabId] === undefined) {
      return this.#emptyTabState()
    }
    return this.state[tabId]
  }

  /**
   * Serialize other's public key values for the tab state.
   */
  async getSerializedStateForTab(tabId: number): Promise<any> {
    const originalTabState = this.getStateForTab(tabId)
    const tabState = Object.assign(Object.create(null), originalTabState)
    tabState.fields = []
    for (let i = 0; i < originalTabState.fields.length; i++) {
      const field = Object.assign(Object.create(null), originalTabState.fields[i])
      if (field.othersPublicKey !== undefined) {
        field.othersPublicKey = await serializeValue(field.othersPublicKey)
      }
      tabState.fields.push(field)
    }
    return tabState
  }

  clearTabState(tabId: number) {
    delete this.state[tabId]
  }

  addFieldToTab(tabId: number, field: InternalProtectedField) {
    if (this.state[tabId] === undefined) {
      this.state[tabId] = this.#emptyTabState()
    }
    this.state[tabId].fields.push(field)
  }

  /**
   * Apply an update to the ciphertext of a field. Propagation of the value is not handled here.
   */
  updateFieldCiphertext(tabId: number, fieldId: number, ciphertextValue: string) {
    const field = this.state[tabId].fields.find(field => field.fieldId === fieldId)
    if (field === undefined) {
      throw new Error(`Field ${fieldId} not found`)
    }
    field.ciphertextValue = ciphertextValue
  }

  /**
   * Apply an update to other's public key and own public key id of a field. Propagation of the value is not handled here.
   * A value that is undefined is ignored, i.e., the function can be used to set/update only one of the values.
   * It is not possible to clear a value using this function.
   */
  async updateFieldPublicKeyData(tabId: number, fieldId: number, othersPublicKey?: string, ownPublicKeyId?: string) {
    const field = this.state[tabId].fields.find(field => field.fieldId === fieldId)
    if (field === undefined) {
      throw new Error(`Field ${fieldId} not found`)
    }
    if (othersPublicKey !== undefined) {
      try {
        field.othersPublicKey = await (new KeyStore()).loadOthersKeyAgreementPublicKey(othersPublicKey)
      } catch {
        console.warn('Invalid (other\'s) public key received.')
      }
    }
    if (ownPublicKeyId !== undefined) {
      field.ownPublicKeyId = ownPublicKeyId
    }
  }

  #emptyTabState() {
    return {
      activeFieldId: null,
      fields: []
    }
  }
}