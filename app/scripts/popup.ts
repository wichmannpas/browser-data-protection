const button = document.getElementById('testbutton')
if (button !== null) {
  button.innerText = 'testbutton'
  button.addEventListener('click', () => {
    console.log('testbutton clicked')
  })
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('POPUP onMessage', message, sender)
  document.body.appendChild(document.createTextNode(JSON.stringify(message)))
})