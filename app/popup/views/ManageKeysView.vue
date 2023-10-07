<script setup lang="ts">
import { computed, onBeforeMount, reactive, ref } from 'vue'
import KeyStore from '../../scripts/KeyStore';

const ready = ref(false)
const activeKeyType = ref('user-only')

// key store values are reactive
const keyStore = new KeyStore()

const keyCount = computed(() => {
  return {
    'user-only': keyStore.getUserOnlyKeyCount(),
    'password': keyStore.getSavedPasswordCount(),
    'symmetric': keyStore.getSymmetricKeyCount(),
    'recipient': keyStore.getRecipientKeyCount(),
  }
})


onBeforeMount(() => {
  keyStore.load().then(() => {
    ready.value = true
  })
})
</script>

<template>
  <div v-if="ready">
    <h5>Keys</h5>

    <div class="columns">
      <div class="column col-4">
        <ul class="menu">
          <li class="divider" data-content="Keys">
          </li>
          <li class="menu-item"
            v-for="[keyType, keyText] in [['user-only', 'User only'], ['password', 'Saved Passwords'], ['symmetric', 'Symmetric'], ['recipient', 'Recipient']]">
            <a @click="activeKeyType = keyType" class="c-hand" :class="{ active: keyType === activeKeyType }">
              <i class="icon icon-link"></i> {{ keyText }}
            </a>
            <div class="menu-badge">
              <label class="label label-primary">
                {{ keyCount[keyType] }}
              </label>
            </div>
          </li>
        </ul>
      </div>
      <div class="column col-8">
        {{ activeKeyType }}
      </div>
    </div>
  </div>
  <div v-else class="loading loading-lg"></div>
</template>