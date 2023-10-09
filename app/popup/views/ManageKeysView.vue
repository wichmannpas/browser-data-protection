<script setup lang="ts">
import { computed, onBeforeMount, reactive, ref, watch } from 'vue'
import KeyStore from '../../scripts/KeyStore';
import KeyList from '../components/KeyList.vue';

const ready = ref(false)

const keyTypes = [
  // [keyType, keyText, keyTextAdjective (used with the word "key" appended), keyDescription]
  ['user-only', 'User only', 'user-only', 'A key not shared with any other user. Can be transferred to your other devices/browsers.'],
  ['password', 'Saved Passwords', 'saved password', 'A password that is used for the decryption of a specific value or set of values.'],
  ['symmetric', 'Symmetric', 'symmetric', 'A key that is shared with a specific set of other users.'],
  ['recipient', 'Recipient', 'recipient', 'A key that is shared/received with a specific user. Only the key owner (who knows the so-called private key) can decrypt values encrypted with this key. Other users can only encrypt values for this key.'],
]
const activeKeyType = ref('user-only')
const activeKeyTypeData = computed(() => {
  const keyTypeData = keyTypes.find(keyType => keyType[0] === activeKeyType.value)
  if (keyTypeData === undefined) {
    return []
  }
  return keyTypeData
})

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

const generateNewKeyActive = ref(false)
const generateNewKeyData = reactive({
  description: '',
  allowedOrigins: '*',
})
function clearGenerateNewKeyData() {
  generateNewKeyData.description = ''
  generateNewKeyData.allowedOrigins = '*'
}
watch(activeKeyType, () => {
  generateNewKeyActive.value = false
  clearGenerateNewKeyData()
})
function generateNewKey(keyType: string) {
  switch (keyType) {
    case 'user-only':
      generateNewKeyActive.value = false
      keyStore.generateUserOnlyKey(generateNewKeyData.description, generateNewKeyData.allowedOrigins.trim().split(' '))
      clearGenerateNewKeyData()
      break
    default:
      throw new Error('unsupported key type for key generation')
  }
}


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
      <div class="column col-3">
        <ul class="menu">
          <li class="divider" data-content="Keys">
          </li>
          <li class="menu-item" v-for="[keyType, keyText] in keyTypes">
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
      <div class="column col-9">
        <p>
          <strong>Key type explanation.</strong>
          {{ activeKeyTypeData[3] }}
        </p>
        <button class="btn btn-block btn-success" v-if="activeKeyType !== 'password' && !generateNewKeyActive"
          @click="generateNewKeyActive = true">
          <i class="fa-solid fa-plus"></i>
          Generate a new {{ activeKeyTypeData[2] }} key
        </button>
        <div v-if="generateNewKeyActive">
          <form @submit.prevent="generateNewKey(activeKeyType)">
            <label class="form-label">
              Key description
              <input type="text" class="form-input" placeholder="A short description to help you recognize this key."
                v-model="generateNewKeyData.description" />
            </label>
            <label class="form-label">
              Allowed origins (space-separated)
              <input type="text" class="form-input" v-model="generateNewKeyData.allowedOrigins"
                placeholder="List of origins on that this key is allowed to be used." />
            </label>
            <div class="btn-group btn-group-block">
              <button class="btn btn-primary" type="submit">
                Generate key
              </button>
              <button class="btn" @click="generateNewKeyActive = false; clearGenerateNewKeyData()">
                Cancel
              </button>
            </div>
          </form>
          <hr />
        </div>

        <KeyList v-if="activeKeyType === 'user-only'" :keys="keyStore.getUserOnlyKeys()" :key-store="keyStore" :key-type="activeKeyType" />
      </div>
    </div>
  </div>
  <div v-else class="loading loading-lg"></div>
</template>