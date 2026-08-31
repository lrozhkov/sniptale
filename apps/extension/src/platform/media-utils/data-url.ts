import { translate } from '../i18n';

interface ParsedDataUrl {
  mimeType: string;
  payload: string;
  isBase64: boolean;
}

const DATA_URL_PREFIX = 'data:';
const BASE64_MARKER = ';base64,';

function parseBase64DataUrl(dataUrl: string): ParsedDataUrl | null {
  // FileReader may emit codec-bearing MIME parameters like `codecs=vp9,opus`.
  const markerIndex = dataUrl.lastIndexOf(BASE64_MARKER);
  if (markerIndex <= DATA_URL_PREFIX.length) {
    return null;
  }

  const mimeType =
    dataUrl.slice(DATA_URL_PREFIX.length, markerIndex) || 'text/plain;charset=US-ASCII';
  const payload = dataUrl.slice(markerIndex + BASE64_MARKER.length);
  if (payload.length === 0) {
    throw new Error(translate('shared.runtime.readBlobFailed'));
  }

  return {
    mimeType,
    payload,
    isBase64: true,
  };
}

function parseDataUrl(dataUrl: string): ParsedDataUrl {
  if (!dataUrl.startsWith(DATA_URL_PREFIX)) {
    throw new Error(translate('shared.runtime.readBlobFailed'));
  }

  const parsedBase64 = parseBase64DataUrl(dataUrl);
  if (parsedBase64) {
    return parsedBase64;
  }

  const commaIndex = dataUrl.indexOf(',');
  if (commaIndex <= DATA_URL_PREFIX.length) {
    throw new Error(translate('shared.runtime.readBlobFailed'));
  }

  const metadata = dataUrl.slice(DATA_URL_PREFIX.length, commaIndex);
  const payload = dataUrl.slice(commaIndex + 1);
  const parts = metadata.split(';').map((part) => part.trim());
  const mimeType = parts[0] || 'text/plain;charset=US-ASCII';

  if (payload.length === 0) {
    throw new Error(translate('shared.runtime.readBlobFailed'));
  }

  return {
    mimeType,
    payload,
    isBase64: parts.some((part) => part.toLowerCase() === 'base64'),
  };
}

const BASE64_DECODE_CHUNK_CHARACTERS = 1024 * 1024;

function decodeBase64Chunk(payload: string): Uint8Array<ArrayBuffer> {
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function throwIfDataUrlDecodeAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  throw signal.reason instanceof Error
    ? signal.reason
    : new Error(translate('shared.runtime.readBlobFailed'));
}

async function decodeBase64Payload(
  payload: string,
  signal?: AbortSignal
): Promise<Uint8Array<ArrayBuffer>[]> {
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  try {
    for (let offset = 0; offset < payload.length; offset += BASE64_DECODE_CHUNK_CHARACTERS) {
      throwIfDataUrlDecodeAborted(signal);
      chunks.push(
        decodeBase64Chunk(payload.slice(offset, offset + BASE64_DECODE_CHUNK_CHARACTERS))
      );
      if (offset + BASE64_DECODE_CHUNK_CHARACTERS < payload.length) {
        await new Promise<void>((resolve) => globalThis.setTimeout(resolve, 0));
        throwIfDataUrlDecodeAborted(signal);
      }
    }
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error(translate('shared.runtime.readBlobFailed'), { cause: error });
  }
  return chunks;
}

function decodePlainPayload(payload: string): Uint8Array<ArrayBuffer> {
  try {
    return new TextEncoder().encode(decodeURIComponent(payload));
  } catch {
    throw new Error(translate('shared.runtime.readBlobFailed'));
  }
}

export async function dataUrlToBlob(dataUrl: string, signal?: AbortSignal): Promise<Blob> {
  throwIfDataUrlDecodeAborted(signal);
  const parsed = parseDataUrl(dataUrl);
  const parts = parsed.isBase64
    ? await decodeBase64Payload(parsed.payload, signal)
    : [decodePlainPayload(parsed.payload)];
  throwIfDataUrlDecodeAborted(signal);
  return new Blob(parts, { type: parsed.mimeType });
}

function normalizeMimeTypeForDataUrl(mimeType: string): string {
  if (!mimeType) {
    return 'application/octet-stream';
  }

  if (!mimeType.includes(',')) {
    return mimeType;
  }

  return mimeType.split(';', 1)[0] || 'application/octet-stream';
}

export async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = String(reader.result ?? '');
      const markerIndex = result.lastIndexOf(BASE64_MARKER);
      if (markerIndex === -1 || !blob.type.includes(',')) {
        resolve(result);
        return;
      }

      const payload = result.slice(markerIndex + BASE64_MARKER.length);
      resolve(`data:${normalizeMimeTypeForDataUrl(blob.type)}${BASE64_MARKER}${payload}`);
    };
    reader.onerror = () =>
      reject(reader.error ?? new Error(translate('shared.runtime.readBlobFailed')));
    reader.readAsDataURL(blob);
  });
}
