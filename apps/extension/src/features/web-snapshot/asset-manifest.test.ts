// @vitest-environment jsdom

import { afterEach, expect, it, vi } from 'vitest';
import {
  hashWebSnapshotAssetBlob,
  hashWebSnapshotAssetBytes,
  isWebSnapshotAssetMimeType,
  normalizeWebSnapshotAssetMimeType,
  resolveAllowedWebSnapshotAssetMimeType,
} from './asset-manifest';

afterEach(() => {
  vi.unstubAllGlobals();
});

it('normalizes and validates web snapshot asset MIME types', () => {
  expect(isWebSnapshotAssetMimeType('image/png')).toBe(true);
  expect(isWebSnapshotAssetMimeType('bad mime')).toBe(false);
  expect(normalizeWebSnapshotAssetMimeType(' TEXT/CSS; charset=utf-8 ')).toBe(
    'application/octet-stream'
  );
  expect(normalizeWebSnapshotAssetMimeType(' IMAGE/PNG ')).toBe('image/png');
});

it('resolves allowed HTTP content types without widening the owner allow-list', () => {
  const allowedMimeTypes = new Set(['image/png', 'text/css']);

  expect(
    resolveAllowedWebSnapshotAssetMimeType(' IMAGE/PNG; charset=binary ', allowedMimeTypes)
  ).toBe('image/png');
  expect(() => resolveAllowedWebSnapshotAssetMimeType('image/gif', allowedMimeTypes)).toThrow(
    'unsupported web snapshot asset MIME type'
  );
  expect(() => resolveAllowedWebSnapshotAssetMimeType(null, allowedMimeTypes)).toThrow(
    'unsupported web snapshot asset MIME type'
  );
});

it('hashes web snapshot asset bytes and blobs consistently', async () => {
  const bytes = new TextEncoder().encode('asset');

  await expect(hashWebSnapshotAssetBytes(bytes)).resolves.toMatch(/^[a-f0-9]{64}$/u);
  await expect(hashWebSnapshotAssetBlob(new Blob([bytes]))).resolves.toBe(
    await hashWebSnapshotAssetBytes(bytes)
  );
});

it('uses FileReader fallback when blob arrayBuffer is unavailable', async () => {
  const bytes = new TextEncoder().encode('asset');
  const blob = new Blob([bytes]);
  Object.defineProperty(blob, 'arrayBuffer', { value: undefined });

  await expect(hashWebSnapshotAssetBlob(blob)).resolves.toBe(
    await hashWebSnapshotAssetBytes(bytes)
  );
});

it('rejects FileReader fallback results that are not ArrayBuffer values', async () => {
  class InvalidResultFileReader {
    error = null;
    onerror: (() => void) | null = null;
    onload: (() => void) | null = null;
    result: string | null = 'not-buffer';

    readAsArrayBuffer(): void {
      this.onload?.();
    }
  }
  vi.stubGlobal('FileReader', InvalidResultFileReader);
  const blob = new Blob(['asset']);
  Object.defineProperty(blob, 'arrayBuffer', { value: undefined });

  await expect(hashWebSnapshotAssetBlob(blob)).rejects.toThrow(
    'Failed to read web snapshot asset.'
  );
});

it('rejects FileReader fallback read errors', async () => {
  class ErrorFileReader {
    error = new Error('read failed');
    onerror: (() => void) | null = null;
    onload: (() => void) | null = null;
    result: ArrayBuffer | null = null;

    readAsArrayBuffer(): void {
      this.onerror?.();
    }
  }
  vi.stubGlobal('FileReader', ErrorFileReader);
  const blob = new Blob(['asset']);
  Object.defineProperty(blob, 'arrayBuffer', { value: undefined });

  await expect(hashWebSnapshotAssetBlob(blob)).rejects.toThrow('read failed');
});
