import { State }  from './state'

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') {
    setState(new State())
  }
})

async function getState(): Promise<State> {
  const newState = new State()
  const storedState = await chrome.storage.session.get(['state'])
  if (storedState.state === undefined) {
    return newState
  }
  return Object.assign(newState, storedState.state)
}

async function setState(state: State) {
  await chrome.storage.session.set({
    state
  })
}

async function updateBadge(tabId: number) {
  let state = await stateProm
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

const stateProm = getState()

chrome.tabs.onActivated.addListener(async function (activeInfo) {
  let state = await stateProm
  if (state.activeTabId !== -1) {
    // clear any active field for the previous tab
    const oldTabState = state.getStateForTab(state.activeTabId)
    oldTabState.activeFieldId = null
    chrome.tabs.sendMessage(state.activeTabId, {
      context: 'bdp',
      operation: 'clearAllActiveFields'
    }).catch((error) => {
      console.warn(`Error clearing active fields for tab ${state.activeTabId}: ${error}`)
    })
  }
  state.activeTabId = activeInfo.tabId
  await setState(state)
})

async function handleFieldCreated(message: any, tabId: number) {
  let state = await stateProm
  state.addFieldToTab(tabId, message.internalProtectedField)
  await setState(state)
  console.log('field created')
  console.log(state)
  updateBadge(tabId)
}

chrome.runtime.onMessage.addListener(async function (message: any, sender: chrome.runtime.MessageSender, sendResponse) {
  let state = await stateProm
  if (message.context !== 'bdp') {
    return
  }
  if (sender.tab === undefined || sender.tab.id === undefined) {
    // message is from popup
    switch (message.operation) {
      case 'getTabState':
        sendResponse(state.getStateForTab(state.activeTabId))
        break
      default:
        throw new Error(`Unknown operation (from popup): ${message.operation}`)
    }
  } else {
    // message is from the content script
    switch (message.operation) {
      case 'contentScriptReady':
        state.clearTabState(sender.tab.id)
        await setState(state)
        updateBadge(sender.tab.id)
        break
      case 'fieldCreated':
        await handleFieldCreated(message, sender.tab.id)
        break
      case 'startEdit':
        state.getStateForTab(sender.tab.id).activeFieldId = message.internalProtectedField.fieldId
        await setState(state)
        break
      case 'stopEdit':
        state.getStateForTab(sender.tab.id).activeFieldId = null
        await setState(state)
        break
      default:
        throw new Error(`Unknown operation: ${message.operation}`)
    }
  }
})