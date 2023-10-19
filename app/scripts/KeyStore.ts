import { reactive, toRaw } from 'vue'
import { bufferFromBase64, bufferToBase64, deriveKeyId, deserializeValues, serializeValues } from './utils'

export const keyTypes = [
  // [keyType, keyText, keyTextAdjective (used with the word "key" appended), keyDescription]
  ['symmetric', 'Symmetric', 'symmetric', 'A key that either is used only by a single user or that is additionaly shared with a specific set of other users, depending on the key type.'],
  ['password', 'Password', 'password', 'A password that is used for the decryption of a specific value or set of values. Its encryption key can optionally be saved here so the password does not need to be entered every time. Every password is bound to a specific input field. The password itself is never stored, only the resulting key.'],
  ['recipient', 'Recipient', 'recipient', 'A key that is shared/received with a specific user. Only the key owner (who knows the so-called private key) can decrypt values encrypted with this key. Other users can only encrypt values for this key.'],
]

// Keys are a regular object following a StoredKey interface, which makes them easily serializable and deserializable for storage.local.
export interface StoredKey {
  keyId: string
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

export interface RecipientKey extends StoredKey {
  privateKey: CryptoKey
  publicKey: CryptoKey
}
export function isRecipientKey(key: StoredKey): key is RecipientKey {
  return 'privateKey' in key
}

export class BDPParameterError extends Error { }
export class KeyMissingError extends BDPParameterError { }
export class DisallowedKeyError extends BDPParameterError { }
export class InvalidCiphertextError extends BDPParameterError { }

interface CiphertextData {
  keyId: string
  iv: string
  ciphertext: string
}
interface PasswordKeyCiphertextData extends CiphertextData {
  salt: string
}

export default class KeyStore {
  static #keyStore: KeyStore | null = null

  #symmetricKeys: { [key: string]: SymmetricKey }
  #passwordKeys: { [key: string]: PasswordKey }
  #recipientKeys: { [key: string]: RecipientKey }

  constructor() {
    this.#passwordKeys = reactive(Object.create(null))
    this.#symmetricKeys = reactive(Object.create(null))
    this.#recipientKeys = reactive(Object.create(null))
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
    this.#save()

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
  async generateSymmetricKey(shortDescription: string, allowedOrigins: string[], distributionMode: SymmetricKey['distributionMode']): Promise<SymmetricKey> {
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
    this.#symmetricKeys[keyObj.keyId] = keyObj
    await this.#save()
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
  getRecipientKeyCount(): number {
    return Object.keys(this.#recipientKeys).length
  }

  /**
   * Load data from storage.
   */
  async load() {
    const storedData = await chrome.storage.local.get([
      'symmetricKeys',
      'passwordKeys',
      'recipientKeys',
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
  }

  /**
   * Save data to storage.
   */
  async #save() {
    await chrome.storage.local.set({
      passwordKeys: await serializeValues(toRaw(this.#passwordKeys)),
      symmetricKeys: await serializeValues(toRaw(this.#symmetricKeys)),
      recipientKeys: await serializeValues(toRaw(this.#recipientKeys)),
    })
  }
}