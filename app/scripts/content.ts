import InternalProtectedField from './InternalProtectedField'

// @ts-expect-error TS2307: Cannot find module './api.rawjs' or its corresponding type declarations.
// import apiCodeString from './api.rawjs'

/**
 * Injects the API functions into the window object by injecting the api.js script.
 * The script is added as an inline script to make sure it is injected before any other script on the page.
 * The content script is loaded at document start.
 */
function injectAPI() {
  const script = document.createElement('script')
  script.setAttribute('type', 'text/javascript')
  // script.text = apiCodeString;
  script.setAttribute('src', chrome.runtime.getURL('scripts/api.js'));
  (document.head || document.documentElement).prepend(script)
}
injectAPI()
function injectCSS() {
  const style = document.createElement('link')
  style.setAttribute('type', 'text/css')
  style.setAttribute('rel', 'stylesheet')
  style.setAttribute('href', chrome.runtime.getURL('styles/site.css'))
  document.head.append(style)
}
document.addEventListener('DOMContentLoaded', () => {
  injectCSS()
})

function createProtectedField(fieldId: number, options: object) {
  const element = document.getElementsByClassName(`bdpfield-${fieldId}`)[0]
  if (element === undefined) {
    throw new Error(`Field with bdp id ${fieldId} not found`)
  }
  const internalProtectedField = new InternalProtectedField(fieldId, element as HTMLElement, options)
  internalProtectedField.addClickListener()
}

// Listen to message from the web application (api)
window.addEventListener('message', (event) => {
  if (event.source !== window || event.data.context !== 'bdp') {
    return
  }
  switch (event.data.operation) {
    case 'createProtectedField':
      createProtectedField(event.data.fieldId, event.data.options)
      break
    case 'clearAllActiveFields':
      InternalProtectedField.clearAllActiveFields()
      break
    default:
      throw new Error(`Unknown operation: ${event.data.operation}`)
  }
})

// Notify background script that the content script is ready (i.e., the page was just (re)loaded)
chrome.runtime.sendMessage({
  context: 'bdp',
  operation: 'contentScriptReady'
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