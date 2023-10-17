<script setup lang="ts">
import { computed, onBeforeMount, reactive, ref, watch } from 'vue'
import KeyStore, { keyTypes } from '../../scripts/KeyStore';
import KeyList from '../components/KeyList.vue';
import { createKeyFor, createKeyForDistributionMode } from '../../scripts/popupAppState';

const ready = ref(false)

const activeKeyType = ref('symmetric')
const activeKeyTypeData = computed(() => {
  const keyTypeData = keyTypes.find(keyType => keyType[0] === activeKeyType.value)
  if (keyTypeData === undefined) {
    return []
  }
  return keyTypeData
})

// key store values are reactive
const keyStore = KeyStore.getKeyStore()

const keyCount = computed(() => {
  return {
    'password': keyStore.getPasswordKeyCount(),
    'symmetric': keyStore.getSymmetricKeyCount(),
    'recipient': keyStore.getRecipientKeyCount(),
  }
})

const generateNewKeyActive = ref(false)
const generateNewKeyData = reactive({
  description: '',
  allowedOrigins: '*',
  distributionMode: 'user-only',
})
function clearGenerateNewKeyData() {
  generateNewKeyData.description = ''
  generateNewKeyData.allowedOrigins = '*'
  generateNewKeyData.distributionMode = 'user-only'
}
watch(activeKeyType, () => {
  generateNewKeyActive.value = false
  clearGenerateNewKeyData()
})
function generateNewKey(keyType: string) {
  switch (keyType) {
    case 'symmetric':
      generateNewKeyActive.value = false
      keyStore.generateSymmetricKey(generateNewKeyData.description, generateNewKeyData.allowedOrigins.trim().split(' '), 'user-only')
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

  if (createKeyFor.value !== null) {
    activeKeyType.value = createKeyFor.value
    createKeyFor.value = null
    if (createKeyForDistributionMode.value !== null) {
      generateNewKeyData.distributionMode = createKeyForDistributionMode.value as string
      createKeyForDistributionMode.value = null
    }
    generateNewKeyActive.value = true
  }
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
            <h5>
              Generate a new {{ activeKeyTypeData[2] }} key
            </h5>
            <label class="form-label">
              Key description
              <input type="text" class="form-input" placeholder="A short description to help you recognize this key."
                v-model="generateNewKeyData.description" />
            </label>
            <label v-if="activeKeyType === 'symmetric'" class="form-label">
              Distribution mode
              <select class="form-input"
                placeholder="The distribution mode defines how the key may be shared with others."
                v-model="generateNewKeyData.distributionMode">
                <option value="user-only">User only</option>
                <option value="external">External</option>
                <option value="key-agreement">Key agreement</option>
              </select>
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

        <KeyList v-if="activeKeyType === 'symmetric'" :keys="keyStore.getSymmetricKeys()" :key-store="keyStore"
          :key-type="activeKeyType" />
        <KeyList v-if="activeKeyType === 'password'" :keys="keyStore.getPasswordKeys()" :key-store="keyStore"
          :key-type="activeKeyType" />
      </div>
    </div>
  </div>
  <div v-else class="loading loading-lg"></div>
</template>