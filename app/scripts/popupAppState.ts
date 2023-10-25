import { Ref, ref } from 'vue'
import { ProtectedFieldOptions } from './ProtectedFieldOptions'
import { StoredKey } from './KeyStore'
export const activeView: Ref<string> = ref('edit-value')

// used to directly open the key generation form in the key manager
export const createKeyFor: Ref<null | string> = ref(null)
export const createKeyForDistributionMode: Ref<null | ProtectedFieldOptions['distributionMode']> = ref(null)

// value edit state
export const editReady = ref(false)

export const plaintextValue = ref('')

export const previouslyUsedKey: Ref<StoredKey | null> = ref(null)
export const usedKey: Ref<StoredKey | null> = ref(null)

export const passwordReRequest = ref(false)
export const reRequestedPassword = ref('')
export const passwordReRequestError: Ref<string | null> = ref(null)
export const chosenPassword = ref('')
export const chosenPasswordStoreKey = ref(true)

// whether the ciphertext provided to the web application is fresh, i.e., the newest changes to the plaintext value are reflected.
export const ciphertextProvidedToWebApp = ref(false)
export const ciphertextFresh = ref(true)