import { isPrivateNetworkHost } from '@sniptale/platform/security/private-network-host';
import { resolveAllowedWebSnapshotAssetMimeType } from '../../../../features/web-snapshot/public';
import { authorizeWebSnapshotAssetFetch } from './session';

const FETCH_TIMEOUT_MS = 15_000;
const MAX_ASSET_BYTES = 10 * 1024 * 1024;
const ALLOWED_ASSET_MIME_TYPES = new Set([
  'image/avif',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
  'text/css',
]);

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';

  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index] ?? 0);
  }

  return btoa(binary);
}

function validateFetchUrl(url: string): URL {
  const parsedUrl = new URL(url);
  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new Error('unsupported asset URL protocol');
  }

  if (isPrivateNetworkHost(parsedUrl.hostname)) {
    throw new Error('private network asset URLs are not allowed');
  }

  if (parsedUrl.protocol === 'http:') {
    throw new Error('insecure web snapshot asset URLs are not allowed');
  }

  return parsedUrl;
}

function readContentLength(response: Response): number | null {
  const rawValue = response.headers.get('content-length');
  if (!rawValue) {
    return null;
  }

  const value = Number(rawValue);
  return Number.isFinite(value) ? value : null;
}

async function readResponseWithLimit(response: Response): Promise<ArrayBuffer> {
  const contentLength = readContentLength(response);
  if (contentLength !== null && contentLength > MAX_ASSET_BYTES) {
    throw new Error('web snapshot asset is too large');
  }

  if (response.body) {
    return readStreamingResponseWithLimit(response.body);
  }

  if (contentLength === null) {
    throw new Error('streaming web snapshot asset response is required');
  }

  const blob = await response.blob();
  if (blob.size > MAX_ASSET_BYTES) {
    throw new Error('web snapshot asset is too large');
  }

  return blob.arrayBuffer();
}

async function readStreamingResponseWithLimit(
  body: ReadableStream<Uint8Array>
): Promise<ArrayBuffer> {
  const reader = body.getReader();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      const chunk = new Uint8Array(new ArrayBuffer(value.byteLength));
      chunk.set(value);
      totalBytes += chunk.byteLength;
      if (totalBytes > MAX_ASSET_BYTES) {
        await reader.cancel();
        throw new Error('web snapshot asset is too large');
      }

      chunks.push(chunk);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(new ArrayBuffer(totalBytes));
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return bytes.buffer;
}

function resolveAllowedMimeType(response: Response): string {
  return resolveAllowedWebSnapshotAssetMimeType(
    response.headers.get('content-type'),
    ALLOWED_ASSET_MIME_TYPES
  );
}

export async function fetchWebSnapshotAssetForSession(args: {
  sessionId: string;
  tabId: number;
  url: string;
}): Promise<{
  base64: string;
  mimeType: string;
}> {
  const parsedUrl = validateFetchUrl(args.url);
  authorizeWebSnapshotAssetFetch({
    sessionId: args.sessionId,
    tabId: args.tabId,
    url: parsedUrl.href,
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(parsedUrl.href, {
      credentials: 'omit',
      redirect: 'manual',
      signal: controller.signal,
    });
    if (response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400)) {
      throw new Error('web snapshot asset redirects are not allowed');
    }
    validateFetchUrl(response.url || parsedUrl.href);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const mimeType = resolveAllowedMimeType(response);
    return {
      base64: arrayBufferToBase64(await readResponseWithLimit(response)),
      mimeType,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
