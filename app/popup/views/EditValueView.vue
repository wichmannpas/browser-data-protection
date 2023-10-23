<script setup lang="ts">
import { computed, onBeforeMount, reactive, ref } from 'vue'
import EditValue from '../components/EditValue.vue';
import InternalProtectedField from '../../scripts/InternalProtectedField'
import { deserializeValue } from '../../scripts/utils';
import { KeyAgreementKeyPair } from '../../scripts/KeyStore';

const tabState = reactive({
  activeFieldId: null as null | number,
  fields: [] as InternalProtectedField[]
})
const ready = ref(false)

const activeField = computed(() => {
  if (tabState.activeFieldId === null) {
    return null
  }

  const field = tabState.fields.find(field => field.fieldId === tabState.activeFieldId)
  if (field === undefined) {
    throw new Error(`field with id ${tabState.activeFieldId} not found`)
  }
  return field as InternalProtectedField
})

const valueChanged = ref(false)
const valueChangedFadeOut = ref(false)
let valueChangedTimeout: number | null = null
chrome.runtime.onMessage.addListener(message => {
  if (message.context !== 'bdp') {
    return
  }
  let field: InternalProtectedField | undefined
  switch (message.operation) {
    case 'updateCiphertextPopup':
      if (message.fieldId !== tabState.activeFieldId) {
        // not relevant, discard
        return
      }
      // update the ciphertext value
      field = tabState.fields.find(field => field.fieldId === message.fieldId) as InternalProtectedField | undefined
      if (field === undefined) {
        throw new Error('active field no longer found')
      }
      field.ciphertextValue = message.ciphertextValue

      valueChangedFadeOut.value = false
      valueChanged.value = true
      window.setTimeout(() => {
        valueChangedFadeOut.value = true
      }, 100)
      if (valueChangedTimeout !== null) {
        clearTimeout(valueChangedTimeout)
      }
      valueChangedTimeout = window.setTimeout(() => {
        valueChanged.value = false
      }, 6000)

      break
    case 'updatePublicKeyData':
      if (message.fieldId !== tabState.activeFieldId) {
        // not relevant, discard
        return
      }
      // update the ciphertext value
      field = tabState.fields.find(field => field.fieldId === message.fieldId) as InternalProtectedField | undefined
      if (field === undefined) {
        throw new Error('active field no longer found')
      }
      field.setPublicKeyData(message.othersPublicKey, message.ownPublicKeyId)
      break
  }
})

onBeforeMount(() => {
  chrome.runtime.sendMessage({ context: 'bdp', operation: 'getTabState' }, async response => {
    for (let i = 0; i < response.fields.length; i++) {
      const field: InternalProtectedField = response.fields[i]
      // Chrome uses JSON serialization, which makes a native object of the InternalProtectedField.
      const newField = new InternalProtectedField(field.fieldId, field.origin, field.element, field.options, field.ciphertextValue)
      Object.assign(newField, field)
      if (newField.othersPublicKey !== undefined) {
        newField.othersPublicKey = await deserializeValue(newField.othersPublicKey) as KeyAgreementKeyPair
      }

      response.fields[i] = newField
    }
    Object.assign(tabState, response)
    ready.value = true
  })
})

</script>

<template>
  <div v-if="ready">
    <h5>Edit Field Value</h5>
    <div v-if="valueChanged" class="toast toast-warning" :class="{ 'fade-out': valueChangedFadeOut }">
      <i class="fa-solid fa-exclamation-triangle"></i>
      The ciphertext value was just updated by the web application.
      The value below was updated accordingly.
    </div>
    <EditValue v-if="activeField" :field="activeField" />
    <div v-else-if="tabState.fields.length > 0">
      <p>
        No field is currently selected.
      </p>
    </div>
    <div v-else>
      <p>
        This web application has no secure fields.
      </p>
    </div>
  </div>
  <div v-else class="loading loading-lg"></div>
</template>

<style scoped>
.fade-out {
  opacity: 0;
  transition: opacity 4s ease-in 2s;
}
</style>