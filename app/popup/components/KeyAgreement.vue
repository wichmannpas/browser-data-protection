<script setup lang="ts">
import { PropType, Ref, onBeforeMount, ref } from 'vue';
import InternalProtectedField from '../../scripts/InternalProtectedField';
import KeyStore from '../../scripts/KeyStore';

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

const generateKeyLoading = ref(false)
const generatedKeyId: Ref<string | null> = ref(null)
async function generateKeyPair() {
  if (generatedKeyId.value !== null) {
    console.warn('Request to generate a key pair in spite of already having generated one.')
    return
  }

  generateKeyLoading.value = true
  const [keyId, publicKey] = await props.keyStore.generateKeyAgreementKeyPair(props.field.origin)
  props.field.propagateKeyAgreementPublicKey(publicKey, keyId)
  generatedKeyId.value = keyId
  generateKeyLoading.value = false
}

const deriveKeyLoading = ref(false)
async function deriveKey() {
  if (generatedKeyId.value === null || props.field.othersPublicKey === undefined || props.field.othersPublicKey.origin !== props.field.origin) {
    console.warn('Request to derive a key in spite of not having generated a key pair or not having received (a valid) other party\'s public key.')
    return
  }

  deriveKeyLoading.value = true
  // TODO
}

const ready = ref(false)
const ownKeyPairNotFound = ref(false)

onBeforeMount(async () => {
  ownKeyPairNotFound.value = false

  // if own key id is set, load the key
  if (props.field.ownPublicKeyId !== undefined) {
    const keyPair = await props.keyStore.loadKeyAgreementKeyPair(props.field.ownPublicKeyId, origin)
    if (keyPair === undefined) {
      ownKeyPairNotFound.value = true
    } else {
      generatedKeyId.value = props.field.ownPublicKeyId
    }
  }

  ready.value = true
})
</script>

<template>
  <template v-if="ready">
    <div>
      <p>
        This field uses a key agreement protocol to establish an encryption key between you and the other party.
      </p>

      <h4>Step 1: Generate Your Key Pair</h4>
      <div>
        You can generate a key pair to use for this key agreement.
        The key pair as well as the symmetric key that results from the key agreement are bound to this specifc origin and
        cannot be used in another web application.

        <div v-if="generatedKeyId !== null">
          A public key was generated and provided to the web application. As soon as the key from the other party is
          received, the encryption key can be derived.
          The key has the following id:
          <div class="key-id">
            {{ generatedKeyId }}
          </div>
        </div>
        <button v-if="generatedKeyId === null" @click="generateKeyPair" class="btn btn-block"
          :disabled="generateKeyLoading" :class="{ loading: generateKeyLoading }">Generate key pair</button>
      </div>

      <h4>Step 2: Receive and Verify Other's Public Key</h4>
      <template v-if="field.othersPublicKey !== undefined">
        <div v-if="field.othersPublicKey.origin !== field.origin" class="toast toast-warning">
          The key of the other party was generated on a different origin (i.e., a different web application) and cannot be
          used for this field.
          The origin of the other key is: {{ field.othersPublicKey.origin }}
        </div>
        <p v-else>
          The public key of the other party has the following key id:
          <span class="key-id">
            {{ field.othersPublicKey.keyId }}
          </span>
          <br />
          <strong>Make sure to verify this key id with the other party via a secure channel.</strong>
          Otherwise, an attacker or the web application may be able to decrypt you messages.
        </p>
      </template>
      <p v-else>
        The web application did not provide a public key of the other party.
        To continue, the web application first needs to provide the public key of the other party.
      </p>

      <h4>Step 3: Generate Final Key</h4>
      <div
        v-if="generatedKeyId !== null && field.othersPublicKey !== undefined && field.othersPublicKey.origin === field.origin">
        <p>
          The public key of the other party was received and verified.
          The key agreement protocol can now be completed and the encryption key can be derived.
        </p>
        <button class="btn btn-block btn-success" @click="deriveKey" :disabled="deriveKeyLoading"
          :class="{ loading: deriveKeyLoading }">Derive key</button>
      </div>
      <div v-else>
        The first two steps need to be completed before the key can be derived.
      </div>
    </div>
  </template>
  <div v-else class="loading loading-lg"></div>
</template>