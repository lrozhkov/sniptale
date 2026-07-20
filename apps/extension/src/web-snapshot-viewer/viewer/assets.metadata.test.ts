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
}));

vi.mock('../../composition/persistence/web-snapshots', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../composition/persistence/web-snapshots')>()),
  getWebSnapshotRecord: mocks.getWebSnapshotRecord,
}));

import { loadWebSnapshotPackage } from './assets';

function createManifest(overrides: Partial<WebSnapshotManifest> = {}): WebSnapshotManifest {
  return {
    captureMode: WebSnapshotCaptureMode.ReadOnlyNoScripts,
    capturedAt: '2026-05-12T00:00:00.000Z',
    id: 'snapshot-1',
    paths: WEB_SNAPSHOT_PACKAGE_PATHS,
    schemaVersion: 1,
    source: { faviconUrl: null, title: 'Example Page', url: 'https://example.com/page' },
    stats: { assetCount: 1, failedAssetCount: 0, packageSize: 10 },
    warnings: [],
    ...overrides,
  };
}

async function createAssetMetadata(path: string, content: string, mimeType: string) {
  const bytes = new TextEncoder().encode(content);
  return { mimeType, path, sha256: await hashWebSnapshotAssetBytes(bytes), size: bytes.byteLength };
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
    packageBlob,
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

beforeEach(() => {
  vi.clearAllMocks();
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
    extras: { 'assets/image.bin': 'png', 'assets/style.bin': 'body { color: red; }' },
    html: '<link rel="stylesheet" href="../assets/style.bin"><img src="../assets/image.bin">',
    manifest,
  });

  const loaded = await loadWebSnapshotPackage('snapshot-1');

  expect(loaded.html).toContain('href="blob:style"');
  expect(loaded.html).toContain('src="blob:image"');
  expect(createdBlobs.map((blob) => blob.type)).toEqual(['image/png', 'text/css']);
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
  await stubWebSnapshotRecord({ extras: { 'assets/image.png': 'png' }, manifest });

  await expect(loadWebSnapshotPackage('snapshot-1')).rejects.toThrow(
    'Web snapshot package asset metadata does not match package content.'
  );
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});

it('rejects SVG assets before creating viewer object URLs', async () => {
  const manifest = createManifest({
    assets: [
      await createAssetMetadata(
        'assets/unsafe.svg',
        '<svg onload="alert(1)"><foreignObject /></svg>',
        'image/svg+xml'
      ),
    ],
  });
  await stubWebSnapshotRecord({
    extras: { 'assets/unsafe.svg': '<svg onload="alert(1)"><foreignObject /></svg>' },
    html: '<img src="../assets/unsafe.svg">',
    manifest,
  });

  await expect(loadWebSnapshotPackage('snapshot-1')).rejects.toThrow(
    'Web snapshot package SVG assets are not supported.'
  );
  expect(URL.createObjectURL).not.toHaveBeenCalled();
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
    manifest: createManifest({ stats: { assetCount: 2, failedAssetCount: 0, packageSize: 10 } }),
  });

  await expect(loadWebSnapshotPackage('snapshot-1')).rejects.toThrow('Object URL failed');

  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:first');
});
