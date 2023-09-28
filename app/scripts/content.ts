// @ts-expect-error TS2307: Cannot find module './api.rawjs' or its corresponding type declarations.
import apiCodeString from './api.rawjs'

/**
 * Injects the API functions into the window object by injecting the api.js script.
 * The script is added as an inline script to make sure it is injected before any other script on the page.
 * The content script is loaded at document start.
 */
function injectAPI() {
  const script = document.createElement('script');
  script.setAttribute('type', 'text/javascript');
  script.text = apiCodeString;
  (document.head || document.documentElement).prepend(script);
}
injectAPI()

window.addEventListener('message', (event) => {
  if (event.source !== window || event.data.context !== 'bdp') {
    return
  }
  console.log(event.data)
})