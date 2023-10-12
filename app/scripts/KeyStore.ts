import { reactive, toRaw } from 'vue'
import { bufferFromBase64, bufferToBase64, bufferToHex } from './utils'

export const keyTypes = [
  // [keyType, keyText, keyTextAdjective (used with the word "key" appended), keyDescription]
  ['user-only', 'User only', 'user-only', 'A key not shared with any other user. Can be transferred to your other devices/browsers.'],
  ['password', 'Password', 'password', 'A password that is used for the decryption of a specific value or set of values. Its encryption key can optionally be saved here so the password does not need to be entered every time. Every password is bound to a specific input field. The password itself is never stored, only the resulting key.'],
  ['symmetric', 'Symmetric', 'symmetric', 'A key that is shared with a specific set of other users.'],
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

export interface UserOnlyKey extends StoredKey {
  key: CryptoKey
}

export interface PasswordKey extends StoredKey {
  key: CryptoKey
}

export interface SymmetricKey extends StoredKey {
  key: CryptoKey
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

export default class KeyStore {
  static #keyStore: KeyStore | null = null

  #userOnlyKeys: { [key: string]: UserOnlyKey }
  #passwords: { [key: string]: PasswordKey }
  #symmetricKeys: { [key: string]: SymmetricKey }
  #recipientKeys: { [key: string]: RecipientKey }

  constructor() {
    this.#userOnlyKeys = reactive(Object.create(null))
    this.#passwords = reactive(Object.create(null))
    this.#symmetricKeys = reactive(Object.create(null))
    this.#recipientKeys = reactive(Object.create(null))
  }

  static getKeyStore(): KeyStore {
    return KeyStore.#keyStore ?? (KeyStore.#keyStore = new KeyStore())
  }

  /**
   * Get the user only keys sorted descending by their creation date.
   */
  getUserOnlyKeys() {
    return Object.values(this.#userOnlyKeys).sort((a, b) => a.created.valueOf() - b.created.valueOf())
  }
  getUserOnlyKeysForOrigin(origin: string) {
    return this.getUserOnlyKeys().filter(key => key.allowedOrigins.includes(origin) || key.allowedOrigins.includes('*'))
  }
  getUserOnlyKeyCount(): number {
    return Object.keys(this.#userOnlyKeys).length
  }
  async generateUserOnlyKey(shortDescription: string, allowedOrigins: string[]): Promise<UserOnlyKey> {
    const key = await crypto.subtle.generateKey(
      {
        name: 'AES-GCM',
        length: 256
      },
      true,
      ['encrypt', 'decrypt'],
    )
    const keyObj: UserOnlyKey = {
      keyId: await this.#deriveKeyId(key),
      shortDescription,
      created: new Date(),
      lastUsed: null,
      allowedOrigins,
      previouslyUsedOnOrigins: [],
      key,
    }
    this.#userOnlyKeys[keyObj.keyId] = keyObj
    await this.#save()
    return keyObj
  }
  async encryptWithUserOnlyKey(plaintext: string, key: UserOnlyKey, origin: string): Promise<string> {
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

    return JSON.stringify(data)
  }
  async decryptWithUserOnlyKey(ciphertext: string, origin: string): Promise<[UserOnlyKey, string]> {
    const data = JSON.parse(ciphertext)
    if (typeof data !== 'object' || data.keyId === undefined || data.iv === undefined || data.ciphertext === undefined) {
      throw new BDPParameterError('Invalid ciphertext.')
    }

    const key = this.#userOnlyKeys[data.keyId]
    if (key === undefined) {
      throw new KeyMissingError(`The key with ${data.keyId} was not found.`)
    }
    if (!key.allowedOrigins.includes(origin) && !key.allowedOrigins.includes('*')) {
      throw new DisallowedKeyError(`Key usage of key ${data.keyId} is not allowed for this origin.`)
    }

    try {
      const plaintextBuffer = await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: bufferFromBase64(data.iv),
        },
        key.key,
        bufferFromBase64(data.ciphertext),
      )
      const plaintext = new TextDecoder().decode(plaintextBuffer)

      return [key, plaintext]
    } catch (e) {
      throw new InvalidCiphertextError('Invalid ciphertext.')
    }
  }
  async deleteUserOnlyKey(keyId: string) {
    delete this.#userOnlyKeys[keyId]
    await this.#save()
  }

  getPasswordKey() {
    return Object.values(this.#passwords).sort((a, b) => a.created.valueOf() - b.created.valueOf())
  }
  getPasswordKeyCount(): number {
    return Object.keys(this.#passwords).length
  }

  getSymmetricKeys() {
    return Object.values(this.#symmetricKeys).sort((a, b) => a.created.valueOf() - b.created.valueOf())
  }
  getSymmetricKeyCount(): number {
    return Object.keys(this.#symmetricKeys).length
  }

  getRecipientKeys() {
    return Object.values(this.#recipientKeys).sort((a, b) => a.created.valueOf() - b.created.valueOf())
  }
  getRecipientKeyCount(): number {
    return Object.keys(this.#recipientKeys).length
  }

  /**
   * The SHA-256 hash of a key is used as the key ID.
   * For asymmetric keys, the public key is used to derive the hash, which needs to be provided by the caller as the only parameter.
   */
  async #deriveKeyId(key: CryptoKey): Promise<string> {
    const rawKey = await crypto.subtle.exportKey('raw', key)
    const hash = await crypto.subtle.digest('SHA-256', rawKey)
    return bufferToHex(hash)
  }


  /**
   * Load data from storage.
   */
  async load() {
    const storedData = await chrome.storage.local.get([
      'userOnlyKeys',
      'passwords',
      'symmetricKeys',
      'recipientKeys',
    ])

    if (storedData.userOnlyKeys !== undefined) {
      Object.assign(this.#userOnlyKeys, await this.#deserializeValues(storedData.userOnlyKeys))
    } else {
      Object.keys(this.#userOnlyKeys).forEach(key => delete this.#userOnlyKeys[key])
    }

    if (storedData.passwords !== undefined) {
      Object.assign(this.#passwords, await this.#deserializeValues(storedData.passwords))
    } else {
      Object.keys(this.#passwords).forEach(key => delete this.#passwords[key])
    }

    if (storedData.symmetricKeys !== undefined) {
      Object.assign(this.#symmetricKeys, await this.#deserializeValues(storedData.symmetricKeys))
    } else {
      Object.keys(this.#symmetricKeys).forEach(key => delete this.#symmetricKeys[key])
    }

    if (storedData.recipientKeys !== undefined) {
      Object.assign(this.#recipientKeys, await this.#deserializeValues(storedData.recipientKeys))
    } else {
      Object.keys(this.#recipientKeys).forEach(key => delete this.#recipientKeys[key])
    }
  }

  async #serializeKey(key: CryptoKey): Promise<object> {
    return {
      algorithm: key.algorithm,
      keyData: await crypto.subtle.exportKey('jwk', key)
    }
  }
  async #serializeValues(value: object): Promise<object> {
    const result = Object.create(null)
    Object.assign(result, value)
    const keys = Object.keys(value)
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]
      const newElem = Object.create(null)
      Object.assign(newElem, value[key])

      // Date
      if (newElem.created !== undefined) {
        newElem.created = newElem.created.valueOf()
      }
      if (newElem.lastUsed !== undefined && newElem.lastUsed !== null) {
        newElem.lastUsed = newElem.lastUsed.valueOf()
      }

      // CryptoKey
      if ('key' in newElem) {
        newElem.key = await this.#serializeKey(newElem.key)
      }
      if ('privateKey' in newElem) {
        newElem.privateKey = await this.#serializeKey(newElem.privateKey)
      }
      if ('publicKey' in newElem) {
        newElem.publicKey = await this.#serializeKey(newElem.publicKey)
      }

      result[key] = newElem
    }
    return result
  }

  async #deserializeKey(value: { keyData: JsonWebKey, algorithm: AlgorithmIdentifier }): Promise<CryptoKey> {
    return await crypto.subtle.importKey('jwk', value.keyData, value.algorithm, true, ['encrypt', 'decrypt'])
  }
  async #deserializeValues(value: object): Promise<object> {
    const result = Object.create(null)
    Object.assign(result, value)
    const keys = Object.keys(value)
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]
      const newElem = Object.create(null)
      Object.assign(newElem, value[key])

      // Date
      if (newElem.created !== undefined) {
        newElem.created = new Date(newElem.created)
      }
      if (newElem.lastUsed !== undefined && newElem.lastUsed !== null) {
        newElem.lastUsed = new Date(newElem.lastUsed)
      }

      // CryptoKey
      if ('key' in newElem) {
        newElem.key = await this.#deserializeKey(newElem.key)
      }
      if ('privateKey' in newElem) {
        newElem.privateKey = await this.#deserializeKey(newElem.privateKey)
      }
      if ('publicKey' in newElem) {
        newElem.publicKey = await this.#deserializeKey(newElem.publicKey)
      }

      result[key] = newElem
    }
    return result
  }

  /**
   * Save data to storage.
   */
  async #save() {
    await chrome.storage.local.set({
      userOnlyKeys: await this.#serializeValues(toRaw(this.#userOnlyKeys)),
      passwords: await this.#serializeValues(toRaw(this.#passwords)),
      symmetricKeys: await this.#serializeValues(toRaw(this.#symmetricKeys)),
      recipientKeys: await this.#serializeValues(toRaw(this.#recipientKeys)),
    })
  }
}