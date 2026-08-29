// @vitest-environment jsdom

import JSZip from 'jszip';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  PAGE_PACKAGE_ARCHIVE_MIME_TYPE,
  PAGE_PACKAGE_ARCHIVE_PATHS,
} from '@sniptale/runtime-contracts/page-package';
import type { WebSnapshotRecord } from '../../composition/persistence/web-snapshots/contracts';
import {
  createPagePackageArchiveFixture,
  createPagePackageTestBlobFromBytes,
  readPagePackageTestBlobBytes,
  readPagePackageTestBlobText,
  type PagePackageFixtureEntry,
} from '../../features/web-snapshot/package.test-support';
import { createPagePackageManifestFixture } from '../../features/web-snapshot/manifest.test-support';
import { hashWebSnapshotAssetBytes } from '../../features/web-snapshot/asset-manifest';

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
import { createViewerAssetObjectUrls } from './asset-objects';

interface AssetFixture {
  content: string;
  mimeType: string;
  path: string;
}

async function stubWebSnapshotRecord(args: {
  assets: readonly AssetFixture[];
  html: string;
  mutateArchive?: ((zip: JSZip) => void) | undefined;
  mutateManifest?:
    | ((manifest: Awaited<ReturnType<typeof createPagePackageArchiveFixture>>['manifest']) => void)
    | undefined;
}): Promise<void> {
  const base = await createPagePackageArchiveFixture();
  const entries: PagePackageFixtureEntry[] = [
    ...base.entries.filter((entry) => entry.path !== PAGE_PACKAGE_ARCHIVE_PATHS.snapshotHtml),
    {
      blob: new Blob([args.html], { type: 'text/html' }),
      component: 'webCopy',
      path: PAGE_PACKAGE_ARCHIVE_PATHS.snapshotHtml,
    },
    ...args.assets.map((asset) => ({
      blob: new Blob([asset.content], { type: asset.mimeType }),
      component: 'webCopy' as const,
      path: asset.path,
    })),
  ];
  const fixture = await createPagePackageArchiveFixture({ entries });
  const manifest = structuredClone(fixture.manifest);
  args.mutateManifest?.(manifest);
  const zip = await JSZip.loadAsync(await readPagePackageTestBlobBytes(fixture.packageBlob));
  zip.file(PAGE_PACKAGE_ARCHIVE_PATHS.manifest, JSON.stringify(manifest));
  args.mutateArchive?.(zip);
  const raw = await zip.generateAsync({ type: 'uint8array' });
  const packageBlob = createPagePackageTestBlobFromBytes(raw, PAGE_PACKAGE_ARCHIVE_MIME_TYPE);
  mocks.getWebSnapshotRecord.mockResolvedValue({
    createdAt: 1,
    id: 'snapshot-1',
    manifest,
    packageFile: new File([packageBlob], 'snapshot.sniptale-page-package.zip', {
      type: packageBlob.type,
    }),
    size: packageBlob.size,
    updatedAt: 1,
  } satisfies WebSnapshotRecord);
}

function stubObjectUrlStatics(
  createObjectURL: (blob: Blob) => string = vi.fn(() => 'blob:snapshot-asset')
): void {
  class MockURL extends NativeURL {}
  Object.defineProperties(MockURL, {
    createObjectURL: { configurable: true, value: createObjectURL },
    revokeObjectURL: { configurable: true, value: vi.fn() },
  });
  vi.stubGlobal('URL', MockURL);
}

function readTestBlobText(blob: Blob): Promise<string> {
  return readPagePackageTestBlobText(blob);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getWebSnapshotScreenshotFile.mockResolvedValue(
    new File(['png'], 'snapshot.png', { type: 'image/png' })
  );
  mocks.validateRetainedWebSnapshotScreenshot.mockResolvedValue({ height: 720, width: 1280 });
  stubObjectUrlStatics();
});

afterEach(() => vi.unstubAllGlobals());

it('uses verified Page Package MIME metadata for preview and original downloads', async () => {
  const createdBlobs: Blob[] = [];
  stubObjectUrlStatics((blob) => {
    createdBlobs.push(blob);
    return blob.type === 'text/css' ? 'blob:style' : 'blob:image';
  });
  await stubWebSnapshotRecord({
    assets: [
      { content: 'body { color: red; }', mimeType: 'text/css', path: 'assets/style.css' },
      { content: 'png', mimeType: 'image/png', path: 'assets/image.png' },
    ],
    html: '<link rel="stylesheet" href="../assets/style.css"><img src="../assets/image.png">',
  });

  const loaded = await loadWebSnapshotPackage('snapshot-1');

  expect(loaded.html).toContain('href="blob:style"');
  expect(loaded.html).toContain('src="blob:image"');
  expect(loaded.assets).toEqual([
    expect.objectContaining({
      downloadUrl: 'blob:style',
      mimeType: 'text/css',
      path: 'assets/style.css',
    }),
    expect.objectContaining({
      downloadUrl: 'blob:image',
      mimeType: 'image/png',
      path: 'assets/image.png',
    }),
  ]);
  expect(createdBlobs.map((blob) => blob.type)).toEqual([
    'text/css',
    'image/png',
    'text/css',
    'text/html',
    'image/png',
    'application/x-sniptale-page-package+zip',
  ]);
});

it('materializes percent-encoded asset filenames without decoding away their manifest path', async () => {
  await stubWebSnapshotRecord({
    assets: [
      {
        content: 'jpeg',
        mimeType: 'image/jpeg',
        path: 'assets/portrait_%28cropped%29.jpg',
      },
    ],
    html: '<img src="../assets/portrait_%28cropped%29.jpg">',
  });
  const createdBlobs: Blob[] = [];
  stubObjectUrlStatics((blob) => {
    createdBlobs.push(blob);
    return `blob:snapshot-asset-${createdBlobs.length}`;
  });

  const loaded = await loadWebSnapshotPackage('snapshot-1');

  expect(loaded.html).toContain('src="blob:snapshot-asset-1"');
});

it('rejects content whose declared digest does not match', async () => {
  await stubWebSnapshotRecord({
    assets: [{ content: 'png', mimeType: 'image/png', path: 'assets/image.png' }],
    html: '<img src="../assets/image.png">',
    mutateManifest: (manifest) => {
      const asset = manifest.entries.find((entry) => entry.path === 'assets/image.png');
      if (asset) asset.sha256 = 'b'.repeat(64);
    },
  });

  await expect(loadWebSnapshotPackage('snapshot-1')).rejects.toThrow(
    'Page Package entry metadata does not match: assets/image.png.'
  );
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});

it('defensively rejects active Web-copy MIME types before creating object URLs', async () => {
  const bytes = new TextEncoder().encode('<script>payload</script>');
  const manifest = createPagePackageManifestFixture({
    entries: [
      ...createPagePackageManifestFixture().entries,
      {
        component: 'webCopy',
        mimeType: 'text/html',
        path: 'assets/payload.html',
        sha256: await hashWebSnapshotAssetBytes(bytes),
        size: bytes.byteLength,
      },
    ],
  });

  await expect(
    createViewerAssetObjectUrls([['assets/payload.html', bytes]], manifest)
  ).rejects.toThrow('Web snapshot package manifest asset metadata is invalid.');
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});

it('sanitizes SVG previews while retaining a verified original download', async () => {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><foreignObject /><path /></svg>';
  await stubWebSnapshotRecord({
    assets: [{ content: svg, mimeType: 'image/svg+xml', path: 'assets/unsafe.svg' }],
    html: '<img src="../assets/unsafe.svg">',
  });
  const createdBlobs: Blob[] = [];
  stubObjectUrlStatics((blob) => {
    createdBlobs.push(blob);
    return `blob:snapshot-asset-${createdBlobs.length}`;
  });

  const loaded = await loadWebSnapshotPackage('snapshot-1');

  expect(loaded.assets[0]).toEqual(
    expect.objectContaining({ downloadUrl: 'blob:snapshot-asset-1', url: 'blob:snapshot-asset-2' })
  );
  await expect(readTestBlobText(createdBlobs[0]!)).resolves.toContain('onload');
  await expect(readTestBlobText(createdBlobs[1]!)).resolves.not.toContain('onload');
  await expect(readTestBlobText(createdBlobs[1]!)).resolves.not.toContain('foreignObject');
});

it('rewrites nested CSS resources to verified object URLs', async () => {
  const css = '.hero { background-image: url("../assets/hero.png"); }';
  await stubWebSnapshotRecord({
    assets: [
      { content: css, mimeType: 'text/css', path: 'assets/styles.css' },
      { content: 'png', mimeType: 'image/png', path: 'assets/hero.png' },
    ],
    html: '<link rel="stylesheet" href="../assets/styles.css"><main class="hero">Page</main>',
  });
  const createdBlobs: Blob[] = [];
  stubObjectUrlStatics((blob) => {
    createdBlobs.push(blob);
    return `blob:snapshot-asset-${createdBlobs.length}`;
  });

  const loaded = await loadWebSnapshotPackage('snapshot-1');
  const capturedCss = await readTestBlobText(createdBlobs[2]!);

  expect(capturedCss).toContain('url("blob:snapshot-asset-2")');
  expect(loaded.html).toContain('href="blob:snapshot-asset-3"');
});

it('retains SVG fragments referenced from an external captured stylesheet', async () => {
  const css = '.approve { background-image: url("../assets/icons.svg#approve"); }';
  await stubWebSnapshotRecord({
    assets: [
      { content: css, mimeType: 'text/css', path: 'assets/styles.css' },
      {
        content: '<svg xmlns="http://www.w3.org/2000/svg"><symbol id="approve" /></svg>',
        mimeType: 'image/svg+xml',
        path: 'assets/icons.svg',
      },
    ],
    html: '<link rel="stylesheet" href="../assets/styles.css"><button class="approve">OK</button>',
  });
  const createdBlobs: Blob[] = [];
  stubObjectUrlStatics((blob) => {
    createdBlobs.push(blob);
    return `blob:snapshot-asset-${createdBlobs.length}`;
  });

  const loaded = await loadWebSnapshotPackage('snapshot-1');
  const capturedCss = await readTestBlobText(createdBlobs[3]!);

  expect(capturedCss).toContain('url("blob:snapshot-asset-3#approve")');
  expect(loaded.html).toContain('href="blob:snapshot-asset-4"');
});

it('creates imported CSS dependencies before their parent stylesheet', async () => {
  const rootCss = '@import url("../assets/theme.css") screen;';
  const themeCss = '.hero { background: url("../assets/hero.png"); }';
  await stubWebSnapshotRecord({
    assets: [
      { content: rootCss, mimeType: 'text/css', path: 'assets/root.css' },
      { content: themeCss, mimeType: 'text/css', path: 'assets/theme.css' },
      { content: 'png', mimeType: 'image/png', path: 'assets/hero.png' },
    ],
    html: '<link rel="stylesheet" href="../assets/root.css"><main class="hero">Page</main>',
  });
  const createdBlobs: Blob[] = [];
  stubObjectUrlStatics((blob) => {
    createdBlobs.push(blob);
    return `blob:snapshot-asset-${createdBlobs.length}`;
  });

  const loaded = await loadWebSnapshotPackage('snapshot-1');

  await expect(readTestBlobText(createdBlobs[3]!)).resolves.toContain(
    'url("blob:snapshot-asset-3")'
  );
  await expect(readTestBlobText(createdBlobs[4]!)).resolves.toContain(
    '@import url("blob:snapshot-asset-4") screen;'
  );
  expect(loaded.html).toContain('href="blob:snapshot-asset-5"');
});

it('revokes already-created object URLs when later creation fails', async () => {
  const createObjectURL = vi
    .fn()
    .mockReturnValueOnce('blob:first')
    .mockImplementationOnce(() => {
      throw new Error('Object URL failed');
    });
  stubObjectUrlStatics(createObjectURL);
  await stubWebSnapshotRecord({
    assets: [
      { content: 'png', mimeType: 'image/png', path: 'assets/first.png' },
      { content: 'png', mimeType: 'image/png', path: 'assets/second.png' },
    ],
    html: '<img src="../assets/first.png"><img src="../assets/second.png">',
  });

  await expect(loadWebSnapshotPackage('snapshot-1')).rejects.toThrow('Object URL failed');
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:first');
});
