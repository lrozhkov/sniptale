import { decodeBase64Bytes } from '@sniptale/runtime-contracts/validation/base64';

export { NativeSha256 } from './sha256';

export function decodeNativeBase64Chunk(base64: string): Uint8Array {
  return decodeBase64Bytes(base64);
}

export async function calculateSha256Hex(bytes: Blob | Uint8Array): Promise<string> {
  const buffer: ArrayBuffer =
    bytes instanceof Blob ? await bytes.arrayBuffer() : new Uint8Array(bytes).buffer;
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}
