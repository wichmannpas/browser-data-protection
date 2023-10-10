<script setup lang="ts">
import { Ref, computed, onBeforeMount, ref, watch } from 'vue'
import InternalProtectedField from '../../scripts/InternalProtectedField'
import KeyStore, { StoredKey, keyTypes } from '../../scripts/KeyStore';
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

// whether the ciphertext provided to the web application is fresh, i.e., the newest changes to the plaintext value are reflected.
const ciphertextFresh = ref(true)

// key store values are reactive
const keyStore = KeyStore.getKeyStore()

onBeforeMount(() => {
  keyStore.load().then(() => {
    ready.value = true
  })
  ciphertextFresh.value = true
})

const plaintextValue = ref('')

let updateTimeout: number | null = null

watch(plaintextValue, () => {
  ciphertextFresh.value = false

  if (props.field.options.updateMode === 'immediate') {
    // for security reasons, immediate mode updates onnly if there has not been a typed character for 1 second
    if (updateTimeout !== null) {
      window.clearTimeout(updateTimeout)
    }
    updateTimeout = window.setTimeout(() => {
      console.warn('TODO: actually encrypt and propagate value')
      ciphertextFresh.value = true
    }, 1000)
  }
})

const usedKey: Ref<StoredKey | null> = ref(null)

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

async function finishEditing() {
  // TODO: handle value

  await chrome.runtime.sendMessage({
    context: 'bdp',
    operation: 'stopEdit'
  })
  window.close()
}
</script>

<template>
  <div>
    <p>
      <strong>Current origin:</strong>
      {{ field.origin }}
    </p>

    <div v-if="usedKey === null">
      <template v-if="selectableKeys.length > 0">
        <p>
          This field does not have a value yet.
          <strong>
            Choose the key to use for this field.
          </strong>
          You can manage your keys in the <a href="#" @click="activeView = 'manage-keys'">key manager</a>.
        </p>
        <table class="table table-striped table-hover">
          <tbody>
            <tr v-for="key in selectableKeys">
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
      </p>

      <label class="form-label">
        Value to be encrypted
        <input type="text" v-model="plaintextValue" class="form-input" :readonly="field.options.readOnly" />
      </label>

      <button type="submit" class="btn btn-block btn-success">
        Finish editing
      </button>

      {{ plaintextValue }}

      {{ ciphertextFresh }}
    </form>
  </div>
</template>