import { isPrivateNetworkHost } from '@sniptale/platform/security/private-network-host';
import { resolveWebSnapshotCaptureAssetMimeTypeFromBytes } from '../../../../features/web-snapshot/public';
import { beginWebSnapshotAssetFetch } from './session';
import { createLogger } from '@sniptale/platform/observability/logger';

const logger = createLogger({ namespace: 'BackgroundWebSnapshotAssets' });

const FETCH_TIMEOUT_MS = 15_000;
const MAX_ASSET_BYTES = 10 * 1024 * 1024;
const MAX_BATCH_ASSET_BYTES = 30 * 1024 * 1024;
const MAX_BATCH_BASE64_CHARACTERS = Math.ceil(MAX_BATCH_ASSET_BYTES / 3) * 4;
const FETCH_BATCH_CONCURRENCY = 3;
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

export async function fetchWebSnapshotAssetForSession(args: {
  sessionId: string;
  tabId: number;
  url: string;
}): Promise<{
  base64: string;
  mimeType: string;
}> {
  const parsedUrl = validateFetchUrl(args.url);
  const fetchAuthority = beginWebSnapshotAssetFetch({
    sessionId: args.sessionId,
    tabId: args.tabId,
    url: parsedUrl.href,
  });

  const timeoutId = setTimeout(
    () => fetchAuthority.abort(new Error('Web snapshot asset fetch timed out')),
    Math.min(FETCH_TIMEOUT_MS, fetchAuthority.timeoutMs)
  );

  try {
    const response = await fetch(parsedUrl.href, {
      credentials: 'omit',
      redirect: 'manual',
      signal: fetchAuthority.signal,
    });
    if (response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400)) {
      throw new Error('web snapshot asset redirects are not allowed');
    }
    validateFetchUrl(response.url || parsedUrl.href);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const buffer = await readResponseWithLimit(response);
    const mimeType = resolveWebSnapshotCaptureAssetMimeTypeFromBytes({
      bytes: new Uint8Array(buffer),
      contentType: response.headers.get('content-type'),
      url: response.url || parsedUrl.href,
    });
    return {
      base64: arrayBufferToBase64(buffer),
      mimeType,
    };
  } finally {
    clearTimeout(timeoutId);
    fetchAuthority.release();
  }
}

type WebSnapshotAssetFetchResult = {
  base64?: string;
  error?: string;
  mimeType?: string;
  success: boolean;
  url: string;
};

export async function fetchWebSnapshotAssetsForSession(args: {
  sessionId: string;
  tabId: number;
  urls: string[];
}): Promise<WebSnapshotAssetFetchResult[]> {
  const startedAt = Date.now();
  logger.log('Web snapshot asset batch started', { assetCount: args.urls.length });
  const results = new Array<WebSnapshotAssetFetchResult | undefined>(args.urls.length);
  let nextIndex = 0;
  let retainedBase64Characters = 0;

  const worker = async () => {
    while (nextIndex < args.urls.length) {
      const index = nextIndex;
      nextIndex += 1;
      const url = args.urls[index];
      if (!url) continue;
      try {
        const asset = await fetchWebSnapshotAssetForSession({
          sessionId: args.sessionId,
          tabId: args.tabId,
          url,
        });
        if (retainedBase64Characters + asset.base64.length > MAX_BATCH_BASE64_CHARACTERS) {
          results[index] = {
            error: 'web snapshot asset batch budget exceeded',
            success: false,
            url,
          };
          continue;
        }
        retainedBase64Characters += asset.base64.length;
        results[index] = { ...asset, success: true, url };
      } catch (error) {
        results[index] = {
          error: error instanceof Error ? error.message : 'anonymous asset fetch failed',
          success: false,
          url,
        };
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(FETCH_BATCH_CONCURRENCY, args.urls.length) }, () => worker())
  );
  const settled = results.filter(
    (result): result is WebSnapshotAssetFetchResult => result !== undefined
  );
  logger.log('Web snapshot asset batch completed', {
    base64Characters: retainedBase64Characters,
    elapsedMs: Date.now() - startedAt,
    failedCount: settled.filter((result) => !result.success).length,
    succeededCount: settled.filter((result) => result.success).length,
  });
  return settled;
}
