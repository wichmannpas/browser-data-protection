import InternalProtectedField from "../scripts/InternalProtectedField"

chrome.runtime.onInstalled.addListener((details) => {
  console.log('previousVersion', details.previousVersion)
})

// TODO: need to migrate this to Storage API as v3 manifest service worker does not run persistently (or do not require state persistence at all/persist in content script only)

interface TabState {
  activeFieldId: number | null
  fields: InternalProtectedField[]
}
class State {
  #state: { [key: number]: TabState } = {}

  getStateForTab(tabId: number): TabState {
    if (this.#state[tabId] === undefined) {
      return this.#emptyTabState()
    }
    return this.#state[tabId]
  }

  clearTabState(tabId: number) {
    delete this.#state[tabId]
  }

  addFieldToTab(tabId: number, field: InternalProtectedField) {
    if (this.#state[tabId] === undefined) {
      this.#state[tabId] = this.#emptyTabState()
    }
    this.#state[tabId].fields.push(field)
  }

  #emptyTabState() {
    return {
      activeFieldId: null,
      fields: []
    }
  }
}
const state = new State()

let activeTabId = -1

function updateBadge(tabId: number) {
  const tabState = state.getStateForTab(tabId)
  const fieldCount = tabState.fields.length
  if (fieldCount === 0) {
    chrome.action.setBadgeText({
      text: '',
      tabId
    })
    return
  }
  chrome.action.setBadgeText({
    text: fieldCount.toString(),
    tabId
  })
  chrome.action.setBadgeBackgroundColor({
    color: '#000000',
    tabId
  })
}

chrome.tabs.onActivated.addListener((activeInfo) => {
  if (activeTabId !== -1) {
    // clear any active field for the previous tab
    const oldTabState = state.getStateForTab(activeTabId)
    oldTabState.activeFieldId = null
    chrome.tabs.sendMessage(activeTabId, {
      context: 'bdp',
      operation: 'clearAllActiveFields'
    }).catch((error) => {
      console.warn(`Error clearing active fields for tab ${activeTabId}: ${error}`)
    })
  }
  activeTabId = activeInfo.tabId
})

function handleFieldCreated(message: any, sender: chrome.runtime.MessageSender) {
  if (sender.tab === undefined || sender.tab.id === undefined) {
    throw new Error('sender.tab is undefined for field creation')
  }
  state.addFieldToTab(sender.tab.id, message.internalProtectedField)
  updateBadge(sender.tab.id)
}

chrome.runtime.onMessage.addListener((message: any, sender: chrome.runtime.MessageSender, sendResponse) => {
  if (message.context !== 'bdp') {
    return
  }
  if (sender.tab === undefined || sender.tab.id === undefined) {
    // message is from popup
    switch (message.operation) {
      case 'getTabState':
        console.log(state.getStateForTab(activeTabId))
        sendResponse(state.getStateForTab(activeTabId))
        break
      default:
        throw new Error(`Unknown operation (from popup): ${message.operation}`)
    }
  } else {
    // message is from the content script
    switch (message.operation) {
      case 'contentScriptReady':
        state.clearTabState(sender.tab.id)
        updateBadge(sender.tab.id)
        break
      case 'fieldCreated':
        handleFieldCreated(message, sender)
        break
      case 'startEdit':
        state.getStateForTab(sender.tab.id).activeFieldId = message.internalProtectedField.fieldId
        break
      case 'stopEdit':
        state.getStateForTab(sender.tab.id).activeFieldId = null
        break
      default:
        throw new Error(`Unknown operation: ${message.operation}`)
    }
  }
})