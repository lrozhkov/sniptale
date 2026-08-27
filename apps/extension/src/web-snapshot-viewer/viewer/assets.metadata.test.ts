// @vitest-environment jsdom

import JSZip from 'jszip';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  WebSnapshotCaptureMode,
  type WebSnapshotManifest,
} from '@sniptale/runtime-contracts/web-snapshot';
import type { WebSnapshotRecord } from '../../composition/persistence/web-snapshots/contracts';
import { hashWebSnapshotAssetBytes } from '../../features/web-snapshot/asset-manifest';
import { WEB_SNAPSHOT_PACKAGE_PATHS } from '../../features/web-snapshot/manifest';

const NativeURL = URL;

const mocks = vi.hoisted(() => ({
  getWebSnapshotRecord: vi.fn(),
  getWebSnapshotScreenshotFile: vi.fn(),
  validateRetainedWebSnapshotScreenshot: vi.fn(),
}));

vi.mock('../../features/web-snapshot/screenshot-validation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../features/web-snapshot/screenshot-validation')>()),
  validateRetainedWebSnapshotScreenshot: mocks.validateRetainedWebSnapshotScreenshot,
}));

vi.mock('../../composition/persistence/web-snapshots', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../composition/persistence/web-snapshots')>()),
  getWebSnapshotRecord: mocks.getWebSnapshotRecord,
  getWebSnapshotScreenshotFile: mocks.getWebSnapshotScreenshotFile,
}));

import { loadWebSnapshotPackage } from './assets';

function createManifest(overrides: Partial<WebSnapshotManifest> = {}): WebSnapshotManifest {
  return {
    captureMode: WebSnapshotCaptureMode.ReadOnlyNoScripts,
    capturedAt: '2026-05-12T00:00:00.000Z',
    id: 'snapshot-1',
    paths: WEB_SNAPSHOT_PACKAGE_PATHS,
    schemaVersion: 1,
    source: {
      faviconUrl: null,
      title: 'Example Page',
      url: 'https://example.com/page',
    },
    stats: { assetCount: 1, failedAssetCount: 0, packageSize: 10 },
    warnings: [],
    ...overrides,
  };
}

async function createAssetMetadata(path: string, content: string, mimeType: string) {
  const bytes = new TextEncoder().encode(content);
  return {
    mimeType,
    path,
    sha256: await hashWebSnapshotAssetBytes(bytes),
    size: bytes.byteLength,
  };
}

async function createPackageBlob(args: {
  extras: Record<string, string>;
  html: string;
  manifest: WebSnapshotManifest;
}): Promise<Blob> {
  const zip = new JSZip();
  zip.file(WEB_SNAPSHOT_PACKAGE_PATHS.manifest, JSON.stringify(args.manifest));
  zip.file(WEB_SNAPSHOT_PACKAGE_PATHS.snapshotHtml, args.html);
  zip.file(WEB_SNAPSHOT_PACKAGE_PATHS.screenshot, 'png');
  for (const [path, content] of Object.entries(args.extras)) {
    zip.file(path, content);
  }
  return zip.generateAsync({ type: 'blob' });
}

async function stubWebSnapshotRecord(args: {
  extras: Record<string, string>;
  html?: string;
  manifest: WebSnapshotManifest;
}): Promise<void> {
  const packageBlob = await createPackageBlob({
    extras: args.extras,
    html: args.html ?? '<img src="../assets/image.png">',
    manifest: args.manifest,
  });
  mocks.getWebSnapshotRecord.mockResolvedValue({
    createdAt: 1,
    id: 'snapshot-1',
    manifest: args.manifest,
    packageFile: new File([packageBlob], 'snapshot.zip', {
      type: packageBlob.type,
    }),
    size: packageBlob.size,
    updatedAt: 1,
  } satisfies WebSnapshotRecord);
}

function stubObjectUrlStatics(
  createObjectURL: (blob: Blob) => string = vi.fn((_blob: Blob) => 'blob:snapshot-asset')
): void {
  class MockURL extends NativeURL {}
  Object.defineProperties(MockURL, {
    createObjectURL: { configurable: true, value: createObjectURL },
    revokeObjectURL: { configurable: true, value: vi.fn() },
  });
  vi.stubGlobal('URL', MockURL);
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
  vi.clearAllMocks();
  mocks.getWebSnapshotScreenshotFile.mockResolvedValue(
    new File(['png'], 'snapshot.png', { type: 'image/png' })
  );
  mocks.validateRetainedWebSnapshotScreenshot.mockResolvedValue({
    height: 720,
    width: 1280,
  });
  stubObjectUrlStatics();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it('uses verified manifest MIME metadata for viewer asset blobs', async () => {
  const createdBlobs: Blob[] = [];
  stubObjectUrlStatics(
    vi.fn((blob: Blob) => {
      createdBlobs.push(blob);
      return blob.type === 'text/css' ? 'blob:style' : 'blob:image';
    })
  );
  const manifest = createManifest({
    assets: [
      await createAssetMetadata('assets/style.bin', 'body { color: red; }', 'text/css'),
      await createAssetMetadata('assets/image.bin', 'png', 'image/png'),
    ],
    stats: { assetCount: 2, failedAssetCount: 0, packageSize: 10 },
  });

  await stubWebSnapshotRecord({
    extras: {
      'assets/image.bin': 'png',
      'assets/style.bin': 'body { color: red; }',
    },
    html: '<link rel="stylesheet" href="../assets/style.bin"><img src="../assets/image.bin">',
    manifest,
  });

  const loaded = await loadWebSnapshotPackage('snapshot-1');

  expect(loaded.html).toContain('href="blob:style"');
  expect(loaded.html).toContain('src="blob:image"');
  expect(loaded.assets).toEqual([
    {
      downloadUrl: 'blob:image',
      mimeType: 'image/png',
      path: 'assets/image.bin',
      size: 3,
      url: 'blob:image',
    },
    {
      downloadUrl: 'blob:style',
      mimeType: 'text/css',
      path: 'assets/style.bin',
      size: 20,
      url: 'blob:style',
    },
  ]);
  expect(createdBlobs.map((blob) => blob.type)).toEqual([
    'text/css',
    'image/png',
    'text/css',
    'image/png',
  ]);
});

it('rejects asset packages when manifest hashes do not match content', async () => {
  const manifest = createManifest({
    assets: [
      {
        ...(await createAssetMetadata('assets/image.png', 'png', 'image/png')),
        sha256: 'b'.repeat(64),
      },
    ],
  });
  await stubWebSnapshotRecord({
    extras: { 'assets/image.png': 'png' },
    manifest,
  });

  await expect(loadWebSnapshotPackage('snapshot-1')).rejects.toThrow(
    'Web snapshot package asset metadata does not match package content.'
  );
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});

it('keeps legacy assets previewable without exposing unverified original downloads', async () => {
  const manifest = createManifest({
    stats: { assetCount: 1, failedAssetCount: 0, packageSize: 10 },
  });
  await stubWebSnapshotRecord({
    extras: { 'assets/legacy.png': 'png' },
    html: '<img src="../assets/legacy.png">',
    manifest,
  });

  const loaded = await loadWebSnapshotPackage('snapshot-1');

  expect(loaded.assets).toEqual([
    expect.objectContaining({
      downloadUrl: null,
      path: 'assets/legacy.png',
      url: 'blob:snapshot-asset',
    }),
  ]);
  expect(URL.createObjectURL).toHaveBeenCalledTimes(2);
});

it('does not expose original downloads for manifest MIME types outside the capture profile', async () => {
  const manifest = createManifest({
    assets: [await createAssetMetadata('assets/unsupported.bmp', 'bmp', 'image/bmp')],
  });
  await stubWebSnapshotRecord({
    extras: { 'assets/unsupported.bmp': 'bmp' },
    html: '<img src="../assets/unsupported.bmp">',
    manifest,
  });

  const loaded = await loadWebSnapshotPackage('snapshot-1');

  expect(loaded.assets[0]).toEqual(
    expect.objectContaining({ downloadUrl: null, mimeType: 'image/bmp' })
  );
  expect(URL.createObjectURL).toHaveBeenCalledTimes(2);
});

it('sanitizes SVG assets again before creating viewer object URLs', async () => {
  const manifest = createManifest({
    assets: [
      await createAssetMetadata(
        'assets/unsafe.svg',
        '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><foreignObject /><path /></svg>',
        'image/svg+xml'
      ),
    ],
  });
  await stubWebSnapshotRecord({
    extras: {
      'assets/unsafe.svg':
        '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><foreignObject /><path /></svg>',
    },
    html: '<img src="../assets/unsafe.svg">',
    manifest,
  });
  const createdBlobs: Blob[] = [];
  stubObjectUrlStatics((blob) => {
    createdBlobs.push(blob);
    return `blob:snapshot-asset-${createdBlobs.length}`;
  });

  const loaded = await loadWebSnapshotPackage('snapshot-1');
  const originalSvgBlob = createdBlobs[0];
  const previewSvgBlob = createdBlobs[1];

  expect(loaded.html).toContain('src="blob:snapshot-asset-2"');
  expect(loaded.assets[0]).toEqual(
    expect.objectContaining({
      downloadUrl: 'blob:snapshot-asset-1',
      url: 'blob:snapshot-asset-2',
    })
  );
  await expect(readTestBlobText(originalSvgBlob ?? new Blob())).resolves.toContain('onload');
  await expect(readTestBlobText(previewSvgBlob ?? new Blob())).resolves.not.toContain('onload');
  await expect(readTestBlobText(previewSvgBlob ?? new Blob())).resolves.not.toContain(
    'foreignObject'
  );
});

it('rewrites resources nested in captured CSS assets before offline rendering', async () => {
  const css = '.hero { background-image: url("../assets/hero.png"); }';
  const manifest = createManifest({
    assets: [
      await createAssetMetadata('assets/styles.css', css, 'text/css'),
      await createAssetMetadata('assets/hero.png', 'png', 'image/png'),
    ],
  });
  await stubWebSnapshotRecord({
    extras: { 'assets/hero.png': 'png', 'assets/styles.css': css },
    html: '<link rel="stylesheet" href="../assets/styles.css"><main class="hero">Page</main>',
    manifest,
  });
  const createdBlobs: Blob[] = [];
  stubObjectUrlStatics((blob) => {
    createdBlobs.push(blob);
    return `blob:snapshot-asset-${createdBlobs.length}`;
  });

  const loaded = await loadWebSnapshotPackage('snapshot-1');
  const capturedCss = await readTestBlobText(createdBlobs[2] ?? new Blob());

  expect(capturedCss).toContain('url("blob:snapshot-asset-2")');
  expect(capturedCss).not.toContain('../assets/hero.png');
  expect(loaded.html).toContain('href="blob:snapshot-asset-3"');
});

it('creates imported CSS dependencies before their parent stylesheet', async () => {
  const rootCss = '@import url("../assets/theme.css") screen;';
  const themeCss = '.hero { background: url("../assets/hero.png"); }';
  const manifest = createManifest({
    assets: [
      await createAssetMetadata('assets/root.css', rootCss, 'text/css'),
      await createAssetMetadata('assets/theme.css', themeCss, 'text/css'),
      await createAssetMetadata('assets/hero.png', 'png', 'image/png'),
    ],
    stats: { assetCount: 3, failedAssetCount: 0, packageSize: 10 },
  });
  await stubWebSnapshotRecord({
    extras: {
      'assets/hero.png': 'png',
      'assets/root.css': rootCss,
      'assets/theme.css': themeCss,
    },
    html: '<link rel="stylesheet" href="../assets/root.css"><main class="hero">Page</main>',
    manifest,
  });
  const createdBlobs: Blob[] = [];
  stubObjectUrlStatics((blob) => {
    createdBlobs.push(blob);
    return `blob:snapshot-asset-${createdBlobs.length}`;
  });

  const loaded = await loadWebSnapshotPackage('snapshot-1');
  const importedCss = await readTestBlobText(createdBlobs[3] ?? new Blob());
  const rootCapturedCss = await readTestBlobText(createdBlobs[4] ?? new Blob());

  expect(importedCss).toContain('url("blob:snapshot-asset-3")');
  expect(rootCapturedCss).toContain('@import url("blob:snapshot-asset-4") screen;');
  expect(loaded.html).toContain('href="blob:snapshot-asset-5"');
});

it('revokes already created object URLs when later asset URL creation fails', async () => {
  const createObjectURL = vi
    .fn()
    .mockReturnValueOnce('blob:first')
    .mockImplementationOnce(() => {
      throw new Error('Object URL failed');
    });
  stubObjectUrlStatics(createObjectURL);
  await stubWebSnapshotRecord({
    extras: {
      'assets/first.png': 'png',
      'assets/second.png': 'png',
    },
    html: '<img src="../assets/first.png"><img src="../assets/second.png">',
    manifest: createManifest({
      stats: { assetCount: 2, failedAssetCount: 0, packageSize: 10 },
    }),
  });

  await expect(loadWebSnapshotPackage('snapshot-1')).rejects.toThrow('Object URL failed');

  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:first');
});
