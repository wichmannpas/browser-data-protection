import { Ref, ref } from 'vue'
import { ProtectedFieldOptions } from './ProtectedFieldOptions'
export const activeView: Ref<string> = ref('edit-value')

// used to directly open the key generation form in the key manager
export const createKeyFor: Ref<null | string> = ref(null)
export const createKeyForDistributionMode: Ref<null | ProtectedFieldOptions['distributionMode']> = ref(null)