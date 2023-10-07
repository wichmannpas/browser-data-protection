/**
 * Content script injected into the ISOLATED world to handle communication between the API and the extension.
 */

import InternalProtectedField from './InternalProtectedField'

function createProtectedField(fieldId: number, options: object) {
  const element = document.getElementsByClassName(`bdpfield-${fieldId}`)[0]
  if (element === undefined) {
    throw new Error(`Field with bdp id ${fieldId} not found`)
  }
  const internalProtectedField = new InternalProtectedField(fieldId, element as HTMLElement, options)
  internalProtectedField.addClickListener()
}

// Listen to message from the web application (api.ts, MAIN world content script)
window.addEventListener('message', (event) => {
  if (event.source !== window || event.data.context !== 'bdp') {
    return
  }
  switch (event.data.operation) {
    case 'createProtectedField':
      createProtectedField(event.data.fieldId, event.data.options)
      break
    case 'clearAllActiveFields':
      // clear (selection of) all active fields
      InternalProtectedField.clearAllActiveFields()
      break
    default:
      throw new Error(`Unknown operation: ${event.data.operation}`)
  }
})

// Notify background script that the content script is ready (i.e., the page was just (re)loaded)
chrome.runtime.sendMessage({
  context: 'bdp',
  operation: 'contentScriptReady',
})

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((message: any, sender: chrome.runtime.MessageSender, sendResponse) => {
  if (message.context !== 'bdp') {
    return
  }
  switch (message.operation) {
    case 'clearAllActiveFields':
      InternalProtectedField.clearAllActiveFields()
      break
    default:
      throw new Error(`Unknown operation: ${message.operation}`)
  }
})

// debug: add link to popup in new tab
addEventListener('DOMContentLoaded', () => {
  const button = document.createElement('button')
  button.innerText = 'DEBUG: Open popup in new tab'
  button.addEventListener('click', () => {
    chrome.runtime.sendMessage({
      context: 'bdp',
      operation: 'openPopupInNewTab',
    })
  })
  document.body.appendChild(button)
  // DEBUG: open tab immediately
  chrome.runtime.sendMessage({
    context: 'bdp',
    operation: 'openPopupInNewTab',
  })
})