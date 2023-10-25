<script setup lang="ts">
import { PropType, computed, onBeforeMount, ref } from 'vue'
import InternalProtectedField from '../../scripts/InternalProtectedField'
import KeyStore, { SymmetricKey } from '../../scripts/KeyStore'
import { ProtectedFieldOptions } from '../../scripts/ProtectedFieldOptions'
import { activeView, createKeyFor, createKeyForDistributionMode, usedKey, previouslyUsedKey } from '../../scripts/popupAppState'
import KeyAgreement from './KeyAgreement.vue'

const props = defineProps({
  field: {
    type: InternalProtectedField,
    required: true
  },
  keyStore: {
    type: Object as PropType<KeyStore>,
    required: true
  },
})

const deriveNewKey = ref(false)

onBeforeMount(() => {
  if (props.field.othersPublicKey !== undefined || props.field.ownPublicKeyId !== undefined) {
    deriveNewKey.value = true
  }
})

const selectableKeys = computed(() => {
  switch (props.field.options.protectionMode) {
    case 'symmetric':
      return props.keyStore.getSymmetricKeysForOrigin(props.field.origin, props.field.options.distributionMode as SymmetricKey['distributionMode'])
    case 'password':
      return props.keyStore.getPasswordKeysForOrigin(props.field.origin)
    case 'recipient':
      return props.keyStore.getRecipientKeysForOrigin(props.field.origin)
    default:
      throw new Error('unsupported protection mode')
  }
})

function navigateToCreateKey() {
  activeView.value = 'manage-keys'
  createKeyFor.value = props.field.options.protectionMode
  createKeyForDistributionMode.value = props.field.options.distributionMode as ProtectedFieldOptions['distributionMode']
}
</script>

<template>
  <template v-if="field.options.protectionMode === 'recipient' && field.options.distributionMode === 'direct-plain'">
    This field is defined to get its encryption key from the web application.
    However, <strong>the web application did not provide the public key</strong> for this field.
  </template>
  <div v-else-if="selectableKeys.length > 0 && !deriveNewKey">
    <p>
      This field does not have a value.
      <strong>
        Choose the key to use for this field.
      </strong>
      You can manage your keys in the <a href="#" @click="activeView = 'manage-keys'">key manager</a>.
    </p>
    <p v-if="props.field.options.distributionMode === 'key-agreement'">
      You can <button class="btn btn-link" @click="deriveNewKey = true">perform a new key agreement</button> with the
      other party for this field.
    </p>
    <table class="table table-striped table-hover">
      <tbody>
        <tr v-for="key in selectableKeys" @click="usedKey = key" class="c-hand"
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
            <button @click="usedKey = key; $event.stopPropagation()" class="btn btn-link tooltip tooltip-left"
              data-tooltip="Use this key for the field's value">
              <i class="fa-solid fa-check"></i>
            </button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
  <p v-else>
    <KeyAgreement v-if="field.options.distributionMode === 'key-agreement'" :field="field" :key-store="keyStore"
      @key-generated="key => { deriveNewKey = false; usedKey = key }" />
    <template v-else>
      No suitable key available.
      You can create a new key using the <a href="#" @click="navigateToCreateKey">key manager</a>.
    </template>
  </p>
</template>