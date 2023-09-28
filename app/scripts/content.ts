// @ts-expect-error TS2307: Cannot find module './api.rawjs' or its corresponding type declarations.
import apiCodeString from './api.rawjs'

/**
 * Injects the API functions into the window object by injecting the api.js script.
 * The script is added as an inline script to make sure it is injected before any other script on the page.
 * The content script is loaded at document start.
 */
function injectAPI() {
  const script = document.createElement('script')
  script.setAttribute('type', 'text/javascript')
  script.text = apiCodeString;
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

window.addEventListener('message', (event) => {
  if (event.source !== window || event.data.context !== 'bdp') {
    return
  }
  switch (event.data.operation) {
    case 'addProtectedField':
      addProtectedField(event.data.fieldId, event.data.options)
      break
    default:
      throw new Error(`Unknown operation: ${event.data.operation}`)
  }
})

function addProtectedField(fieldId: number, options: object) {
  const element = document.getElementsByClassName(`bdpfield-${fieldId}`)[0]
  if (element === undefined) {
    throw new Error(`Field with bdp id ${fieldId} not found`)
    return
  }
  element.addEventListener('click', event => {
    if (element.classList.contains('editActive')) {
      // Stop editing
      element.classList.remove('editActive')
      chrome.runtime.sendMessage({
        context: 'bdp',
        operation: 'stopEdit',
        fieldId,
      })
    } else {
      element.classList.add('editActive')
      chrome.runtime.sendMessage({
        context: 'bdp',
        operation: 'startEdit',
        fieldId,
      })
    }
  })
}