<script setup lang="ts">
import { Ref, computed, onBeforeMount, reactive, ref, watch } from 'vue'
import KeyStore, { BDPParameterError, RecipientKey, SymmetricKey, keyTypes } from '../../scripts/KeyStore';
import KeyList from '../components/KeyList.vue';
import { createKeyFor, createKeyForDistributionMode } from '../../scripts/popupAppState';
import { deriveKeyId, deserializeValue } from '../../scripts/utils';

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

const generateNewKeyLoading = ref(false)
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
  generateNewKeyLoading.value = false
}
async function generateNewKey(keyType: string) {
  switch (keyType) {
    case 'symmetric':
      generateNewKeyLoading.value = true
      await keyStore.generateSymmetricKey(generateNewKeyData.description, generateNewKeyData.allowedOrigins.trim().split(' '), generateNewKeyData.distributionMode as SymmetricKey['distributionMode'])
      generateNewKeyActive.value = false
      clearGenerateNewKeyData()
      break
    case 'recipient':
      generateNewKeyLoading.value = true
      await keyStore.generateRecipientKey(generateNewKeyData.description, generateNewKeyData.allowedOrigins.trim().split(' '))
      generateNewKeyActive.value = false
      clearGenerateNewKeyData()
      break
    default:
      throw new Error('unsupported key type for key generation')
  }
}


const importKeyActive = ref(false)
const importKeyData = reactive({
  key: '',
  password: '',
})
const importKeyError: Ref<string | null> = ref(null)
function clearImportKeyData() {
  importKeyData.key = ''
  importKeyData.password = ''
  importKeyError.value = null
}
async function importKey(keyType: string) {
  importKeyError.value = null
  switch (keyType) {
    case 'symmetric':
      let wrappedKey: string
      try {
        wrappedKey = atob(importKeyData.key)
      } catch (e) {
        console.warn(e)
        importKeyError.value = 'The exported key value is invalid.'
        return
      }

      try {
        const [passwordKey, unwrappedKeyString] = await keyStore.decryptWithPasswordKey(wrappedKey, '', undefined, importKeyData.password, false)
        const unwrappedKey = await deserializeValue(JSON.parse(unwrappedKeyString)) as SymmetricKey

        // reset usage data
        unwrappedKey.lastUsed = null
        unwrappedKey.previouslyUsedOnOrigins = []

        // re-derive key id to prevent forged key ids with a non-matching key to be imported
        unwrappedKey.keyId = await deriveKeyId(unwrappedKey.key)

        // store unwrapped key
        if (!await keyStore.addSymmetricKey(unwrappedKey as SymmetricKey)) {
          importKeyError.value = `This key (key id ${unwrappedKey.keyId}) already exists.`
          return
        }
      } catch (e) {
        if (!(e instanceof BDPParameterError)) {
          throw e
        }
        console.warn(e)
        importKeyError.value = 'The exported key value or the password is invalid.'
        return
      }


      importKeyActive.value = false
      clearImportKeyData()
      break
    case 'recipient':
      let parsedKey: RecipientKey
      try {
        parsedKey = await deserializeValue(JSON.parse(atob(importKeyData.key))) as RecipientKey
      } catch (e) {
        console.warn(e)
        importKeyError.value = 'The exported key value is invalid.'
        return
      }

      try {
        // reset usage data
        parsedKey.lastUsed = null
        parsedKey.previouslyUsedOnOrigins = []

        // re-derive key id to prevent forged key ids with a non-matching key to be imported
        parsedKey.keyId = await deriveKeyId(parsedKey.signingKeyPair.publicKey)

        // store unwrapped key
        if (!await keyStore.addRecipientKey(parsedKey)) {
          importKeyError.value = `This key (key id ${parsedKey.keyId}) already exists.`
          return
        }
      } catch (e) {
        if (!(e instanceof BDPParameterError)) {
          throw e
        }
        console.warn(e)
        importKeyError.value = 'The exported key value or the password is invalid.'
        return
      }


      importKeyActive.value = false
      clearImportKeyData()
      break
    default:
      throw new Error('unsupported key type for key import')
  }
}

watch(activeKeyType, () => {
  generateNewKeyActive.value = false
  clearGenerateNewKeyData()

  importKeyActive.value = false
  clearImportKeyData()
})

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
              {{ keyText }}
            </a>
            <div class="menu-badge">
              <label class="label label-primary">
                {{ keyCount[keyType] }}
              </label>
            </div>
          </li>
        </ul>
      </div>
      <div class="column col-9 main-content">
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
              </select>
            </label>
            <label class="form-label">
              Allowed origins (space-separated)
              <input type="text" class="form-input" v-model="generateNewKeyData.allowedOrigins"
                placeholder="List of origins on that this key is allowed to be used." />
            </label>
            <div class="btn-group btn-group-block">
              <button class="btn btn-primary" type="submit" :disabled="generateNewKeyLoading"
                :class="{ loading: generateNewKeyLoading }">
                Generate key
              </button>
              <button class="btn" @click="generateNewKeyActive = false; clearGenerateNewKeyData()">
                Cancel
              </button>
            </div>
          </form>
          <hr />
        </div>

        <button class="btn btn-block" v-if="['symmetric', 'recipient'].includes(activeKeyType) && !importKeyActive"
          @click="importKeyActive = true">
          <i class="fa-solid fa-file-import"></i>
          Import an existing {{ activeKeyTypeData[2] }} key
        </button>
        <div v-if="importKeyActive">
          <form @submit.prevent="importKey(activeKeyType)">
            <h5>
              Import an existing {{ activeKeyTypeData[2] }} key
            </h5>
            <label class="form-label">
              Exported key
              <textarea class="form-input monospace" placeholder="The exported key to import." rows="4"
                v-model="importKeyData.key"></textarea>
            </label>
            <label v-if="activeKeyType === 'symmetric'" class="form-label">
              Export password
              <input type="password" class="form-input" v-model="importKeyData.password"
                placeholder="The password provided during the export of this key." />
            </label>
            <div class="toast toast-error" v-if="importKeyError !== null">
              {{ importKeyError }}
            </div>
            <div class="btn-group btn-group-block">
              <button class="btn btn-primary" type="submit">
                Import key
              </button>
              <button class="btn" @click="importKeyActive = false; clearImportKeyData()">
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
        <KeyList v-if="activeKeyType === 'recipient'" :keys="keyStore.getRecipientKeys()" :key-store="keyStore"
          :key-type="activeKeyType" />
      </div>
    </div>
  </div>
  <div v-else class="loading loading-lg"></div>
</template>

<style scope>
.main-content {
  overflow-y: auto;
  max-height: 35em;
}
</style>