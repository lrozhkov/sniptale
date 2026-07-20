const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const UNSAFE_DOWNLOAD_MIME_TYPES = new Set(['image/svg+xml', 'text/html']);
const MAX_DOWNLOAD_FILENAME_LENGTH = 240;
export const MAX_SAVE_BLOB_BASE64_DECODED_BYTES = 64 * 1024 * 1024;
export const MAX_RECORDING_BASE64_DECODED_BYTES = 512 * 1024 * 1024;
export const MAX_RECORDING_SIDECAR_TEXT_BYTES = 5 * 1024 * 1024;

export function decodeBase64Bytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function hasDownloadFilenameControlOrSeparator(value: string): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (character === '/' || character === '\\' || code <= 0x1f || code === 0x7f) {
      return true;
    }
  }
  return false;
}

export function estimateBase64DecodedBytes(base64: string): number {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

function hasCanonicalBase64Characters(value: string): boolean {
  const firstPaddingIndex = value.indexOf('=');
  const contentEnd = firstPaddingIndex === -1 ? value.length : firstPaddingIndex;

  for (let index = 0; index < contentEnd; index += 1) {
    if (!BASE64_ALPHABET.includes(value[index]!)) {
      return false;
    }
  }

  for (let index = contentEnd; index < value.length; index += 1) {
    if (value[index] !== '=') {
      return false;
    }
  }

  return value.length - contentEnd <= 2;
}

export function isCanonicalBase64(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length % 4 === 0 &&
    hasCanonicalBase64Characters(value)
  );
}

export function isBoundedBase64(value: unknown, maxDecodedBytes: number): value is string {
  return isCanonicalBase64(value) && estimateBase64DecodedBytes(value) <= maxDecodedBytes;
}

export function estimateUtf8Bytes(value: string): number {
  let bytes = 0;

  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x7f) {
      bytes += 1;
    } else if (code <= 0x7ff) {
      bytes += 2;
    } else if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length) {
      const nextCode = value.charCodeAt(index + 1);
      if (nextCode >= 0xdc00 && nextCode <= 0xdfff) {
        bytes += 4;
        index += 1;
      } else {
        bytes += 3;
      }
    } else {
      bytes += 3;
    }
  }

  return bytes;
}

export function isBoundedUtf8Text(value: unknown, maxBytes: number): value is string {
  return typeof value === 'string' && value.length > 0 && estimateUtf8Bytes(value) <= maxBytes;
}

export function isSafeDownloadMimeType(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  if (UNSAFE_DOWNLOAD_MIME_TYPES.has(normalized)) {
    return false;
  }

  const slashIndex = normalized.indexOf('/');
  return slashIndex > 0 && slashIndex < normalized.length - 1 && !normalized.includes(';');
}

export function isSafeDownloadFilename(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= MAX_DOWNLOAD_FILENAME_LENGTH &&
    value !== '.' &&
    value !== '..' &&
    !hasDownloadFilenameControlOrSeparator(value)
  );
}
