<script setup lang="ts">
import { PropType, computed, ref } from 'vue';
import zxcvbn from 'zxcvbn';
import InternalProtectedField from '../../scripts/InternalProtectedField';
import KeyStore, { BDPParameterError } from '../../scripts/KeyStore';
import { chosenPassword, usedKey, chosenPasswordStoreKey, reRequestedPassword, passwordReRequestError, plaintextValue, editReady, ciphertextFresh, ciphertextProvidedToWebApp, passwordReRequest } from '../../scripts/popupAppState';
import PasswordStrength from './PasswordStrength.vue'

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

const passwordStrength = computed(() => zxcvbn(chosenPassword.value))
async function choosePassword() {
  if (chosenPassword.value === '') {
    return
  }
  if (passwordStrength.value.score < 4 && !confirm('Are you sure that you would like to use this weak password? It may be easy to crack and therefore provide less protection for the encrypted values.')) {
    return
  }

  // TODO: description and allowed origins for password. For example, let web application suggest allowed origins and user confirm them. Probably does not make sense to request these from the user, especially if the key is not stored.
  usedKey.value = await props.keyStore.generatePasswordKey(chosenPassword.value, 'password-derived key', ['*'], chosenPasswordStoreKey.value)
}

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
    editReady.value = false
    const [key, plaintext] = await props.keyStore.decryptWithPasswordKey(props.field.ciphertextValue, props.field.origin, undefined, reRequestedPassword.value, chosenPasswordStoreKey.value)
    usedKey.value = key
    plaintextValue.value = plaintext
  } catch (e) {
    if (!(e instanceof BDPParameterError)) {
      throw e
    }
    passwordReRequestError.value = e.message
  } finally {
    editReady.value = true
    ciphertextProvidedToWebApp.value = true
    ciphertextFresh.value = true
  }
}

</script>

<template>
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
      <PasswordStrength :passwordStrength="passwordStrength" />

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