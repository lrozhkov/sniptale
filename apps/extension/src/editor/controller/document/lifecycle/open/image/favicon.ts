import { blobToDataUrl } from '../../../../../../platform/media-utils/data-url';
import { isPrivateNetworkHost } from '@sniptale/platform/security/private-network-host';
import { isImageDataUrl } from '@sniptale/runtime-contracts/validation/data-url';

const MAX_BROWSER_FRAME_FAVICON_BYTES = 256 * 1024;
const FAVICON_FETCH_TIMEOUT_MS = 15_000;
const BROWSER_FRAME_FAVICON_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function normalizeMimeType(value: string | null | undefined): string {
  return value?.split(';', 1)[0]?.trim().toLowerCase() ?? '';
}

function isAllowedFaviconMimeType(value: string | null | undefined): boolean {
  return BROWSER_FRAME_FAVICON_MIME_TYPES.has(normalizeMimeType(value));
}

function estimateBase64DecodedBytes(payload: string): number {
  const padding = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0;
  return Math.floor((payload.length * 3) / 4) - padding;
}

function isBoundedFaviconDataUrl(value: string): boolean {
  if (!isImageDataUrl(value)) {
    return false;
  }

  const payload = value.slice(value.indexOf(',') + 1);
  return estimateBase64DecodedBytes(payload) <= MAX_BROWSER_FRAME_FAVICON_BYTES;
}

function parseAllowedRemoteFaviconUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || isPrivateNetworkHost(url.hostname)) {
      return null;
    }

    return url;
  } catch {
    return null;
  }
}

function readContentLength(response: Response): number | null {
  const value = response.headers.get('content-length');
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

async function readStreamingFaviconBlob(
  body: ReadableStream<Uint8Array>,
  mimeType: string
): Promise<Blob> {
  const reader = body.getReader();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      const nextTotalBytes = totalBytes + value.byteLength;
      if (nextTotalBytes > MAX_BROWSER_FRAME_FAVICON_BYTES) {
        await reader.cancel();
        throw new Error('browser frame favicon is too large');
      }

      const chunk = new Uint8Array(new ArrayBuffer(value.byteLength));
      chunk.set(value);
      totalBytes = nextTotalBytes;
      chunks.push(chunk);
    }
  } finally {
    reader.releaseLock();
  }

  return new Blob(chunks, { type: mimeType });
}

async function readFallbackFaviconBlob(response: Response, mimeType: string): Promise<Blob> {
  const contentLength = readContentLength(response);
  if (contentLength === null) {
    throw new Error('streaming browser frame favicon response is required');
  }
  if (contentLength > MAX_BROWSER_FRAME_FAVICON_BYTES) {
    throw new Error('browser frame favicon is too large');
  }

  const blob = await response.blob();
  if (blob.size > MAX_BROWSER_FRAME_FAVICON_BYTES) {
    throw new Error('browser frame favicon is too large');
  }

  return new Blob([blob], { type: mimeType });
}

async function readFaviconBlob(response: Response): Promise<Blob | null> {
  const contentLength = readContentLength(response);
  if (contentLength !== null && contentLength > MAX_BROWSER_FRAME_FAVICON_BYTES) {
    return null;
  }

  const mimeType = normalizeMimeType(response.headers.get('content-type'));
  if (!isAllowedFaviconMimeType(mimeType)) {
    return null;
  }

  return response.body
    ? readStreamingFaviconBlob(response.body, mimeType)
    : readFallbackFaviconBlob(response, mimeType);
}

export async function resolveBrowserFrameFaviconDataUrl(
  sourceFaviconUrl: string | null | undefined
): Promise<string | null> {
  if (!sourceFaviconUrl) {
    return null;
  }

  if (sourceFaviconUrl.startsWith('data:')) {
    return isBoundedFaviconDataUrl(sourceFaviconUrl) ? sourceFaviconUrl : null;
  }

  const sourceUrl = parseAllowedRemoteFaviconUrl(sourceFaviconUrl);
  if (!sourceUrl) {
    return null;
  }

  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), FAVICON_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(sourceUrl.href, {
      credentials: 'omit',
      redirect: 'manual',
      signal: controller.signal,
    });
    if (response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400)) {
      return null;
    }
    if (!parseAllowedRemoteFaviconUrl(response.url || sourceUrl.href)) {
      return null;
    }
    if (!response.ok) {
      return null;
    }

    const blob = await readFaviconBlob(response);
    if (!blob) {
      return null;
    }

    const dataUrl = await blobToDataUrl(blob);
    return isImageDataUrl(dataUrl) ? dataUrl : null;
  } catch {
    return null;
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}
