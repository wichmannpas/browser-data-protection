import InternalProtectedField from "./InternalProtectedField"

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

  clearTabState(tabId: number) {
    delete this.state[tabId]
  }

  addFieldToTab(tabId: number, field: InternalProtectedField) {
    if (this.state[tabId] === undefined) {
      this.state[tabId] = this.#emptyTabState()
    }
    this.state[tabId].fields.push(field)
  }

  #emptyTabState() {
    return {
      activeFieldId: null,
      fields: []
    }
  }
}