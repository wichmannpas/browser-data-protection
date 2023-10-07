import { reactive } from 'vue'

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

  get userOnlyKeys() {
    return this.#userOnlyKeys
  }
  getUserOnlyKeyCount(): number {
    return Object.keys(this.#userOnlyKeys).length
  }

  get savedPassword() {
    return this.#savedPasswords
  }
  getSavedPasswordCount(): number {
    return Object.keys(this.#savedPasswords).length
  }

  get symmetricKeys() {
    return this.#symmetricKeys
  }
  getSymmetricKeyCount(): number {
    return Object.keys(this.#symmetricKeys).length
  }

  get recipientKeys() {
    return this.#recipientKeys
  }
  getRecipientKeyCount(): number {
    return Object.keys(this.#recipientKeys).length
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

    if (storedData.symmetricKeys !== undefined) {
      Object.assign(this.#symmetricKeys, storedData.symmetricKeys)
    } else {
      Object.keys(this.#symmetricKeys).forEach(key => delete this.#symmetricKeys[key])
    }

    // TODO: other types of keys
  }

  /**
   * Save data to storage.
   */
  async save() {
    await chrome.storage.local.set({
      symmetricKeys: this.#symmetricKeys
    })
  }

  async generateUserOnlyKey() {
    const key = await window.crypto.subtle.generateKey(
      {
        name: "AES-GCM",
        length: 256
      },
      true,
      ["encrypt", "decrypt"]
    );
    return key
  }
}