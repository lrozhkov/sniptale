// @vitest-environment jsdom

import { afterEach, expect, it, vi } from 'vitest';
import {
  hashWebSnapshotAssetBlob,
  hashWebSnapshotAssetBytes,
  isWebSnapshotAssetMimeType,
  isAllowedWebSnapshotAssetMimeType,
  normalizeWebSnapshotAssetMimeType,
  resolveWebSnapshotCaptureAssetMimeType,
} from './asset-manifest';

afterEach(() => {
  vi.unstubAllGlobals();
});

it('recognizes only the bounded capture MIME profile for raw attachment downloads', () => {
  expect(isAllowedWebSnapshotAssetMimeType('image/svg+xml')).toBe(true);
  expect(isAllowedWebSnapshotAssetMimeType('text/css')).toBe(true);
  expect(isAllowedWebSnapshotAssetMimeType('image/bmp')).toBe(false);
  expect(isAllowedWebSnapshotAssetMimeType('application/javascript')).toBe(false);
});

it('normalizes and validates web snapshot asset MIME types', () => {
  expect(isWebSnapshotAssetMimeType('image/png')).toBe(true);
  expect(isWebSnapshotAssetMimeType('bad mime')).toBe(false);
  expect(normalizeWebSnapshotAssetMimeType(' TEXT/CSS; charset=utf-8 ')).toBe(
    'application/octet-stream'
  );
  expect(normalizeWebSnapshotAssetMimeType(' IMAGE/PNG ')).toBe('image/png');
});

it('resolves HTTP content types through the canonical capture MIME profile', () => {
  expect(resolveWebSnapshotCaptureAssetMimeType(' IMAGE/PNG; charset=binary ')).toBe('image/png');
  expect(resolveWebSnapshotCaptureAssetMimeType('image/gif')).toBe('image/gif');
  expect(() => resolveWebSnapshotCaptureAssetMimeType('image/bmp')).toThrow(
    'unsupported web snapshot asset MIME type'
  );
  expect(() => resolveWebSnapshotCaptureAssetMimeType(null)).toThrow(
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
