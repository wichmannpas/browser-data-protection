<script setup lang="ts">
import { Ref, computed, onBeforeMount, ref, watch } from 'vue'
import InternalProtectedField from '../../scripts/InternalProtectedField'
import KeyStore, { BDPParameterError, KeyMissingError, RecipientKey, StoredKey, keyTypes } from '../../scripts/KeyStore'
import { activeView, chosenPassword, chosenPasswordStoreKey, ciphertextFresh, ciphertextProvidedToWebApp, editReady, passwordReRequest, passwordReRequestError, plaintextValue, previouslyUsedKey, reRequestedPassword, usedKey } from '../../scripts/popupAppState'
import KeySelection from './KeySelection.vue'
import PasswordKeySelection from './PasswordKeySelection.vue'
import { deserializeValue } from '../../scripts/utils'

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

const errorMessage: Ref<null | string> = ref(null)
const errorKeyMissing = ref(false)

const ciphertextLoading = ref(false)
const ciphertextWaiting = ref(false)

// key store values are reactive
const keyStore = KeyStore.getKeyStore()

// keep track of the ciphertext value in a local variable to see whether a change comes from the web application (and requires a reload) or is just the "bounce back" of our own updated value that is propagated back to the prop
let ciphertextValueCopy: string | null | undefined = undefined

async function loadCiphertext() {
  if (props.field.ciphertextValue === ciphertextValueCopy) {
    return
  }

  if (updateTimeout !== null) {
    window.clearTimeout(updateTimeout)
    ciphertextWaiting.value = false
  }

  editReady.value = false
  errorMessage.value = null
  errorKeyMissing.value = false
  chosenPassword.value = ''
  chosenPasswordStoreKey.value = true
  await keyStore.load()
  if (props.field.ciphertextValue !== null) {
    let key: StoredKey, plaintext: string
    try {
      switch (props.field.options.protectionMode) {
        case 'symmetric':
          [key, plaintext] = await keyStore.decryptWithSymmetricKey(props.field.ciphertextValue, props.field.origin)
          break
        case 'password':
          try {
            [key, plaintext] = await keyStore.decryptWithPasswordKey(props.field.ciphertextValue, props.field.origin)
          } catch (e) {
            if (!(e instanceof KeyMissingError)) {
              throw e
            }
            // for the password mode, re-request the password to derive the key again.
            reRequestedPassword.value = ''
            passwordReRequest.value = true
            passwordReRequestError.value = null
            editReady.value = true
            return
          }
          break
        case 'recipient':
          if (props.field.options.recipientPublicKey === undefined) {
            throw new Error('no recipient public key provided')
          }
          [key, plaintext] = await keyStore.decryptWithRecipientKey(props.field.ciphertextValue, props.field.origin, (usedKey.value as RecipientKey).keyId)
          break
        default:
          throw new Error(`unsupported protection mode ${props.field.options.protectionMode}`)
      }
      ciphertextValueCopy = props.field.ciphertextValue

      if (key !== undefined) {
        // the key is only updated if it is set in the decryption.
        usedKey.value = key
      }
      plaintextValue.value = plaintext
      ciphertextProvidedToWebApp.value = true
    } catch (e) {
      if (!(e instanceof BDPParameterError)) {
        throw e
      }

      errorMessage.value = e.message
      errorKeyMissing.value = e instanceof KeyMissingError
      editReady.value = true
      return
    }
  } else {
    previouslyUsedKey.value = usedKey.value
    if (props.field.options.protectionMode !== 'recipient') {
      usedKey.value = null
    }
    plaintextValue.value = ''
    ciphertextProvidedToWebApp.value = false
  }

  editReady.value = true
  ciphertextFresh.value = true
  ciphertextLoading.value = false
}

onBeforeMount(async () => {
  if (props.field.options.protectionMode === 'recipient' && props.field.options.distributionMode === 'direct-plain' && props.field.options.recipientPublicKey !== undefined) {
    try {
      usedKey.value = await deserializeValue(JSON.parse(atob(props.field.options.recipientPublicKey))) as RecipientKey
    } catch (e) {
      console.warn(e)
    }
  }

  loadCiphertext()
})
watch(() => props.field.ciphertextValue, loadCiphertext)


async function handleNewValue(value: string, key: StoredKey) {
  ciphertextLoading.value = true
  ciphertextValueCopy = await props.field.encryptNewValue(value, key, keyStore)
  await props.field.propagateNewValue(ciphertextValueCopy)
  ciphertextLoading.value = false
  ciphertextFresh.value = true
  ciphertextProvidedToWebApp.value = true
}

let updateTimeout: number | null = null
watch(plaintextValue, newPlaintext => {
  if (!editReady.value) {
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
  ciphertextWaiting.value = true
  updateTimeout = window.setTimeout(async () => {
    if (usedKey.value === null) {
      console.warn('immediate encrypt: no key selected (anymore)')
      return
    }
    ciphertextWaiting.value = false
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

function clearField() {
  usedKey.value = null
  props.field.propagateNewValue(null)
}
</script>

<template>
  <div v-if="editReady">
    <strong>Current origin:</strong>
    {{ field.origin }}

    <div v-if="errorMessage === null">
      <div v-if="usedKey === null">
        <PasswordKeySelection :field="field" :keyStore="keyStore" v-if="field.options.protectionMode === 'password'" />
        <KeySelection :field="field" :keyStore="keyStore" v-else />
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
          <div v-else-if="ciphertextWaiting" class="toast">
            <i class="fa-solid fa-user-clock"></i>
            Waiting for typing pause …
          </div>
          <div v-else-if="!ciphertextProvidedToWebApp" class="toast">
            Value not provided to web application.
          </div>
          <div v-else-if="ciphertextFresh" class="toast toast-success">
            <i class="fa-solid fa-user-check"></i>
            Ciphertext provided to web application is fresh.
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

        <button class="btn btn-block" @click="clearField">
          Clear field and deselect key
        </button>
      </form>
    </div>
    <div v-else class="toast toast-error">
      <strong v-if="!errorKeyMissing">The web application provided an invalid ciphertext.</strong>
      {{ errorMessage }}
      If the key was shared with you, you can import the key in the <a href="#" @click="activeView = 'manage-keys'">key
        manager</a>.
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