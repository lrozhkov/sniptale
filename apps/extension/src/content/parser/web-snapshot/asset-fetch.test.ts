// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { fetchAssetUrl, readSameOriginAssetBlob } from './asset-fetch';
import { MAX_WEB_SNAPSHOT_ASSET_BYTES } from './limits';

function createChunkStream(
  chunks: Uint8Array[],
  onCancel: () => void = () => undefined
): ReadableStream<Uint8Array> {
  let nextChunkIndex = 0;

  return new ReadableStream({
    pull(controller) {
      const chunk = chunks[nextChunkIndex];
      nextChunkIndex += 1;
      if (chunk) {
        controller.enqueue(chunk);
        return;
      }

      controller.close();
    },
    cancel: onCancel,
  });
}

function readTestBlobText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.readAsText(blob);
  });
}

beforeEach(() => {
  vi.stubGlobal('document', { baseURI: 'https://example.com/page' });
  vi.stubGlobal('location', { origin: 'https://example.com' });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('returns CSS bytes for the recursive stylesheet packaging owner', async () => {
  const asset = await fetchAssetUrl({
    allowAnonymousCrossOriginAssets: false,
    anonymousCrossOriginAssets: new Map(),
    baseUrl: 'https://example.com/page',
    fetchSameOriginAssetBlob: async () =>
      new Blob(['.hero { background: u\\72l("https://tracker.example/pixel.png"); }'], {
        type: 'text/css',
      }),
    index: 1,
    pageOrigin: 'https://example.com',
    snapshotSessionId: 'snapshot-session',
    url: '/styles.css',
  });

  expect(asset.localPath).toBe('assets/1-styles.css');
  expect(asset.blob.type).toBe('text/css');
  await expect(readTestBlobText(asset.blob)).resolves.toContain('u\\72l');
});

it('replaces a misleading URL extension with the admitted MIME extension', async () => {
  const asset = await fetchAssetUrl({
    allowAnonymousCrossOriginAssets: false,
    anonymousCrossOriginAssets: new Map(),
    baseUrl: 'https://example.com/page',
    fetchSameOriginAssetBlob: async () => new Blob(['png'], { type: 'image/png' }),
    index: 2,
    pageOrigin: 'https://example.com',
    snapshotSessionId: 'snapshot-session',
    url: '/preview.jpeg',
  });

  expect(asset.localPath).toBe('assets/2-preview.png');
});

it('adds the admitted MIME extension to extensionless asset names', async () => {
  const asset = await fetchAssetUrl({
    allowAnonymousCrossOriginAssets: false,
    anonymousCrossOriginAssets: new Map(),
    baseUrl: 'https://example.com/page',
    fetchSameOriginAssetBlob: async () => new Blob(['font'], { type: 'font/woff2' }),
    index: 3,
    pageOrigin: 'https://example.com',
    snapshotSessionId: 'snapshot-session',
    url: '/body-font',
  });

  expect(asset.localPath).toBe('assets/3-body-font.woff2');
});

it('sanitizes same-origin SVG assets before packaging', async () => {
  const asset = await fetchAssetUrl({
    allowAnonymousCrossOriginAssets: false,
    anonymousCrossOriginAssets: new Map(),
    baseUrl: 'https://example.com/page',
    fetchSameOriginAssetBlob: async () =>
      new Blob(['<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><path /></svg>'], {
        type: 'image/svg+xml',
      }),
    index: 1,
    pageOrigin: 'https://example.com',
    snapshotSessionId: 'snapshot-session',
    url: '/unsafe.svg',
  });

  expect(asset.blob.type).toBe('image/svg+xml');
  await expect(readTestBlobText(asset.blob)).resolves.not.toContain('onload');
});

it('streams same-origin asset responses into bounded blobs', async () => {
  const blob = await readSameOriginAssetBlob(
    new Response(createChunkStream([new TextEncoder().encode('png')]), {
      headers: { 'content-type': 'image/png' },
    })
  );

  expect(blob.type).toBe('image/png');
  await expect(readTestBlobText(blob)).resolves.toBe('png');
});

it('captures a binary-verified same-origin WOFF2 response served as generic bytes', async () => {
  const blob = await readSameOriginAssetBlob(
    new Response(createChunkStream([new TextEncoder().encode('wOF2font-data')]), {
      headers: { 'content-type': 'application/octet-stream' },
    }),
    'https://example.com/typeface.woff2'
  );

  expect(blob.type).toBe('font/woff2');
  await expect(readTestBlobText(blob)).resolves.toBe('wOF2font-data');
});

it('rejects generic same-origin bytes that only claim a font extension', async () => {
  await expect(
    readSameOriginAssetBlob(
      new Response(createChunkStream([new TextEncoder().encode('not-font-data')]), {
        headers: { 'content-type': 'application/octet-stream' },
      }),
      'https://example.com/typeface.woff2'
    )
  ).rejects.toThrow('unsupported web snapshot asset MIME type');
});

it('rejects oversized same-origin assets from content-length before reading the body', async () => {
  const response = new Response(null, {
    headers: {
      'content-length': String(MAX_WEB_SNAPSHOT_ASSET_BYTES + 1),
      'content-type': 'image/png',
    },
  });
  vi.spyOn(response, 'blob');

  await expect(readSameOriginAssetBlob(response)).rejects.toThrow(
    'web snapshot asset is too large'
  );
  expect(response.blob).not.toHaveBeenCalled();
});

it('cancels a single oversized same-origin asset chunk before copying it', async () => {
  const cancelSpy = vi.spyOn(ReadableStreamDefaultReader.prototype, 'cancel');
  const response = new Response(
    createChunkStream([new Uint8Array(MAX_WEB_SNAPSHOT_ASSET_BYTES + 1)]),
    { headers: { 'content-type': 'image/png' } }
  );

  await expect(readSameOriginAssetBlob(response)).rejects.toThrow(
    'web snapshot asset is too large'
  );
  expect(cancelSpy).toHaveBeenCalled();
});
