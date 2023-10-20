export interface ProtectedFieldOptions {
  protectionMode: 'symmetric' | 'password' | 'recipient'
  distributionMode?: 'local' | 'direct-plain' | 'external' | 'key-agreement'
  readOnly: boolean
  updateMode: 'immediate' | 'on-submit'

  // A callback that is executed when the ciphertext value of this field changes. Also triggered when the value is set/updated by the web application.
  ciphertextChangedCallback?: (ciphertext: string | null) => void

  // A callback that is executed when a public key is provided to be used with this field. This is applicable for symmetric protection in the key-agreement distribution mode and for recipient protection in the direct-plain distribution mode.
  publicKeyProvidedCallback?: (publicKey: string) => void
}