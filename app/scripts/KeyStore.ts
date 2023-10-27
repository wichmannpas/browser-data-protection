import { reactive, toRaw } from 'vue'
import { SerializedKey, bufferFromBase64, bufferToBase64, deriveKeyId, deserializeKey, deserializeValue, deserializeValues, serializeKey, serializeValue, serializeValues } from './utils'

export const keyTypes = [
  // [keyType, keyText, keyTextAdjective (used with the word "key" appended), keyDescription]
  ['symmetric', 'Symmetric', 'symmetric', 'A key that either is used only by a single user or that is additionaly shared with a specific set of other users, depending on the key type.'],
  ['password', 'Password', 'password', 'A password that is used for the decryption of a specific value or set of values. Its encryption key can optionally be saved here so the password does not need to be entered every time. Every password is bound to a specific input field. The password itself is never stored, only the resulting key.'],
  ['recipient', 'Recipient', 'recipient', 'A key that is shared/received with a specific user. Only the key owner (who knows the so-called private key) can decrypt values encrypted with this key. Other users can only encrypt values for this key.'],
]

export type KeyId = string
export type Ciphertext = object
export type EncodedCiphertext = string
export type EncodedValueAndSignature = string

// Keys are a regular object following a StoredKey interface, which makes them easily serializable and deserializable for storage.local.
export interface StoredKey {
  keyId: KeyId
  shortDescription: string
  created: Date
  lastUsed: null | Date
  allowedOrigins: string[]
  previouslyUsedOnOrigins: string[]
}

export interface SymmetricKey extends StoredKey {
  key: CryptoKey
  distributionMode: 'user-only' | 'external' | 'key-agreement'
}

export interface PasswordKey extends StoredKey {
  key: CryptoKey
  salt: string
}
export function isPasswordKey(key: StoredKey): key is PasswordKey {
  return 'salt' in key
}

/**
 * The recipient key consists of a signing key pair (ECDSA) and an encryption key pair (RSA-OAEP).
 * The keyId of the RecipientKey is that of the signing key pair, which is the main key pair.
 * To prevent forging of the encryption key, a signature of the encryption key pair's public key is provided under the signing key pair.
 * It must always be verified that the key pair is consistent, i.e., that BOTH the key id of the key pair matches the derived key id from the
 * signing key pair AND the signature is valid for the key id newly derived from the encryption key pair's public key.
 * Both validations are necessary to prevent an attacker from providing a recipient key with a key id that is inconsistent with the actual signing key.
 */
export interface RecipientKey extends StoredKey {
  signingKeyPair: {
    privateKey?: CryptoKey
    publicKey: CryptoKey
  }
  encryptionKeyPair: {
    privateKey?: CryptoKey
    publicKey: CryptoKey
    signature: EncodedValueAndSignature
  }
}
export function isRecipientKey(key: StoredKey): key is RecipientKey {
  return 'signingKeyPair' in key
}

export interface KeyAgreementKeyPair {
  keyId: KeyId
  publicKey: CryptoKey
  privateKey?: CryptoKey
  origin: string
}

export class BDPParameterError extends Error { }
export class KeyMissingError extends BDPParameterError { }
export class DisallowedKeyError extends BDPParameterError { }
export class InvalidCiphertextError extends BDPParameterError { }

interface CiphertextData {
  keyId: KeyId
  iv: string
  ciphertext: EncodedCiphertext
}
interface PasswordKeyCiphertextData extends CiphertextData {
  salt: string
}
interface RecipientCiphertextData {
  encryptedEphemeralKey: { [key: KeyId]: EncodedCiphertext }
  signedEphemeralKeyId: EncodedValueAndSignature
  senderSigningPublicKey: SerializedKey
  senderKeyId: KeyId
  recipientKeyId: KeyId
  encryptedValue: CiphertextData
}

export default class KeyStore {
  static #keyStore: KeyStore | null = null

  #symmetricKeys: { [key: string]: SymmetricKey }
  #passwordKeys: { [key: string]: PasswordKey }
  #recipientKeys: { [key: string]: RecipientKey }
  #keyAgreementKeyPairs: { [key: string]: KeyAgreementKeyPair }
  // per-origin key pair are auto-managed and not manageble by the user. They are used to sign recipient encryption values and to store an additional copy of the ephemeral session key in ciphertext data to allow decryption for the sender as well.
  // The key id of these is displayed to the user to allow verification of the key authenticity if this value is provided via an external secure channel to the recipient.
  #perOriginKeyPairs: { [key: string]: RecipientKey }

  constructor() {
    this.#passwordKeys = reactive(Object.create(null))
    this.#symmetricKeys = reactive(Object.create(null))
    this.#recipientKeys = reactive(Object.create(null))
    this.#keyAgreementKeyPairs = reactive(Object.create(null))
    this.#perOriginKeyPairs = reactive(Object.create(null))
  }

  static getKeyStore(): KeyStore {
    return KeyStore.#keyStore ?? (KeyStore.#keyStore = new KeyStore())
  }

  async #encryptAES(plaintext: string, key: SymmetricKey | PasswordKey, origin: string): Promise<CiphertextData> {
    if (!key.allowedOrigins.includes(origin) && !key.allowedOrigins.includes('*')) {
      throw new DisallowedKeyError('Key usage is not allowed for this origin.')
    }

    const iv = crypto.getRandomValues(new Uint8Array(12))
    const ciphertext = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv,
      },
      key.key,
      new TextEncoder().encode(plaintext),
    )
    const data = {
      keyId: key.keyId,
      iv: bufferToBase64(iv),
      ciphertext: bufferToBase64(ciphertext),
    }

    key.lastUsed = new Date()
    if (!key.previouslyUsedOnOrigins.includes(origin)) {
      key.previouslyUsedOnOrigins.push(origin)
    }
    await this.#save()

    return data
  }
  async #decryptAES(ciphertextData: { keyId: string, iv: string, ciphertext: string }, key: SymmetricKey | PasswordKey, origin: string): Promise<string> {
    if (!key.allowedOrigins.includes(origin) && !key.allowedOrigins.includes('*')) {
      throw new DisallowedKeyError(`Key usage of key ${ciphertextData.keyId} is not allowed for this origin.`)
    }

    try {
      const plaintextBuffer = await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: bufferFromBase64(ciphertextData.iv),
        },
        key.key,
        bufferFromBase64(ciphertextData.ciphertext),
      )
      const plaintext = new TextDecoder().decode(plaintextBuffer)

      return plaintext
    } catch (e) {
      throw new InvalidCiphertextError('Invalid ciphertext.')
    }
  }

  getSymmetricKeys() {
    return Object.values(this.#symmetricKeys).sort((a, b) => a.created.valueOf() - b.created.valueOf())
  }
  getSymmetricKeysForOrigin(origin: string, distributionMode?: SymmetricKey['distributionMode']) {
    let keys = this.getSymmetricKeys().filter(key => key.allowedOrigins.includes(origin) || key.allowedOrigins.includes('*'))
    if (distributionMode !== undefined) {
      keys = keys.filter(key => key.distributionMode === distributionMode)
    }
    return keys
  }
  getSymmetricKeyCount(): number {
    return Object.keys(this.#symmetricKeys).length
  }
  /**
   * Adds a symmetric key to the key store unless it already exists.
   * @returns Whether the key was added or not (i.e., it existed already).
   */
  async addSymmetricKey(key: SymmetricKey): Promise<boolean> {
    if (this.#symmetricKeys[key.keyId] !== undefined) {
      return false
    }
    this.#symmetricKeys[key.keyId] = key
    await this.#save()
    return true
  }
  async generateSymmetricKey(shortDescription: string, allowedOrigins: string[], distributionMode: SymmetricKey['distributionMode'], store = true): Promise<SymmetricKey> {
    const key = await crypto.subtle.generateKey(
      {
        name: 'AES-GCM',
        length: 256
      },
      true,
      ['encrypt', 'decrypt'],
    )
    const keyObj: SymmetricKey = {
      keyId: await deriveKeyId(key),
      shortDescription,
      created: new Date(),
      lastUsed: null,
      allowedOrigins,
      previouslyUsedOnOrigins: [],
      key,
      distributionMode,
    }
    if (store) {
      this.#symmetricKeys[keyObj.keyId] = keyObj
      await this.#save()
    }
    return keyObj
  }
  async encryptWithSymmetricKey(plaintext: string, key: SymmetricKey, origin: string): Promise<string> {
    return JSON.stringify(await this.#encryptAES(plaintext, key, origin))
  }
  async decryptWithSymmetricKey(ciphertext: string, origin: string): Promise<[SymmetricKey, string]> {
    let data: CiphertextData
    try {
      data = JSON.parse(ciphertext)
    } catch {
      throw new BDPParameterError('Invalid ciphertext.')
    }
    if (typeof data !== 'object' || data.keyId === undefined || data.iv === undefined || data.ciphertext === undefined) {
      throw new BDPParameterError('Invalid ciphertext.')
    }

    const key = this.#symmetricKeys[data.keyId]
    if (key === undefined) {
      throw new KeyMissingError(`The key with the id ${data.keyId} was not found.`)
    }

    return [key, await this.#decryptAES(data, key, origin)]
  }
  async deleteSymmetricKey(keyId: string) {
    delete this.#symmetricKeys[keyId]
    await this.#save()
  }

  getPasswordKeys() {
    return Object.values(this.#passwordKeys).sort((a, b) => a.created.valueOf() - b.created.valueOf())
  }
  getPasswordKeysForOrigin(origin: string) {
    return this.getPasswordKeys().filter(key => key.allowedOrigins.includes(origin) || key.allowedOrigins.includes('*'))
  }
  getPasswordKeyCount(): number {
    return Object.keys(this.#passwordKeys).length
  }
  /**
   * Generate a new password key with a unique salt. To re-generate *a specific key* again, the existing salt of the ciphertext needs to be provided.
   * Otherwise, a salt MUST NOT be provided, as it is essential that every new key uses a different salt. When providing a salt, the keyId of the
   * key that is expected to be returned must be provided. Otherwise, no key is stored nor returned.
   */
  async generatePasswordKey(password: string, shortDescription: string, allowedOrigins: string[], storePersistently: boolean, existingSalt?: string, existingKeyId?: string): Promise<PasswordKey> {
    const passwordKey = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(password),
      'PBKDF2',
      false,
      ['deriveBits', 'deriveKey'],
    )
    let salt: ArrayBuffer
    if (existingSalt !== undefined) {
      salt = bufferFromBase64(existingSalt)
    } else {
      salt = crypto.getRandomValues(new Uint8Array(30))
    }
    const key = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt,
        iterations: 250000,
        hash: 'SHA-512',
      },
      passwordKey,
      {
        name: 'AES-GCM',
        length: 256,
      },
      true,
      ['encrypt', 'decrypt'],
    )

    const keyObj: PasswordKey = {
      keyId: await deriveKeyId(key),
      shortDescription,
      created: new Date(),
      lastUsed: null,
      allowedOrigins,
      previouslyUsedOnOrigins: [],
      key,
      salt: bufferToBase64(salt),
    }

    if (existingSalt !== undefined) {
      // when a salt is provided, the keyId must be provided and valid as well
      if (existingKeyId !== keyObj.keyId) {
        throw new BDPParameterError('Invalid password.')
      }
    }

    if (storePersistently) {
      this.#passwordKeys[keyObj.keyId] = keyObj
      await this.#save()
    }

    return keyObj
  }
  async encryptWithPasswordKey(plaintext: string, key: PasswordKey, origin: string): Promise<string> {
    const data = await this.#encryptAES(plaintext, key, origin) as PasswordKeyCiphertextData
    data.salt = key.salt
    return JSON.stringify(data)
  }
  /**
   * Decrypt a ciphertext with a password key. If no key is provided, the keyId of the ciphertext is used to look up the key.
   * Alternatively, it is possible to specify the password to automatically re-generate the required password key.
   */
  async decryptWithPasswordKey(ciphertext: string, origin: string, key?: PasswordKey, password?: string, storeKey?: boolean): Promise<[PasswordKey, string]> {
    let data: PasswordKeyCiphertextData
    try {
      data = JSON.parse(ciphertext)
    } catch {
      throw new BDPParameterError('Invalid ciphertext.')
    }
    if (typeof data !== 'object' || data.keyId === undefined || data.iv === undefined || data.ciphertext === undefined || data.salt === undefined) {
      throw new BDPParameterError('Invalid ciphertext.')
    }

    if (key !== undefined && password !== undefined) {
      throw new Error('Either a key or a password or none of both must be provided, not both.')
    }

    if (key === undefined && password === undefined) {
      key = this.#passwordKeys[data.keyId]
      if (key === undefined) {
        throw new KeyMissingError(`The key with the id ${data.keyId} was not found.`)
      }
    }

    if (key === undefined && password !== undefined) {
      try {
        key = await this.generatePasswordKey(password, 'password-derived key', ['*'], storeKey ?? false, data.salt, data.keyId)
      } catch (e) {
        if (!(e instanceof BDPParameterError)) {
          throw e
        }
        throw new BDPParameterError('The password is invalid.')
      }
    }

    // key is now guaranteed to be defined as every other case is handled above to either provide a key or to throw an error.
    return [key as PasswordKey, await this.#decryptAES(data, key as PasswordKey, origin)]
  }
  async deletePasswordKey(keyId: string) {
    delete this.#passwordKeys[keyId]
    await this.#save()
  }

  getRecipientKeys() {
    return Object.values(this.#recipientKeys).sort((a, b) => a.created.valueOf() - b.created.valueOf())
  }
  getRecipientKeysForOrigin(origin: string) {
    return this.getRecipientKeys().filter(key => key.allowedOrigins.includes(origin) || key.allowedOrigins.includes('*'))
  }
  getRecipientKeyCount(): number {
    return Object.keys(this.#recipientKeys).length
  }
  async #signECDSA(value: string, privateKey: CryptoKey): Promise<EncodedValueAndSignature> {
    const signature = await crypto.subtle.sign(
      {
        name: 'ECDSA',
        hash: {
          name: 'SHA-512',
        }
      },
      privateKey,
      new TextEncoder().encode(value),
    )
    return JSON.stringify({
      value,
      signature: bufferToBase64(signature),
    })
  }
  async #verifyECDSA(value: EncodedValueAndSignature, publicKey: CryptoKey): Promise<[string | undefined, boolean]> {
    try {
      const val: { value: string, signature: string } = JSON.parse(value)
      const result = await crypto.subtle.verify(
        {
          name: 'ECDSA',
          hash: {
            name: 'SHA-512',
          }
        },
        publicKey,
        bufferFromBase64(val.signature),
        new TextEncoder().encode(val.value),
      )
      return [val.value, result]
    } catch (e) {
      console.warn(e)
      return [undefined, false]
    }
  }
  /**
   * Adds a recipient key to the key store unless it already exists.
   * @returns Whether the key was added or not (i.e., it existed already).
   */
  async addRecipientKey(key: RecipientKey): Promise<boolean> {
    if (this.#recipientKeys[key.keyId] !== undefined) {
      return false
    }
    this.#recipientKeys[key.keyId] = key
    await this.#save()
    return true
  }
  async generateRecipientKey(shortDescription: string, allowedOrigins: string[], store = true): Promise<RecipientKey> {
    const signingKeyPair = await crypto.subtle.generateKey(
      {
        name: 'ECDSA',
        namedCurve: 'P-521',
      },
      true,
      ['sign', 'verify'],
    )
    const encryptionKeyPair = await crypto.subtle.generateKey(
      {
        name: 'RSA-OAEP',
        modulusLength: 4096,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256',
      },
      true,
      ['encrypt', 'decrypt'],
    )
    const keyObj: RecipientKey = {
      keyId: await deriveKeyId(signingKeyPair.publicKey),
      signingKeyPair: {
        privateKey: signingKeyPair.privateKey,
        publicKey: signingKeyPair.publicKey,
      },
      encryptionKeyPair: {
        privateKey: encryptionKeyPair.privateKey,
        publicKey: encryptionKeyPair.publicKey,
        signature: await this.#signECDSA(await deriveKeyId(encryptionKeyPair.publicKey), signingKeyPair.privateKey),
      },
      shortDescription,
      created: new Date(),
      lastUsed: null,
      allowedOrigins,
      previouslyUsedOnOrigins: [],
    }
    if (store) {
      this.#recipientKeys[keyObj.keyId] = keyObj
      await this.#save()
    }
    return keyObj
  }
  async deleteRecipientKey(keyId: string) {
    delete this.#recipientKeys[keyId]
    await this.#save()
  }
  async #encryptRSA(plaintext: string, publicKey: CryptoKey): Promise<EncodedCiphertext> {
    const ciphertext = await crypto.subtle.encrypt(
      {
        name: 'RSA-OAEP',
      },
      publicKey,
      new TextEncoder().encode(plaintext),
    )
    return bufferToBase64(ciphertext)
  }
  async #decryptRSA(ciphertext: EncodedCiphertext, privateKey: CryptoKey): Promise<EncodedCiphertext> {
    const plaintextBuffer = await crypto.subtle.decrypt(
      {
        name: 'RSA-OAEP',
      },
      privateKey,
      bufferFromBase64(ciphertext),
    )
    return new TextDecoder().decode(plaintextBuffer)
  }
  async #validateRecipientKeyPair(keyPair: RecipientKey): Promise<boolean> {
    // check that keyId of this key pair is indeed the derived key id from the signing key's public key
    if (keyPair.keyId !== await deriveKeyId(keyPair.signingKeyPair.publicKey)) {
      return false
    }

    // check that key pair's encryption key has a valid signature
    const [signedKeyId, valid] = await this.#verifyECDSA(keyPair.encryptionKeyPair.signature, keyPair.signingKeyPair.publicKey)
    if (signedKeyId !== await deriveKeyId(keyPair.encryptionKeyPair.publicKey) || valid !== true) {
      return false
    }

    return true
  }
  async encryptWithRecipientKey(plaintext: string, recipientKey: RecipientKey, origin: string): Promise<[RecipientKey, EncodedCiphertext]> {
    // load own key pair used for this origin
    const ownKeyPair = await this.getOriginKeyPair(origin)

    const ephemeralKey = await this.generateSymmetricKey('', [origin], 'external', false)
    const serializedEphemeralKey = JSON.stringify(await serializeValue(ephemeralKey))
    const encryptedValue = await this.#encryptAES(plaintext, ephemeralKey, origin)

    const signedEphemeralKeyId = await this.#signECDSA(await deriveKeyId(ephemeralKey.key), ownKeyPair.signingKeyPair.privateKey!)

    const encryptedEphemeralKey = Object.create(null);
    const keyPairsToEncryptFor = [recipientKey, ownKeyPair]
    for (let i = 0; i < keyPairsToEncryptFor.length; i++) {
      const keyPair = keyPairsToEncryptFor[i]

      if (await this.#validateRecipientKeyPair(keyPair) !== true) {
        throw new BDPParameterError(`Key pair ${keyPair.keyId} is invalid.`)
      }
      if (!keyPair.allowedOrigins.includes(origin) && !keyPair.allowedOrigins.includes('*')) {
        throw new BDPParameterError(`Key pair ${keyPair.keyId} is not allowed for this origin ${origin}.`)
      }

      // validation was successful, encrypt ephemeral key for this recipient.
      encryptedEphemeralKey[keyPair.keyId] = await this.#encryptRSA(serializedEphemeralKey, keyPair.encryptionKeyPair.publicKey)
    }

    const ciphertextData: RecipientCiphertextData = {
      encryptedEphemeralKey,
      signedEphemeralKeyId,
      senderSigningPublicKey: await serializeKey(ownKeyPair.signingKeyPair.publicKey),
      senderKeyId: ownKeyPair.keyId,
      recipientKeyId: recipientKey.keyId,
      encryptedValue,
    }
    return [ownKeyPair, JSON.stringify(ciphertextData)]
  }
  async decryptWithRecipientKey(ciphertext: string, origin: string, recipientKeyId?: KeyId): Promise<[KeyId, RecipientKey, string]> {
    // load own key pair used for this origin
    const ownKeyPair = await this.getOriginKeyPair(origin)
    let senderSigningPublicKey: CryptoKey

    let data: RecipientCiphertextData
    try {
      data = JSON.parse(ciphertext)
    } catch {
      throw new BDPParameterError('Invalid ciphertext.')
    }
    if (typeof data !== 'object' || data.encryptedEphemeralKey === undefined || data.recipientKeyId === undefined || data.encryptedValue === undefined || data.senderSigningPublicKey === undefined || data.senderKeyId === undefined) {
      throw new BDPParameterError('Invalid ciphertext.')
    }
    if (recipientKeyId !== undefined && data.recipientKeyId !== recipientKeyId) {
      throw new BDPParameterError('The ciphertext\'s recipient does not match this field\'s recipient.')
    }

    let serializedEphemeralKey: string
    let decryptionKeyPair: RecipientKey | undefined
    if (data.encryptedEphemeralKey[ownKeyPair.keyId] !== undefined) {
      decryptionKeyPair = ownKeyPair
    } else {
      // check whether the required recipient key is in this key store.
      Object.keys(data.encryptedEphemeralKey).forEach(keyId => {
        if (this.#recipientKeys[keyId] !== undefined) {
          decryptionKeyPair = this.#recipientKeys[keyId]

          // check for private key
          if (decryptionKeyPair.encryptionKeyPair.privateKey === undefined) {
            decryptionKeyPair = undefined
            return  // continue
          }

          // check for allowed origin
          if (!decryptionKeyPair.allowedOrigins.includes(origin) && !decryptionKeyPair.allowedOrigins.includes('*')) {
            decryptionKeyPair = undefined
            return  // continue
          }

          return false  // break
        }
      })
    }
    if (decryptionKeyPair === undefined) {
      throw new BDPParameterError('No decryption key is available for this recipient encryption.')
    }
    serializedEphemeralKey = await this.#decryptRSA(data.encryptedEphemeralKey[decryptionKeyPair.keyId], decryptionKeyPair.encryptionKeyPair.privateKey!)
    const ephemeralKey = await deserializeValue(JSON.parse(serializedEphemeralKey)) as SymmetricKey

    // validate sender signature
    try {
      senderSigningPublicKey = await deserializeKey(data.senderSigningPublicKey)
    } catch {
      throw new BDPParameterError(`The sender's public key is invalid.`)
    }
    if (data.senderKeyId !== await deriveKeyId(senderSigningPublicKey)) {
      throw new BDPParameterError(`The sender's public key does not match the sender key id.`)
    }
    const [signedEphemeralKeyId, valid] = await this.#verifyECDSA(data.signedEphemeralKeyId, senderSigningPublicKey)
    if (valid !== true || signedEphemeralKeyId != await deriveKeyId(ephemeralKey.key)) {
      throw new BDPParameterError('Ciphertext has an invalid signature.')
    }

    let recipientKey: RecipientKey
    if (decryptionKeyPair.keyId === data.recipientKeyId) {
      recipientKey = decryptionKeyPair
    } else {
      // origin is not validated here. In case the user attempts to encrypt a new value with the provided recipient key, the origin will be validated before the encryption.
      recipientKey = this.#recipientKeys[data.recipientKeyId]
      if (recipientKey === undefined) {
        throw new BDPParameterError('Recipient key is not available.')
      }
    }

    return [data.senderKeyId, recipientKey, await this.#decryptAES(data.encryptedValue, ephemeralKey, origin)]
  }
  async getOriginKeyPair(origin: string): Promise<RecipientKey> {
    let keyPair = this.#perOriginKeyPairs[origin]
    if (keyPair !== undefined) {
      return keyPair
    }
    // generate a new key pair
    keyPair = await this.generateRecipientKey('', [origin], false)
    this.#perOriginKeyPairs[origin] = keyPair
    await this.#save()
    if (keyPair.signingKeyPair.privateKey === undefined) {
      throw new BDPParameterError('own (origin) key pair is invalid, misses private key.')
    }
    return keyPair
  }

  /**
   * Generate and store an ECDH key pair bound to the specified origin and return the key id and the serialized public key.
   */
  async generateKeyAgreementKeyPair(origin: string): Promise<[KeyAgreementKeyPair, string]> {
    let keyPair = await crypto.subtle.generateKey(
      {
        name: 'ECDH',
        namedCurve: 'P-521',
      },
      true,
      ['deriveKey'],
    )
    const key: KeyAgreementKeyPair = {
      keyId: await deriveKeyId(keyPair.publicKey),
      publicKey: keyPair.publicKey,
      privateKey: keyPair.privateKey,
      origin: origin,
    }
    this.#keyAgreementKeyPairs[key.keyId] = key
    await this.#save()
    return [key, btoa(JSON.stringify({
      publicKey: await serializeKey(keyPair.publicKey),
      origin,
    }))]
  }

  /**
   * Load previously generated key agreement key pair.
   */
  async loadKeyAgreementKeyPair(keyId: string, origin: string): Promise<KeyAgreementKeyPair | undefined> {
    const keyPair = this.#keyAgreementKeyPairs[keyId]
    if (keyPair === undefined || keyPair.origin != origin) {
      return undefined
    }
    return keyPair
  }

  /**
   * Load the public key received from another party for key agreement.
   */
  async loadOthersKeyAgreementPublicKey(publicKey: string): Promise<KeyAgreementKeyPair> {
    let key: CryptoKey
    let origin: string
    try {
      const keyData = JSON.parse(atob(publicKey))
      key = await deserializeKey(keyData.publicKey)
      origin = keyData.origin
    } catch {
      throw new BDPParameterError('Invalid public key.')
    }
    const keyId = await deriveKeyId(key)

    // Make sure this is not our own key.
    if (this.#keyAgreementKeyPairs[keyId] !== undefined) {
      throw new BDPParameterError(`The other's public key ${keyId} was generated by this browser rather than by another party.`)
    }

    return {
      keyId,
      publicKey: key,
      origin,
    }
  }

  async deriveSymmetricKeyFromKeyAgreement(ownKeyPair: KeyAgreementKeyPair, othersPublicKey: KeyAgreementKeyPair, origin: string): Promise<SymmetricKey> {
    if (origin !== ownKeyPair.origin || origin !== othersPublicKey.origin) {
      throw new BDPParameterError('The origin of the key agreement key pairs does not match the origin of the key derivation.')
    }
    if (ownKeyPair.privateKey === undefined) {
      throw new BDPParameterError('The own key agreement key pair does not contain a private key.')
    }

    const key = await window.crypto.subtle.deriveKey(
      {
        name: 'ECDH',
        public: othersPublicKey.publicKey,
      },
      ownKeyPair.privateKey,
      {
        name: 'AES-GCM',
        length: 256,
      },
      true,
      ['encrypt', 'decrypt'],
    )
    const keyObj: SymmetricKey = {
      keyId: await deriveKeyId(key),
      shortDescription: `Derived from public keys ${ownKeyPair.keyId} (own) and ${othersPublicKey.keyId} (other's). Be aware that the other party will only be able to decrypt values if they successfully received your public key during the key agreement.`,
      created: new Date(),
      lastUsed: null,
      allowedOrigins: [origin],
      previouslyUsedOnOrigins: [],
      key,
      distributionMode: 'key-agreement',
    }
    this.#symmetricKeys[keyObj.keyId] = keyObj

    // delete own key agreement key pair so it cannot be re-used
    delete this.#keyAgreementKeyPairs[ownKeyPair.keyId]

    await this.#save()
    return keyObj
  }

  /**
   * Load data from storage.
   */
  async load() {
    const storedData = await chrome.storage.local.get([
      'symmetricKeys',
      'passwordKeys',
      'recipientKeys',
      'keyAgreementKeyPairs',
      'perOriginKeyPairs',
    ])

    if (storedData.passwordKeys !== undefined) {
      Object.assign(this.#passwordKeys, await deserializeValues(storedData.passwordKeys))
    } else {
      Object.keys(this.#passwordKeys).forEach(key => delete this.#passwordKeys[key])
    }

    if (storedData.symmetricKeys !== undefined) {
      Object.assign(this.#symmetricKeys, await deserializeValues(storedData.symmetricKeys))
    } else {
      Object.keys(this.#symmetricKeys).forEach(key => delete this.#symmetricKeys[key])
    }

    if (storedData.recipientKeys !== undefined) {
      Object.assign(this.#recipientKeys, await deserializeValues(storedData.recipientKeys))
    } else {
      Object.keys(this.#recipientKeys).forEach(key => delete this.#recipientKeys[key])
    }

    if (storedData.keyAgreementKeyPairs !== undefined) {
      Object.assign(this.#keyAgreementKeyPairs, await deserializeValues(storedData.keyAgreementKeyPairs))
    } else {
      Object.keys(this.#keyAgreementKeyPairs).forEach(key => delete this.#keyAgreementKeyPairs[key])
    }

    if (storedData.perOriginKeyPairs !== undefined) {
      Object.assign(this.#perOriginKeyPairs, await deserializeValues(storedData.perOriginKeyPairs))
    } else {
      Object.keys(this.#perOriginKeyPairs).forEach(key => delete this.#perOriginKeyPairs[key])
    }
  }

  /**
   * Save data to storage.
   */
  async #save() {
    await chrome.storage.local.set({
      passwordKeys: await serializeValues(toRaw(this.#passwordKeys)),
      symmetricKeys: await serializeValues(toRaw(this.#symmetricKeys)),
      recipientKeys: await serializeValues(toRaw(this.#recipientKeys)),
      keyAgreementKeyPairs: await serializeValues(toRaw(this.#keyAgreementKeyPairs)),
      perOriginKeyPairs: await serializeValues(toRaw(this.#perOriginKeyPairs)),
    })
  }
}