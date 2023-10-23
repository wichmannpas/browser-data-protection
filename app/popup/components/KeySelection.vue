<script setup lang="ts">
import { PropType, computed } from 'vue'
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

const selectableKeys = computed(() => {
  switch (props.field.options.protectionMode) {
    case 'symmetric':
      return props.keyStore.getSymmetricKeysForOrigin(props.field.origin, props.field.options.distributionMode as SymmetricKey['distributionMode'])
    case 'password':
      return props.keyStore.getPasswordKeysForOrigin(props.field.origin)
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
  <div v-if="selectableKeys.length > 0">
    <p>
      This field does not have a value.
      <strong>
        Choose the key to use for this field.
      </strong>
      You can manage your keys in the <a href="#" @click="activeView = 'manage-keys'">key manager</a>.
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
    <KeyAgreement v-if="field.options.distributionMode === 'key-agreement'" :field="field" :key-store="keyStore" />
    <template v-else>
      No suitable key available.
      You can create a new key using the <a href="#" @click="navigateToCreateKey">key manager</a>.
    </template>
  </p>
</template>