<script setup lang="ts">
import { Ref, computed, onBeforeMount, ref, watch } from 'vue'
import InternalProtectedField from '../../scripts/InternalProtectedField'
import KeyStore, { BDPParameterError, KeyMissingError, PasswordKey, StoredKey, keyTypes } from '../../scripts/KeyStore';
import { activeView, createKeyFor } from '../../scripts/popupAppState';
import zxcvbn from 'zxcvbn'

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
const ciphertextProvidedToWebApp = ref(false)
const ciphertextFresh = ref(true)
const ciphertextLoading = ref(false)
const ciphertextWaiting = ref(false)

// key store values are reactive
const keyStore = KeyStore.getKeyStore()

const plaintextValue = ref('')

const previouslyUsedKey: Ref<StoredKey | null> = ref(null)
const usedKey: Ref<StoredKey | null> = ref(null)

const chosenPassword = ref('')
const chosenPasswordStoreKey = ref(true)
const passwordStrength = computed(() => {
  return zxcvbn(chosenPassword.value)
})
async function choosePassword() {
  if (chosenPassword.value === '') {
    return
  }
  if (passwordStrength.value.score < 4 && !confirm('Are you sure that you would like to use this weak password? It may be easier to crack and therefore provide less protection for the encrypted values.')) {
    return
  }

  // TODO: description and allowed origins for password. For example, let web application suggest allowed origins and user confirm them. Probably does not make sense to request these from the user, especially if the key is not stored.
  usedKey.value = await keyStore.generatePasswordKey(chosenPassword.value, 'password-derived key', ['*'], chosenPasswordStoreKey.value)
}

const passwordReRequest = ref(false)
const reRequestedPassword = ref('')
const passwordReRequestError: Ref<string | null> = ref(null)
async function providePassword() {
  if (reRequestedPassword.value === '') {
    return
  }
  if (props.field.ciphertextValue === null) {
    passwordReRequestError.value = 'No ciphertext value available. This is not expected to happen.'
    return
  }
  // decrypt existing value with this password
  try {
    ready.value = false
    const [key, plaintext] = await keyStore.decryptWithPasswordKey(props.field.ciphertextValue, props.field.origin, undefined, reRequestedPassword.value, chosenPasswordStoreKey.value)
    usedKey.value = key
    plaintextValue.value = plaintext
  } catch (e) {
    if (!(e instanceof BDPParameterError)) {
      throw e
    }
    passwordReRequestError.value = e.message
  } finally {
    ready.value = true
    ciphertextProvidedToWebApp.value = true
    ciphertextFresh.value = true
  }
}

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

  ready.value = false
  errorMessage.value = null
  chosenPassword.value = ''
  chosenPasswordStoreKey.value = true
  await keyStore.load()
  if (props.field.ciphertextValue !== null) {
    let key: StoredKey, plaintext: string
    try {
      switch (props.field.options.protectionMode) {
        case 'user-only':
          [key, plaintext] = await keyStore.decryptWithUserOnlyKey(props.field.ciphertextValue, props.field.origin)
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
            ready.value = true
            return
          }
          break
        default:
          throw new Error(`unsupported protection mode ${props.field.options.protectionMode}`)
      }
      ciphertextValueCopy = props.field.ciphertextValue

      usedKey.value = key
      plaintextValue.value = plaintext
      ciphertextProvidedToWebApp.value = true
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
    ciphertextProvidedToWebApp.value = false
  }

  ready.value = true
  ciphertextFresh.value = true
  ciphertextLoading.value = false
}

onBeforeMount(loadCiphertext)
watch(() => props.field.ciphertextValue, loadCiphertext)

const selectableKeys = computed(() => {
  switch (props.field.options.protectionMode) {
    case 'user-only':
      return keyStore.getUserOnlyKeysForOrigin(props.field.origin)
    case 'password':
      return keyStore.getPasswordKeysForOrigin(props.field.origin)
    default:
      throw new Error('unsupported protection mode')
  }
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
  ciphertextProvidedToWebApp.value = true
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
  <div v-if="ready">
    <strong>Current origin:</strong>
    {{ field.origin }}


    <div v-if="errorMessage === null">
      <div v-if="usedKey === null">
        <template v-if="field.options.protectionMode === 'password'">
          <template v-if="!passwordReRequest">
            This is a password-protected field that has no value.
            <strong>Choose a password to encrypt this field's value with.</strong>
            <form @submit.prevent="choosePassword">
              <label class="form-label">
                Password
                <div class="has-icon-left">
                  <input type="password" v-model="chosenPassword" class="form-input" autofocus />
                  <i class="form-icon fa-solid fa-key"></i>
                </div>
              </label>

              <div class="bar bar-sm" :style="'background: ' + (passwordStrength.score < 1 ? 'red' : 'white') + ';'">
                <div class="bar-item" role="progressbar"
                  :style="'width: ' + passwordStrength.score * 25 + '%; background: ' + (passwordStrength.score > 3 ? 'green' : passwordStrength.score > 1 ? 'orange' : 'red') + ';'"
                  :aria-valuenow="passwordStrength.score" aria-valuemin="0" aria-valuemax="4"></div>
              </div>
              Password strength: {{ passwordStrength.score }}/4
              <div v-if="passwordStrength.feedback.warning" class="toast toast-warning">
                {{ passwordStrength.feedback.warning }}
              </div>
              <div v-for="suggestion in passwordStrength.feedback.suggestions">
                {{ suggestion }}
              </div>
              <div>
                Expected time to crack:
                {{ passwordStrength.crack_times_display.offline_slow_hashing_1e4_per_second }}
              </div>

              <div class="form-group">
                <label class="form-switch">
                  <input type="checkbox" v-model="chosenPasswordStoreKey">
                  <i class="form-icon"></i> Store the key derived from this password. The password itself is never stored.
                </label>
              </div>

              <button type="submit" class="btn btn-block" :disabled="chosenPassword === ''"
                :class="{ 'btn-error': passwordStrength.score < 4, 'btn-primary': passwordStrength.score === 4 }">
                Use this password
                <template v-if="passwordStrength.score < 4">(not recommended)</template>
              </button>
            </form>
          </template>
          <template v-else>
            <strong>
              This is a password-protected field that already has a value, but the key is not available.
              Provide the password that was used to encrypt this field's value.
            </strong>
            <form @submit.prevent="providePassword">
              <label class="form-label">
                Password
                <div class="has-icon-left">
                  <input type="password" v-model="reRequestedPassword" class="form-input" autofocus />
                  <i class="form-icon fa-solid fa-key"></i>
                </div>
              </label>

              <div class="form-group">
                <label class="form-switch">
                  <input type="checkbox" v-model="chosenPasswordStoreKey">
                  <i class="form-icon"></i> Store the key derived from this password. The password itself is never stored.
                </label>
              </div>

              <div class="toast toast-error" v-if="passwordReRequestError !== null">
                {{ passwordReRequestError }}
              </div>

              <button type="submit" class="btn btn-block btn-primary" :disabled="reRequestedPassword === ''">
                Check password
              </button>
            </form>
          </template>
        </template>
        <template v-else>
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
        </template>
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