import { SHA256_DIGEST_PATTERN } from '@sniptale/runtime-contracts/protocol/digest';

const SHA256_DIGEST_PREFIX = 'sha256:';

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function getSubtleCrypto(): SubtleCrypto {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error('Web Crypto SHA-256 digest is unavailable');
  }
  return subtle;
}

export async function createSha256Digest(value: string): Promise<string> {
  return createSha256BytesDigest(new TextEncoder().encode(value));
}

export async function createSha256BytesDigest(value: Uint8Array): Promise<string> {
  const digest = await getSubtleCrypto().digest('SHA-256', Uint8Array.from(value));
  return `${SHA256_DIGEST_PREFIX}${bytesToHex(new Uint8Array(digest))}`;
}

export function isSha256Digest(value: string): boolean {
  return SHA256_DIGEST_PATTERN.test(value);
}
