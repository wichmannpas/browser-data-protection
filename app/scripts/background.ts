(function () {
  chrome.runtime.onInstalled.addListener((details) => {
    console.log('previousVersion', details.previousVersion)
  })

  chrome.browserAction.setBadgeText({
    text: '0'
  })
  chrome.browserAction.setBadgeBackgroundColor({
    color: '#000000'
  })

  chrome.tabs.onActivated.addListener((activeInfo) => {
    console.log('onActivated', activeInfo)
  })

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('onMessage', message, sender)
  })
})();