import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { getContentRuntimeServices } from '../../platform/runtime-services/services';
import {
  isSafeWebSnapshotUrl,
  isAllowedWebSnapshotAssetMimeType,
  resolveWebSnapshotCaptureAssetMimeType,
  sanitizeWebSnapshotFilename,
  sanitizeWebSnapshotSvgText,
} from '../../../features/web-snapshot/public';
import { MAX_WEB_SNAPSHOT_ASSET_BYTES } from './limits';
import type { WebSnapshotAssetEntry } from './types';

const EXTENSION_BY_TYPE: Record<string, string> = {
  'font/woff': 'woff',
  'font/woff2': 'woff2',
  'image/avif': 'avif',
  'image/gif': 'gif',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/svg+xml': 'svg',
  'image/webp': 'webp',
  'text/css': 'css',
};

function readBlobText(blob: Blob): Promise<string> {
  if (typeof blob.text === 'function') return blob.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read web snapshot asset.'));
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.readAsText(blob);
  });
}

function getExtension(blob: Blob, url: string): string {
  const byType = EXTENSION_BY_TYPE[blob.type];
  if (byType) {
    return byType;
  }

  const pathname = new URL(url).pathname;
  const match = /\.([a-z0-9]{1,8})$/i.exec(pathname);
  return match?.[1]?.toLowerCase() ?? 'bin';
}

function applyCanonicalExtension(filename: string, extension: string): string {
  const stem = filename.replace(/\.[a-z0-9]{1,8}$/iu, '');
  return `${stem || filename}.${extension}`;
}

async function sanitizeAssetBlob(blob: Blob): Promise<Blob> {
  if (blob.type === 'image/svg+xml') {
    return new Blob([sanitizeWebSnapshotSvgText(await readBlobText(blob))], {
      type: 'image/svg+xml',
    });
  }
  return blob;
}

function assertAllowedAssetBlobType(blob: Blob): void {
  if (!isAllowedWebSnapshotAssetMimeType(blob.type)) {
    throw new Error('unsupported web snapshot asset MIME type');
  }
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new Blob([bytes], { type: mimeType });
}

function readContentLength(response: Response): number | null {
  const rawValue = response.headers.get('content-length');
  if (!rawValue) {
    return null;
  }

  const value = Number(rawValue);
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function resolveAllowedAssetMimeType(response: Response): string {
  return resolveWebSnapshotCaptureAssetMimeType(response.headers.get('content-type'));
}

async function readStreamingResponseWithLimit(
  body: ReadableStream<Uint8Array>
): Promise<BlobPart[]> {
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
      if (nextTotalBytes > MAX_WEB_SNAPSHOT_ASSET_BYTES) {
        await reader.cancel();
        throw new Error('web snapshot asset is too large');
      }

      const chunk = new Uint8Array(new ArrayBuffer(value.byteLength));
      chunk.set(value);
      totalBytes = nextTotalBytes;
      chunks.push(chunk);
    }
  } finally {
    reader.releaseLock();
  }

  return chunks;
}

async function readBlobFallbackWithLimit(
  response: Response,
  contentLength: number | null
): Promise<Blob> {
  if (contentLength === null) {
    throw new Error('streaming web snapshot asset response is required');
  }

  const blob = await response.blob();
  if (blob.size > MAX_WEB_SNAPSHOT_ASSET_BYTES) {
    throw new Error('web snapshot asset is too large');
  }

  return blob;
}

export async function readSameOriginAssetBlob(response: Response): Promise<Blob> {
  const mimeType = resolveAllowedAssetMimeType(response);
  const contentLength = readContentLength(response);
  if (contentLength !== null && contentLength > MAX_WEB_SNAPSHOT_ASSET_BYTES) {
    throw new Error('web snapshot asset is too large');
  }

  const chunks = response.body
    ? await readStreamingResponseWithLimit(response.body)
    : [await readBlobFallbackWithLimit(response, contentLength)];

  return new Blob(chunks, { type: mimeType });
}

async function fetchAssetBlob(args: {
  allowAnonymousCrossOriginAssets: boolean;
  fetchSameOriginAssetBlob: (resolved: URL) => Promise<Blob>;
  pageOrigin: string;
  resolved: URL;
  snapshotSessionId: string;
}): Promise<Blob> {
  if (args.resolved.protocol === 'data:') {
    return readSameOriginAssetBlob(await fetch(args.resolved.href));
  }
  if (args.resolved.origin === args.pageOrigin) {
    return args.fetchSameOriginAssetBlob(args.resolved);
  }
  if (!args.allowAnonymousCrossOriginAssets) {
    throw new Error('anonymous cross-origin asset fetch is disabled');
  }

  const response = await getContentRuntimeServices().messaging.sendRuntimeMessage({
    type: MessageType.FETCH_WEB_SNAPSHOT_ASSET,
    snapshotSessionId: args.snapshotSessionId,
    url: args.resolved.href,
  });
  if (!response.success || !response.base64) {
    throw new Error(response.error || 'anonymous asset fetch failed');
  }

  return base64ToBlob(response.base64, response.mimeType || 'application/octet-stream');
}

export async function fetchAssetUrl(args: {
  allowAnonymousCrossOriginAssets: boolean;
  baseUrl: string;
  fetchSameOriginAssetBlob: (resolved: URL) => Promise<Blob>;
  index: number;
  pageOrigin: string;
  snapshotSessionId: string;
  url: string;
}): Promise<WebSnapshotAssetEntry> {
  if (!isSafeWebSnapshotUrl(args.url, args.baseUrl)) {
    throw new Error('unsafe URL');
  }

  const resolved = new URL(args.url, args.baseUrl);
  const resolvedUrl = resolved.href;
  const fetchedBlob = await fetchAssetBlob({
    allowAnonymousCrossOriginAssets: args.allowAnonymousCrossOriginAssets,
    fetchSameOriginAssetBlob: args.fetchSameOriginAssetBlob,
    pageOrigin: args.pageOrigin,
    resolved,
    snapshotSessionId: args.snapshotSessionId,
  });
  assertAllowedAssetBlobType(fetchedBlob);
  const blob = await sanitizeAssetBlob(fetchedBlob);
  const basename = sanitizeWebSnapshotFilename(
    new URL(resolvedUrl).pathname.split('/').pop() ?? '',
    `asset-${args.index}`
  );
  const filename = applyCanonicalExtension(basename, getExtension(blob, resolvedUrl));
  return {
    blob,
    localPath: `assets/${args.index}-${filename}`,
    originalUrl: resolvedUrl,
  };
}
