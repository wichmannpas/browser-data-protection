export interface ProtectedFieldOptions {
  protectionMode: 'user-only' | 'password' | 'symmetric' | 'recipient'
  distributionMode: 'local' | 'direct-plain' | 'direct-wrapped' | 'external' | 'key-agreement'
  readOnly: boolean
  updateMode: 'immediate' | 'on-submit'

  ciphertextChangedCallback?: (ciphertext: string) => void
}