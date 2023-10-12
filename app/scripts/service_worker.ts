import { State } from './state'

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
  } else {
    chrome.action.setBadgeText({
      text: fieldCount.toString(),
      tabId
    })
  }
  if (tabState.activeFieldId === null) {
    chrome.action.setBadgeBackgroundColor({
      color: '#0000ff',
      tabId
    })
  } else {
    chrome.action.setBadgeBackgroundColor({
      color: '#20a000',
      tabId
    })
  }
}

const stateProm = getState()

async function sendClearAllActiveFields(tabId: number) {
  chrome.tabs.sendMessage(tabId, {
    context: 'bdp',
    operation: 'clearAllActiveFields'
  }).catch((error) => {
    console.warn(`Error clearing active fields for tab ${tabId}: ${error}`)
  })
}
function closePopup() {
  chrome.runtime.sendMessage({
    context: 'bdp',
    operation: 'closePopup',
  })
}

chrome.tabs.onActivated.addListener(async activeInfo => {
  let state = await stateProm
  if (state.activeTabId !== -1) {
    // clear any active field for the previous tab
    sendClearAllActiveFields(state.activeTabId)
  }
  state.getStateForTab(state.activeTabId).activeFieldId = null
  state.activeTabId = activeInfo.tabId
  await setState(state)
})

async function handleFieldCreated(message: any, tabId: number) {
  let state = await stateProm
  message.internalProtectedField.fieldTabId = tabId
  state.addFieldToTab(tabId, message.internalProtectedField)
  await setState(state)
  updateBadge(tabId)
}

async function handleStopEdit(tabId: number) {
  let state = await stateProm
  state.getStateForTab(tabId).activeFieldId = null
  await setState(state)
  updateBadge(tabId)
}

chrome.runtime.onMessage.addListener(function (message: any, sender: chrome.runtime.MessageSender, sendResponse) {
  (async () => {
    let state = await stateProm
    if (message.context !== 'bdp') {
      return
    }
    if (sender.tab === undefined || sender.tab.id === undefined || sender.origin?.startsWith('chrome-extension://')) {
      // message is from popup/internal page
      switch (message.operation) {
        case 'getTabState':
          sendResponse(state.getStateForTab(state.activeTabId))
          break
        case 'updateCiphertext':
          state.updateFieldCiphertext(message.tabId, message.fieldId, message.ciphertextValue)
          await setState(state)
          break
        case 'stopEdit':
          sendClearAllActiveFields(state.activeTabId)
          handleStopEdit(state.activeTabId)
          sendResponse()
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
        case 'setFieldCiphertext':
          state.updateFieldCiphertext(sender.tab.id, message.internalProtectedField.fieldId, message.ciphertextValue)
          await setState(state)
          // propagate change to browser action popup
          chrome.runtime.sendMessage({
            context: 'bdp',
            operation: 'updateCiphertext',
            fieldId: message.fieldId,
            ciphertextValue: message.ciphertextValue,
          })
          break

        case 'startEdit':
          state.getStateForTab(sender.tab.id).activeFieldId = message.internalProtectedField.fieldId
          updateBadge(sender.tab.id)
          await setState(state)
          break
        case 'stopEdit':
          handleStopEdit(sender.tab.id)
          break

        case 'closePopup':
          closePopup()
          break
        case 'openPopupInNewTab':
          // This is mainly for debugging purposes, but may also be used to provide the key manager in a separate tab.
          chrome.tabs.create({
            url: chrome.runtime.getURL('popup/popup.html')
          })
          break
        default:
          throw new Error(`Unknown operation (from content): ${message.operation}`)
      }
    }
  })()

  // return true to be able to use sendResponse
  return true
})