// @vitest-environment jsdom

import JSZip from 'jszip';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  WebSnapshotCaptureMode,
  type WebSnapshotManifest,
} from '@sniptale/runtime-contracts/web-snapshot';
import type { WebSnapshotRecord } from '../../composition/persistence/web-snapshots/contracts';
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

function createManifest(): WebSnapshotManifest {
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
  };
}

async function createPackageBlob(
  html: string,
  extras: Record<string, string | Uint8Array> = {}
): Promise<Blob> {
  const zip = new JSZip();
  zip.file(WEB_SNAPSHOT_PACKAGE_PATHS.manifest, JSON.stringify(createManifest()));
  zip.file(WEB_SNAPSHOT_PACKAGE_PATHS.snapshotHtml, html);
  zip.file(WEB_SNAPSHOT_PACKAGE_PATHS.screenshot, 'png');
  zip.file('assets/image.png', 'png');
  for (const [path, value] of Object.entries(extras)) {
    zip.file(path, value);
  }
  return zip.generateAsync({ type: 'blob' });
}

type CreateObjectUrlMock = ReturnType<typeof vi.fn<(blob: Blob) => string>>;

function stubObjectUrlStatics(
  createObjectURL: CreateObjectUrlMock = vi.fn(() => 'blob:snapshot-image')
): void {
  class MockURL extends NativeURL {}
  Object.defineProperties(MockURL, {
    createObjectURL: { configurable: true, value: createObjectURL },
    revokeObjectURL: { configurable: true, value: vi.fn() },
  });
  vi.stubGlobal('URL', MockURL);
}

function readBlobText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read blob.'));
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.readAsText(blob);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  stubObjectUrlStatics();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it('re-sanitizes restored snapshot HTML before returning viewer srcdoc', async () => {
  const recordManifest = createManifest();
  const packageBlob = await createPackageBlob(
    [
      '<main>',
      '<script>window.evil = true</script>',
      '<meta http-equiv="refresh" content="0; url=https://tracker.example">',
      '<iframe srcdoc="<script>alert(1)</script>"></iframe>',
      '<img src="../assets/image.png" onerror="alert(1)">',
      '<a href="https://tracker.example/page">External</a>',
      '<style>.hero { background: u\\72l("https://tracker.example/pixel.png"); }</style>',
      '</main>',
    ].join('')
  );
  mocks.getWebSnapshotRecord.mockResolvedValue({
    createdAt: 1,
    id: 'snapshot-1',
    manifest: recordManifest,
    packageBlob,
    size: packageBlob.size,
    updatedAt: 1,
  } satisfies WebSnapshotRecord);

  const loaded = await loadWebSnapshotPackage('snapshot-1');

  expect(loaded.html).toContain('src="blob:snapshot-image"');
  expect(loaded.html).not.toContain('<script');
  expect(loaded.html).not.toContain('http-equiv="refresh"');
  expect(loaded.html).not.toContain('<iframe');
  expect(loaded.html).not.toContain('onerror');
  expect(loaded.html).toContain('href="https://tracker.example/page"');
  expect(loaded.html).not.toContain('https://tracker.example/pixel.png');
});

it('keeps safe navigation links while stripping unresolved offline resource links', async () => {
  const recordManifest = createManifest();
  const packageBlob = await createPackageBlob(
    [
      '<a href="https://example.com/details">Details</a>',
      '<link rel="stylesheet" href="https://tracker.example/style.css">',
      '<map><area href="https://tracker.example/map"></map>',
      '<svg><use href="https://tracker.example/icon.svg"></use></svg>',
      '<img src="https://tracker.example/pixel.png">',
    ].join('')
  );
  mocks.getWebSnapshotRecord.mockResolvedValue({
    createdAt: 1,
    id: 'snapshot-1',
    manifest: recordManifest,
    packageBlob,
    size: packageBlob.size,
    updatedAt: 1,
  } satisfies WebSnapshotRecord);

  const loaded = await loadWebSnapshotPackage('snapshot-1');

  expect(loaded.html).toContain('href="https://example.com/details"');
  expect(loaded.html).not.toContain('https://tracker.example/style.css');
  expect(loaded.html).not.toContain('https://tracker.example/map');
  expect(loaded.html).not.toContain('https://tracker.example/icon.svg');
  expect(loaded.html).not.toContain('https://tracker.example/pixel.png');
});

it('sanitizes restored CSS package assets before object URL creation', async () => {
  const createdBlobs: Blob[] = [];
  const createObjectURL = vi.fn((blob: Blob) => {
    createdBlobs.push(blob);
    return blob.type === 'text/css' ? 'blob:snapshot-css' : 'blob:snapshot-image';
  });
  stubObjectUrlStatics(createObjectURL);
  const recordManifest = createManifest();
  const packageBlob = await createPackageBlob(
    '<link rel="stylesheet" href="../assets/style.css"><main>Page</main>',
    {
      'assets/style.css': [
        '@im/* hidden */port "https://tracker.example/style.css";',
        '.hero { background: u\\72l("https://tracker.example/pixel.png"); color: red; }',
      ].join('\n'),
    }
  );
  mocks.getWebSnapshotRecord.mockResolvedValue({
    createdAt: 1,
    id: 'snapshot-1',
    manifest: recordManifest,
    packageBlob,
    size: packageBlob.size,
    updatedAt: 1,
  } satisfies WebSnapshotRecord);

  const loaded = await loadWebSnapshotPackage('snapshot-1');
  const cssBlob = createdBlobs.find((blob) => blob.type === 'text/css');

  expect(loaded.html).toContain('href="blob:snapshot-css"');
  expect(cssBlob).toBeDefined();
  await expect(readBlobText(cssBlob as Blob)).resolves.toBe('');
});

it('sanitizes restored CSS package assets with non-lowercase extensions', async () => {
  const createdBlobs: Blob[] = [];
  stubObjectUrlStatics(
    vi.fn((blob: Blob) => {
      createdBlobs.push(blob);
      return blob.type === 'text/css' ? 'blob:snapshot-css' : 'blob:snapshot-image';
    })
  );
  const recordManifest = createManifest();
  const packageBlob = await createPackageBlob(
    '<link rel="stylesheet" href="../assets/style.CSS"><main>Page</main>',
    {
      'assets/style.CSS': '.hero { background: u\\72l("https://tracker.example/pixel.png"); }',
    }
  );
  mocks.getWebSnapshotRecord.mockResolvedValue({
    createdAt: 1,
    id: 'snapshot-1',
    manifest: recordManifest,
    packageBlob,
    size: packageBlob.size,
    updatedAt: 1,
  } satisfies WebSnapshotRecord);

  const loaded = await loadWebSnapshotPackage('snapshot-1');
  const cssBlob = createdBlobs.find((blob) => blob.type === 'text/css');

  expect(loaded.html).toContain('href="blob:snapshot-css"');
  await expect(readBlobText(cssBlob as Blob)).resolves.toBe('');
});
