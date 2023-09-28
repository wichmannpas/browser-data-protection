(function () {
  const button = document.getElementById('testbutton')
  if (button !== null) {
    button.innerText = 'testbutton'
    button.addEventListener('click', () => {
      console.log('testbutton clicked')
      alert('foo')
    })
  }
})();

