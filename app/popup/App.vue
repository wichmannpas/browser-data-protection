<script setup lang="ts">
import EditValueView from './views/EditValueView.vue'
import ManageKeysView from './views/ManageKeysView.vue'
import { activeView } from '../scripts/popupAppState'


chrome.runtime.onMessage.addListener((message, sender) => {
  if (message.context !== 'bdp') {
    return
  }
  switch (message.operation) {
    case 'closePopup':
      window.close()
      break
  }
})
</script>

<style scoped>
.container {
  width: 50em;
  margin: 0.5em auto;
}
</style>

<template>
  <div class="container">
    <h4 class="main-heading">
      BrowserDataProtection
      <button class="btn btn-link tooltip tooltip-left float-right" @click="activeView = 'manage-keys'"
        v-if="activeView === 'edit-value'" data-tooltip="Manage keys">
        <i class="fa-solid fa-gear"></i>
      </button>
      <button class="btn btn-link tooltip tooltip-left float-right" @click="activeView = 'edit-value'"
        v-else-if="activeView === 'manage-keys'" data-tooltip="Close key manager">
        <i class="fa-solid fa-xmark"></i>
      </button>
    </h4>

    <EditValueView v-if="activeView === 'edit-value'" />
    <ManageKeysView v-else-if="activeView === 'manage-keys'" />
  </div>
</template>