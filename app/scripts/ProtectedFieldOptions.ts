export interface ProtectedFieldOptions {
  protectionMode: 'user-only' | 'password' | 'symmetric' | 'recipient'
  distributionMode: 'local' | 'direct-plain' | 'direct-wrapped' | 'external' | 'key-agreement'
  readOnly: boolean
  updateMode: 'immediate' | 'on-submit'

  // A callback that is executed when the ciphertext value of this field changes. Also triggered when the value is set/updated by the web application.
  ciphertextChangedCallback?: (ciphertext: string) => void
}