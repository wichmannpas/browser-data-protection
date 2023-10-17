<script setup lang="ts">
import { PropType, Ref, ref } from 'vue'
import KeyStore, { RecipientKey, StoredKey, isPasswordKey, isRecipientKey } from '../../scripts/KeyStore';

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
    case 'user-only':
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
          <tr>
            <td>
              <button class="btn btn-link btn-sm tooltip tooltip-right" data-tooltip="Show details"
                @click="showDetailsForKey = key.keyId" v-if="showDetailsForKey !== key.keyId">
                <i class="fa-solid fa-magnifying-glass"></i>
              </button>
              <button class="btn btn-link btn-sm tooltip tooltip-right" data-tooltip="Close details"
                @click="showDetailsForKey = null" v-if="showDetailsForKey === key.keyId">
                <i class="fa-solid fa-xmark"></i>
              </button>
            </td>
            <td class="key-id">{{ key.keyId }}</td>
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
              <td colspan="5">
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
                <div v-if="keyType === 'symmetric'">
                  <strong>Export Key</strong>
                </div>
              </td>
            </tr>
            <tr>
              <td colspan="5">
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
.key-list {
  overflow-y: auto;
  max-height: 20em;
}

.key-detail-head {
  font-weight: bold;
  font-size: 1.1em;
  display: block;
}
</style>