import { reactive, toRaw } from 'vue'
import { bufferFromBase64, bufferToBase64, bufferToHex } from './utils'

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

export interface RecipientKey extends StoredKey {
  privateKey: CryptoKey
  publicKey: CryptoKey
}
export function isRecipientKey(key: StoredKey): key is RecipientKey {
  return 'privateKey' in key
}

export default class KeyStore {
  #userOnlyKeys: object
  #savedPasswords: object
  #symmetricKeys: object
  #recipientKeys: object

  constructor() {
    this.#userOnlyKeys = reactive(Object.create(null))
    this.#savedPasswords = reactive(Object.create(null))
    this.#symmetricKeys = reactive(Object.create(null))
    this.#recipientKeys = reactive(Object.create(null))
  }

  /**
   * Get the user only keys sorted descending by their creation date.
   */
  getUserOnlyKeys() {
    return Object.values(this.#userOnlyKeys).sort((a, b) => a.created.valueOf() - b.created.valueOf())
  }
  getUserOnlyKeyCount(): number {
    return Object.keys(this.#userOnlyKeys).length
  }
  async generateUserOnlyKey(shortDescription: string, allowedOrigins: string[]): Promise<UserOnlyKey> {
    const key = await window.crypto.subtle.generateKey(
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
  async deleteUserOnlyKey(keyId: string) {
    delete this.#userOnlyKeys[keyId]
    await this.#save()
  }

  getSavedPassword() {
    return Object.values(this.#savedPasswords).sort((a, b) => a.created.valueOf() - b.created.valueOf())
  }
  getSavedPasswordCount(): number {
    return Object.keys(this.#savedPasswords).length
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
      'savedPasswords',
      'symmetricKeys',
      'recipientKeys',
    ])

    if (storedData.userOnlyKeys !== undefined) {
      Object.assign(this.#userOnlyKeys, await this.#deserializeValues(storedData.userOnlyKeys))
    } else {
      Object.keys(this.#userOnlyKeys).forEach(key => delete this.#userOnlyKeys[key])
    }

    if (storedData.savedPasswords !== undefined) {
      Object.assign(this.#savedPasswords, await this.#deserializeValues(storedData.savedPasswords))
    } else {
      Object.keys(this.#savedPasswords).forEach(key => delete this.#savedPasswords[key])
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

  async #deserializeKey(value: { keyData: JsonWebKey, algorithm: AlgorithmIdentifier}): Promise<CryptoKey> {
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
      savedPasswords: await this.#serializeValues(toRaw(this.#savedPasswords)),
      symmetricKeys: await this.#serializeValues(toRaw(this.#symmetricKeys)),
      recipientKeys: await this.#serializeValues(toRaw(this.#recipientKeys)),
    })
  }
}