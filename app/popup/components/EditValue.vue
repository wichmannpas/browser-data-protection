<script setup lang="ts">
import { Ref, computed, onBeforeMount, ref, watch } from 'vue'
import InternalProtectedField from '../../scripts/InternalProtectedField'
import KeyStore, { BDPParameterError, StoredKey, keyTypes } from '../../scripts/KeyStore';
import { activeView, createKeyFor } from '../../scripts/popupAppState';

const props = defineProps({
  field: {
    type: InternalProtectedField,
    required: true
  }
})

const fieldKeyTypeData = computed(() => {
  const keyTypeData = keyTypes.find(keyType => keyType[0] === props.field.options.protectionMode)
  if (keyTypeData === undefined) {
    return []
  }
  return keyTypeData
})

const ready = ref(false)
const errorMessage: Ref<null | string> = ref(null)

// whether the ciphertext provided to the web application is fresh, i.e., the newest changes to the plaintext value are reflected.
const ciphertextFresh = ref(true)
const ciphertextLoading = ref(false)

// key store values are reactive
const keyStore = KeyStore.getKeyStore()

const plaintextValue = ref('')

const previouslyUsedKey: Ref<StoredKey | null> = ref(null)
const usedKey: Ref<StoredKey | null> = ref(null)

// keep track of the ciphertext value in a local variable to see whether a change comes from the web application (and requires a reload) or is just the "bounce back" of our own updated value that is propagated back to the prop
let ciphertextValueCopy: string | null = null

async function loadCiphertext() {
  if (props.field.ciphertextValue === ciphertextValueCopy) {
    return
  }

  ready.value = false
  errorMessage.value = null
  await keyStore.load()
  if (props.field.ciphertextValue !== null) {
    try {
      const [key, plaintext] = await keyStore.decryptWithUserOnlyKey(props.field.ciphertextValue, props.field.origin)
      ciphertextValueCopy = props.field.ciphertextValue

      usedKey.value = key
      plaintextValue.value = plaintext
    } catch (e) {
      if (!(e instanceof BDPParameterError)) {
        throw e
      }

      errorMessage.value = e.message
      ready.value = true
      return
    }
  } else {
    previouslyUsedKey.value = usedKey.value
    usedKey.value = null
    plaintextValue.value = ''
  }

  ready.value = true
  ciphertextFresh.value = true
  ciphertextLoading.value = false
}

onBeforeMount(loadCiphertext)
watch(() => props.field.ciphertextValue, loadCiphertext)

const selectableKeys = computed(() => {
  if (props.field.options.protectionMode === 'user-only') {
    return keyStore.getUserOnlyKeysForOrigin(props.field.origin)
  }
  throw new Error('unsupported protection mode')
})
function navigateToCreateKey() {
  activeView.value = 'manage-keys'
  createKeyFor.value = props.field.options.protectionMode
}

async function handleNewValue(value: string, key: StoredKey) {
  ciphertextLoading.value = true
  ciphertextValueCopy = await props.field.encryptNewValue(value, key, keyStore)
  await props.field.propagateNewValue(ciphertextValueCopy)
  ciphertextLoading.value = false
  ciphertextFresh.value = true
}

let updateTimeout: number | null = null
watch(plaintextValue, newPlaintext => {
  if (!ready.value) {
    // ignore initial value
    return
  }

  ciphertextFresh.value = false

  if (props.field.options.updateMode !== 'immediate') {
    return
  }
  // for security reasons, immediate mode updates only if there has not been a typed character for 1 second
  if (updateTimeout !== null) {
    window.clearTimeout(updateTimeout)
  }
  updateTimeout = window.setTimeout(async () => {
    if (usedKey.value === null) {
      console.warn('immediate encrypt: no key selected (anymore)')
      return
    }
    await handleNewValue(newPlaintext, usedKey.value)
  }, 1000)
}, { flush: 'sync' })


async function finishEditing() {
  if (usedKey.value === null) {
    throw new Error('finish editing: no key selected')
  }
  await handleNewValue(plaintextValue.value, usedKey.value)

  await chrome.runtime.sendMessage({
    context: 'bdp',
    operation: 'stopEdit'
  })
  window.close()
}
</script>

<template>
  <div v-if="ready">
    <strong>Current origin:</strong>
    {{ field.origin }}


    <div v-if="errorMessage === null">
      <div v-if="usedKey === null">
        <template v-if="selectableKeys.length > 0">
          <p>
            This field does not have a value.
            <strong>
              Choose the key to use for this field.
            </strong>
            You can manage your keys in the <a href="#" @click="activeView = 'manage-keys'">key manager</a>.
          </p>
          <table class="table table-striped table-hover">
            <tbody>
              <tr v-for="key in selectableKeys"
                :class="{ 'previous-key': previouslyUsedKey !== null && key.keyId === previouslyUsedKey.keyId }">
                <td class="previous-key-star">
                  <template v-if="previouslyUsedKey !== null && key.keyId === previouslyUsedKey.keyId">
                    <span class="tooltip tooltip-right" data-tooltip="This key was used for the previous value.">
                      <i class="fa-solid fa-star"></i>
                    </span>
                  </template>
                </td>
                <td class="key-id">{{ key.keyId }}</td>
                <td>{{ key.shortDescription }}</td>
                <td>
                  <button @click="usedKey = key" class="btn btn-link tooltip tooltip-left"
                    data-tooltip="Use this key for the field's value">
                    <i class="fa-solid fa-check"></i>
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </template>
        <p v-else>
          No suitable key available.
          You can create a new key using the <a href="#" @click="navigateToCreateKey">key manager</a>.
        </p>
      </div>
      <form v-else @submit.prevent="finishEditing">
        <p>
          <strong>
            Protection mode:
          </strong>
          {{ fieldKeyTypeData[1] }}
          <br />

          <strong>
            Update mode:
          </strong>
          {{ field.options.updateMode }}
          <br />

          <strong>
            Used key:
          </strong>
          <span class="key-id">{{ usedKey.keyId }}</span>
          ({{ usedKey.shortDescription }})
        </p>

        <label class="form-label">
          Value to be encrypted
          <input type="text" v-model="plaintextValue" class="form-input" :readonly="field.options.readOnly" autofocus />
        </label>

        <div v-if="field.options.updateMode === 'immediate'">
          <div v-if="ciphertextLoading" class="toast">
            <div class="loading loading-lg"></div>
          </div>
          <div v-else-if="ciphertextFresh" class="toast toast-success">
            <i class="fa-solid fa-user-check"></i>
            Ciphertext provided to web application is fresh.
          </div>
          <div v-else class="toast">
            <i class="fa-solid fa-user-clock"></i>
            Waiting for typing pause …
          </div>
        </div>
        <div v-else>
          The ciphertext of this field will be provided to the web application only when you click the button below or
          press
          enter.
        </div>

        <button type="submit" class="btn btn-block btn-primary" :disabled="ciphertextLoading">
          Finish editing
        </button>
      </form>
    </div>
    <div v-else class="toast toast-error">
      <strong>The web application provided an invalid ciphertext.</strong>
      {{ errorMessage }}
    </div>
  </div>
  <div v-else class="loading loading-lg"></div>
</template>

<style scoped>
tr.previous-key>td {
  background: #7ebcff;
}

td.previous-key-star {
  width: 1em;
  text-align: center;
}
</style>