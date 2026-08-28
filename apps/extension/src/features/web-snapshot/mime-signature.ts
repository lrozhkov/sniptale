const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;

function hasSignature(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  return signature.every((byte, index) => bytes[offset + index] === byte);
}

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(start, start + length));
}

function isAvif(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 16 || ascii(bytes, 4, 4) !== 'ftyp') return false;
  const brands = ascii(bytes, 8, Math.min(bytes.byteLength - 8, 32));
  return brands.includes('avif') || brands.includes('avis');
}

const SIGNATURE_CHECKS: Readonly<Record<string, (bytes: Uint8Array) => boolean>> = {
  'font/woff': (bytes) => ascii(bytes, 0, 4) === 'wOFF',
  'font/woff2': (bytes) => ascii(bytes, 0, 4) === 'wOF2',
  'image/avif': isAvif,
  'image/gif': (bytes) => {
    const signature = ascii(bytes, 0, 6);
    return signature === 'GIF87a' || signature === 'GIF89a';
  },
  'image/jpeg': (bytes) => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
  'image/png': (bytes) => hasSignature(bytes, PNG_SIGNATURE),
  'image/webp': (bytes) => ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP',
};

/** Verifies binary containers whose declared Page Package MIME has a stable byte signature. */
export function assertWebSnapshotMimeSignature(
  bytes: Uint8Array,
  mimeType: string,
  path: string
): void {
  const matches = SIGNATURE_CHECKS[mimeType]?.(bytes) ?? true;
  if (!matches) throw new Error(`Page Package entry MIME signature does not match: ${path}.`);
}
