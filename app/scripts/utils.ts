/**
 * Convert a buffer to a hex string byte by byte.
 */
export function bufferToHex(buffer: ArrayBuffer): string {
  let digest = ''
  const view = new DataView(buffer)
  for (let i = 0; i < view.byteLength; i += 2) {
    let stringValue = view.getUint8(i).toString(16)
    digest += stringValue.length === 2 ? stringValue : '0' + stringValue
  }
  return digest
}


/**
 * Convert a buffer to a base64 string.
 */
export function bufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < buffer.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Convert a buffer to a base64 string.
 */
export function bufferFromBase64(value: string): ArrayBuffer {
  const binary = atob(value)
  let bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}

/**
 * The SHA-256 hash of a key is used as the key ID.
 * For asymmetric keys, the public key is used to derive the hash, which needs to be provided by the caller as the only parameter.
 */
export async function deriveKeyId(key: CryptoKey): Promise<string> {
  let rawKey: ArrayBuffer
  if (key.type === 'secret') {
    rawKey = await crypto.subtle.exportKey('raw', key)
  } else if (key.type === 'public') {
    rawKey = await crypto.subtle.exportKey('spki', key)
  } else {
    throw new Error(`unexpected key type ${key.type} for deriveKeyId`)
  }
  const hash = await crypto.subtle.digest('SHA-256', rawKey)
  return bufferToHex(hash)
}

export async function serializeKey(key: CryptoKey): Promise<object> {
  const algorithm = Object.assign(Object.create(null), key.algorithm)
  if (algorithm.publicExponent !== undefined) {
    algorithm.publicExponent = bufferToBase64(algorithm.publicExponent)
  }
  return {
    algorithm,
    keyData: await crypto.subtle.exportKey('jwk', key),
  }
}

export async function deserializeKey(value: { keyData: JsonWebKey, algorithm: AlgorithmIdentifier }): Promise<CryptoKey> {
  const algorithm = Object.assign(Object.create(null), value.algorithm)
  if (algorithm.publicExponent !== undefined) {
    algorithm.publicExponent = bufferFromBase64(algorithm.publicExponent)
  }
  return await crypto.subtle.importKey('jwk', value.keyData, algorithm, true, value.keyData.key_ops as ReadonlyArray<KeyUsage>)
}

export async function serializeValue(value: object): Promise<object> {
  const result = Object.create(null)
  Object.assign(result, value)

  // Date
  if (result.created !== undefined) {
    result.created = result.created.valueOf()
  }
  if (result.lastUsed !== undefined && result.lastUsed !== null) {
    result.lastUsed = result.lastUsed.valueOf()
  }

  // CryptoKey
  if ('key' in result) {
    result.key = await serializeKey(result.key)
  }
  if ('privateKey' in result) {
    result.privateKey = await serializeKey(result.privateKey)
  }
  if ('publicKey' in result) {
    result.publicKey = await serializeKey(result.publicKey)
  }

  return result
}

export async function deserializeValue(value: object): Promise<object> {
  const result = Object.create(null)
  Object.assign(result, value)

  // Date
  if (result.created !== undefined) {
    result.created = new Date(result.created)
  }
  if (result.lastUsed !== undefined && result.lastUsed !== null) {
    result.lastUsed = new Date(result.lastUsed)
  }

  // CryptoKey
  if ('key' in result) {
    result.key = await deserializeKey(result.key)
  }
  if ('privateKey' in result) {
    result.privateKey = await deserializeKey(result.privateKey)
  }
  if ('publicKey' in result) {
    result.publicKey = await deserializeKey(result.publicKey)
  }

  return result
}

export async function serializeValues(value: object): Promise<object> {
  const result = Object.create(null)
  Object.assign(result, value)
  const keys = Object.keys(value)
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i]
    result[key] = await serializeValue(value[key])
  }
  return result
}

export async function deserializeValues(value: object): Promise<object> {
  const result = Object.create(null)
  Object.assign(result, value)
  const keys = Object.keys(value)
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i]
    result[key] = await deserializeValue(value[key])
  }
  return result
}