// @vitest-environment jsdom

import JSZip from 'jszip';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { WEB_SNAPSHOT_PACKAGE_PATHS } from '../../../features/web-snapshot/manifest';
import { buildWebSnapshotPackage } from './package';
import type { WebSnapshotPageSource } from './types';

function blobToArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read package blob.'));
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.readAsArrayBuffer(blob);
  });
}

async function readPackageEntries(packageBlob: Blob) {
  const zip = await JSZip.loadAsync(await blobToArrayBuffer(packageBlob));

  return {
    domSnapshot: await readZipText(zip, WEB_SNAPSHOT_PACKAGE_PATHS.domSnapshot),
    manifest: JSON.parse(await readZipText(zip, WEB_SNAPSHOT_PACKAGE_PATHS.manifest)) as {
      assets?: Array<{ mimeType: string; path: string; sha256: string; size: number }>;
      source: {
        title: string | null;
        url: string | null;
      };
      stats: {
        failedAssetCount: number;
        networkWarningCount: number;
        sanitizerWarningCount: number;
        warningCount: number;
      };
      viewport?: { height: number; width: number };
      warnings: string[];
    },
    snapshotHtml: await readZipText(zip, WEB_SNAPSHOT_PACKAGE_PATHS.snapshotHtml),
    virtualDomSnapshot: await readZipText(zip, WEB_SNAPSHOT_PACKAGE_PATHS.virtualDomSnapshot),
  };
}

async function readZipText(zip: JSZip, path: string): Promise<string> {
  const file = zip.file(path);
  if (!file) {
    throw new Error(`Missing zip entry: ${path}`);
  }

  return file.async('string');
}

function createSource(): WebSnapshotPageSource {
  return {
    title: 'Prepared page',
    url: 'http://localhost:3000/prepared',
  };
}

beforeEach(() => {
  document.title = 'Prepared page';
  window.history.replaceState(null, '', '/prepared');
});

afterEach(() => {
  vi.restoreAllMocks();
});

it('writes snapshot HTML, DOM diagnostics, and manifest warnings from the same artifact', async () => {
  const preparedHtml = [
    '<!doctype html>',
    '<html><body>',
    '<main data-virtual-iframe="true">Iframe body</main>',
    '<div class="sniptale-frames-container">Static frame</div>',
    '</body></html>',
  ].join('');
  const screenshotBlob = new Blob(['png'], { type: 'image/png' });

  const result = await buildWebSnapshotPackage({
    assets: [],
    html: preparedHtml,
    screenshotBlob,
    source: createSource(),
    warnings: ['Iframe snapshot timed out before content was ready: #slow-frame'],
  });
  const entries = await readPackageEntries(result.packageBlob);

  expect(entries.snapshotHtml).toBe(preparedHtml);
  expect(entries.domSnapshot).toBe(preparedHtml);
  expect(entries.virtualDomSnapshot).toBe(preparedHtml);
  expect(entries.manifest.warnings).toEqual([
    'Iframe snapshot timed out before content was ready: #slow-frame',
  ]);
  expect(result.manifest.warnings).toEqual(entries.manifest.warnings);
});

it('writes structured warning counters without treating every warning as a failed asset', async () => {
  const screenshotBlob = new Blob(['png'], { type: 'image/png' });

  const result = await buildWebSnapshotPackage({
    assets: [],
    html: '<!doctype html><html><body>Snapshot</body></html>',
    screenshotBlob,
    source: createSource(),
    warningStats: {
      failedAssetCount: 1,
      networkWarningCount: 1,
      sanitizerWarningCount: 1,
      warningCount: 2,
    },
    warnings: ['Iframe skipped', 'Asset skipped'],
  });
  const entries = await readPackageEntries(result.packageBlob);

  expect(entries.manifest.stats).toMatchObject({
    failedAssetCount: 1,
    networkWarningCount: 1,
    sanitizerWarningCount: 1,
    warningCount: 2,
  });
  expect(result.manifest.stats).toMatchObject({
    failedAssetCount: entries.manifest.stats.failedAssetCount,
    networkWarningCount: entries.manifest.stats.networkWarningCount,
    sanitizerWarningCount: entries.manifest.stats.sanitizerWarningCount,
    warningCount: entries.manifest.stats.warningCount,
  });
});

it('writes asset MIME, size, and hash metadata into the package manifest', async () => {
  const screenshotBlob = new Blob(['png'], { type: 'image/png' });

  const result = await buildWebSnapshotPackage({
    assets: [
      {
        blob: new Blob(['body { color: red; }'], { type: 'text/css' }),
        localPath: 'assets/style.css',
        originalUrl: 'https://example.test/style.css',
      },
    ],
    html: '<!doctype html><html><body>Snapshot</body></html>',
    screenshotBlob,
    source: createSource(),
    warnings: [],
  });
  const entries = await readPackageEntries(result.packageBlob);

  expect(entries.manifest.assets).toEqual([
    {
      mimeType: 'text/css',
      path: 'assets/style.css',
      sha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
      size: 20,
    },
  ]);
  expect(result.manifest.assets).toEqual(entries.manifest.assets);
});

it('writes explicit source metadata without ambient window location', async () => {
  const originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const originalLocationDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'location');
  Reflect.deleteProperty(globalThis, 'window');
  Reflect.deleteProperty(globalThis, 'location');

  try {
    const result = await buildWebSnapshotPackage({
      assets: [],
      html: '<!doctype html><html><body>Snapshot</body></html>',
      screenshotBlob: new Blob(['png'], { type: 'image/png' }),
      source: {
        title: 'Detached snapshot',
        url: 'https://source.example/path?token=secret#hash',
      },
      warnings: [],
    });
    const entries = await readPackageEntries(result.packageBlob);

    expect(entries.manifest).toMatchObject({
      source: {
        title: 'Detached snapshot',
        url: 'https://source.example/path',
      },
    });
    expect(result.manifest.source).toEqual(entries.manifest.source);
  } finally {
    if (originalWindowDescriptor) {
      Object.defineProperty(globalThis, 'window', originalWindowDescriptor);
    }
    if (originalLocationDescriptor) {
      Object.defineProperty(globalThis, 'location', originalLocationDescriptor);
    }
  }
});

it('writes capture viewport metadata into the package manifest', async () => {
  const result = await buildWebSnapshotPackage({
    assets: [],
    html: '<!doctype html><html><body>Snapshot</body></html>',
    screenshotBlob: new Blob(['png'], { type: 'image/png' }),
    source: {
      ...createSource(),
      viewport: { height: 720, width: 1280 },
    },
    warnings: [],
  });
  const entries = await readPackageEntries(result.packageBlob);

  expect(entries.manifest).toMatchObject({
    viewport: { height: 720, width: 1280 },
  });
  expect(result.manifest.viewport).toEqual(entries.manifest.viewport);
});

it('rejects oversized package inputs before generating a zip archive', async () => {
  const generateAsyncSpy = vi.spyOn(JSZip.prototype, 'generateAsync');

  await expect(
    buildWebSnapshotPackage({
      assets: [],
      html: 'x'.repeat(8 * 1024 * 1024 + 1),
      screenshotBlob: new Blob(['png'], { type: 'image/png' }),
      source: createSource(),
      warnings: [],
    })
  ).rejects.toThrow('Web snapshot HTML is too large.');

  expect(generateAsyncSpy).not.toHaveBeenCalled();
});

it('generates the snapshot package once instead of rebuilding it for package-size metadata', async () => {
  const generateAsyncSpy = vi.spyOn(JSZip.prototype, 'generateAsync');

  const result = await buildWebSnapshotPackage({
    assets: [],
    html: '<!doctype html><html><body>Snapshot</body></html>',
    screenshotBlob: new Blob(['png'], { type: 'image/png' }),
    source: createSource(),
    warnings: [],
  });

  expect(generateAsyncSpy).toHaveBeenCalledTimes(1);
  expect(result.manifest.stats.packageSize).toBeGreaterThan(0);
});
