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