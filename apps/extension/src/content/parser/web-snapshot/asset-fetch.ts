import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { getContentRuntimeServices } from '../../platform/runtime-services/services';
import {
  isSafeWebSnapshotCaptureAssetUrl,
  isAllowedWebSnapshotAssetMimeType,
  resolveWebSnapshotCaptureAssetMimeTypeFromBytes,
  sanitizeWebSnapshotFilename,
  sanitizeWebSnapshotSvgText,
} from '../../../features/web-snapshot/public';
import { MAX_WEB_SNAPSHOT_ASSET_BYTES } from './limits';
import type { WebSnapshotAssetEntry } from './types';
import { resolveWebSnapshotAssetRequestUrl } from './asset-url';

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

function readBlobBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === 'function') {
    return blob.arrayBuffer().then((buffer) => new Uint8Array(buffer));
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read web snapshot asset.'));
    reader.onload = () => {
      if (!(reader.result instanceof ArrayBuffer)) {
        reject(new Error('Failed to read web snapshot asset.'));
        return;
      }
      resolve(new Uint8Array(reader.result));
    };
    reader.readAsArrayBuffer(blob);
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

export async function readSameOriginAssetBlob(
  response: Response,
  sourceUrl?: string
): Promise<Blob> {
  const contentLength = readContentLength(response);
  if (contentLength !== null && contentLength > MAX_WEB_SNAPSHOT_ASSET_BYTES) {
    throw new Error('web snapshot asset is too large');
  }

  const chunks: BlobPart[] = response.body
    ? await readStreamingResponseWithLimit(response.body)
    : [await readBlobFallbackWithLimit(response, contentLength)];

  const bytes = await readBlobBytes(new Blob(chunks));
  const mimeType = resolveWebSnapshotCaptureAssetMimeTypeFromBytes({
    bytes,
    contentType: response.headers.get('content-type'),
    url: sourceUrl ?? response.url,
  });
  const ownedBytes = new Uint8Array(new ArrayBuffer(bytes.byteLength));
  ownedBytes.set(bytes);

  return new Blob([ownedBytes], { type: mimeType });
}

async function fetchAssetBlob(args: {
  allowAnonymousCrossOriginAssets: boolean;
  anonymousCrossOriginAssets: ReadonlyMap<string, Blob | Error>;
  fetchSameOriginAssetBlob: (resolved: URL) => Promise<Blob>;
  pageOrigin: string;
  resolved: URL;
  snapshotSessionId: string;
}): Promise<Blob> {
  const prefetched = args.anonymousCrossOriginAssets.get(args.resolved.href);
  if (prefetched) {
    if (prefetched instanceof Error) throw prefetched;
    return prefetched;
  }
  if (args.resolved.protocol === 'data:') {
    return readSameOriginAssetBlob(await fetch(args.resolved.href), args.resolved.href);
  }
  if (args.resolved.origin === args.pageOrigin) {
    return args.fetchSameOriginAssetBlob(args.resolved);
  }
  if (!args.allowAnonymousCrossOriginAssets) {
    throw new Error('anonymous cross-origin asset fetch is disabled');
  }
  throw new Error('anonymous asset fetch result is unavailable');
}

export async function fetchAnonymousCrossOriginAssetBlobs(
  urls: string[],
  snapshotSessionId: string
): Promise<Map<string, Blob | Error>> {
  if (urls.length === 0) return new Map();
  const response = await getContentRuntimeServices().messaging.sendRuntimeMessage({
    type: MessageType.FETCH_WEB_SNAPSHOT_ASSET,
    snapshotSessionId,
    urls,
  });
  if (!response.success || !response.assets) {
    throw new Error(response.error || 'anonymous asset fetch failed');
  }
  return new Map(
    response.assets.map((asset) => [
      asset.url,
      asset.success && asset.base64
        ? base64ToBlob(asset.base64, asset.mimeType || 'application/octet-stream')
        : new Error(asset.error || 'anonymous asset fetch failed'),
    ])
  );
}

export async function fetchAssetUrl(args: {
  allowAnonymousCrossOriginAssets: boolean;
  anonymousCrossOriginAssets: ReadonlyMap<string, Blob | Error>;
  baseUrl: string;
  fetchSameOriginAssetBlob: (resolved: URL) => Promise<Blob>;
  index: number;
  pageOrigin: string;
  snapshotSessionId: string;
  url: string;
}): Promise<WebSnapshotAssetEntry> {
  if (!isSafeWebSnapshotCaptureAssetUrl(args.url, args.baseUrl)) {
    throw new Error('unsafe URL');
  }

  const resolved = new URL(resolveWebSnapshotAssetRequestUrl(args.url, args.baseUrl));
  const resolvedUrl = resolved.href;
  const fetchedBlob = await fetchAssetBlob({
    allowAnonymousCrossOriginAssets: args.allowAnonymousCrossOriginAssets,
    anonymousCrossOriginAssets: args.anonymousCrossOriginAssets,
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
