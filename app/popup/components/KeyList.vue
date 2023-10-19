<script setup lang="ts">
import { PropType, Ref, computed, ref, watch } from 'vue'
import KeyStore, { RecipientKey, StoredKey, SymmetricKey, isPasswordKey, isRecipientKey } from '../../scripts/KeyStore';
import zxcvbn from 'zxcvbn';
import PasswordStrength from './PasswordStrength.vue';
import { serializeValue } from '../../scripts/utils';

const props = defineProps({
  keyType: {
    type: String,
    required: true,
  },
  keys: {
    type: Array as PropType<StoredKey[]>,
    required: true,
  },
  keyStore: {
    type: KeyStore,
    required: true,
  }
})

const showDetailsForKey: Ref<null | string> = ref(null)

const exportPassword = ref('')
const exportPasswordStrength = computed(() => zxcvbn(exportPassword.value))
const exportPasswordLoading = ref(false)
const exportedKey: Ref<null | string> = ref(null)
async function exportKey(key: SymmetricKey) {
  exportPasswordLoading.value = true

  // create a non-stored password key as wrapping key for the export
  const wrappingKey = await props.keyStore.generatePasswordKey(exportPassword.value, '', ['*'], false)

  const wrappedKey = await props.keyStore.encryptWithPasswordKey(JSON.stringify(await serializeValue(key)), wrappingKey, '')

  exportedKey.value = btoa(wrappedKey)
  exportPasswordLoading.value = false
}

watch(() => showDetailsForKey.value, () => {
  exportPassword.value = ''
  exportPasswordLoading.value = false
  exportedKey.value = null
})

function deleteKey(key: StoredKey | RecipientKey) {
  if (isPasswordKey(key)) {
    if (!confirm(`Do you really want to permanently delete the key with the id ${key.keyId}? You will not be able to view or update any values that use this key. If you still know the corresponding password, you will be able to restore this key when presented with a ciphertext that was encrypted with this key.`)) {
      return
    }
  } else {
    if (!confirm(`Do you really want to PERMANENTLY DELETE the key with the id ${key.keyId}? You will not be able to view or update any values that use this key.`)) {
      return
    }
    if (!isRecipientKey(key) || key.privateKey !== null) {
      if (!confirm(`Asking again: Do you want to PERMANENTLY DELETE the key with the id ${key.keyId}? The operation cannot be undone. Unless the key has been shared with another device or user, it will not be possible to regain access to the values protected with it.`)) {
        return
      }
    }
  }

  switch (props.keyType) {
    case 'symmetric':
      props.keyStore.deleteSymmetricKey(key.keyId)
      break
    case 'password':
      props.keyStore.deletePasswordKey(key.keyId)
      break
    default:
      throw new Error(`unsupported key type ${props.keyType} for key deletion`)
  }

}
</script>

<template>
  <div class="key-list">
    <table class="table table-striped table-hover table-bordered">
      <thead>
        <tr>
          <th></th>
          <th>
            Key id
          </th>
          <th v-if="keyType === 'symmetric'">
            Distr. mode
          </th>
          <th>
            Desc.
          </th>
          <th>
            Allowed origins
          </th>
          <th>
            Last used
          </th>
        </tr>
      </thead>
      <tbody>
        <template v-for="key in props.keys">
          <tr @click="showDetailsForKey = key.keyId" class="c-hand">
            <td>
              <button class="btn btn-link btn-sm tooltip tooltip-right" data-tooltip="Show details"
                @click="showDetailsForKey = key.keyId; $event.stopPropagation()" v-if="showDetailsForKey !== key.keyId">
                <i class="fa-solid fa-magnifying-glass"></i>
              </button>
              <button class="btn btn-link btn-sm tooltip tooltip-right" data-tooltip="Close details"
                @click="showDetailsForKey = null; $event.stopPropagation()" v-if="showDetailsForKey === key.keyId">
                <i class="fa-solid fa-xmark"></i>
              </button>
            </td>
            <td class="key-id">{{ key.keyId }}</td>
            <td v-if="keyType === 'symmetric'">
              {{ (key as SymmetricKey).distributionMode }}
            </td>
            <td>
              {{ key.shortDescription }}
            </td>
            <td>
              <template v-for="(origin, i) in key.allowedOrigins"><template v-if="i > 0">, </template>{{ origin
              }}</template>
            </td>
            <td>
              <template v-if="key.lastUsed === null">
                –
              </template>
              <template v-else>
                {{ key.lastUsed.toLocaleDateString() }}
                {{ key.lastUsed.toLocaleTimeString() }}
              </template>
            </td>
          </tr>
          <template v-if="showDetailsForKey === key.keyId">
            <!-- even number of additional rows so the striping of further rows does not get affected -->
            <tr>
              <td colspan="6">
                <span class="key-detail-head">
                  Key <span class="key-id">{{ key.keyId }}</span>
                </span>
                <strong>Description:</strong>
                {{ key.shortDescription }}
                <br />
                <strong>Used on origins: </strong>
                <template v-if="key.previouslyUsedOnOrigins.length > 0">
                  <template v-for="(origin, i) in key.previouslyUsedOnOrigins"><template v-if="i > 0">, </template>{{
                    origin
                  }}</template>
                </template>
                <template v-else>
                  <em>Key never used</em>
                </template>
                <br />
                <strong>Created:</strong>
                {{ key.created.toLocaleDateString() }}
                {{ key.created.toLocaleTimeString() }}
                <hr />
                <form
                  v-if="keyType === 'symmetric' && ['user-only', 'external'].includes((key as SymmetricKey).distributionMode)"
                  @submit.prevent="exportKey(key as SymmetricKey)">
                  <div class="accordion">
                    <input type="checkbox" id="accordion-1" name="accordion-checkbox" hidden>
                    <label class="accordion-header" for="accordion-1">
                      <i class="icon icon-arrow-right mr-1"></i>
                      <strong>Export key</strong>
                    </label>
                    <div class="accordion-body">
                      When you export the key, you receive a
                      <div v-if="(key as SymmetricKey).distributionMode === 'user-only'" class="toast toast-warning">
                        This is <strong>your personal key</strong> and must not be shared with other users.
                        Only share this key with your other browsers and devices.
                        <strong>Never provide the exported key or the password you choose for the export to
                          anybody.</strong>
                      </div>
                      <label class="form-label">
                        Export password
                        <input type="password" class="form-input" v-model="exportPassword"
                          :disabled="exportPasswordLoading"
                          placeholder="This password needs to be entered to import this key." />
                      </label>
                      <PasswordStrength :passwordStrength="exportPasswordStrength" />
                      <button type="submit" class="btn btn-primary btn-block" :class="{ loading: exportPasswordLoading }"
                        :disabled="exportPasswordLoading">Export key</button>
                      <div v-if="exportedKey !== null" class="exported-key-div">
                        <strong>Exported key:</strong>
                        <textarea v-model="exportedKey" readonly class="form-input" rows="4"></textarea>
                      </div>
                    </div>
                  </div>
                </form>
              </td>
            </tr>
            <tr>
              <td colspan="6">
                <button class="btn btn-sm btn-error" @click="deleteKey(key)">
                  <i class="fa-solid fa-trash"></i>
                  Permanently delete this key
                </button>
              </td>
            </tr>
          </template>
        </template>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.key-detail-head {
  font-weight: bold;
  font-size: 1.1em;
  display: block;
}

.exported-key-div>textarea {
  font-family: monospace;
}
</style>