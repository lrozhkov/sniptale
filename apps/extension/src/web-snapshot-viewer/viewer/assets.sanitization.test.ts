// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  PAGE_PACKAGE_ARCHIVE_PATHS,
  PAGE_PACKAGE_ARCHIVE_MIME_TYPE,
} from '@sniptale/runtime-contracts/page-package';
import type { WebSnapshotRecord } from '../../composition/persistence/web-snapshots/contracts';
import {
  createPagePackageArchiveFixture,
  readPagePackageTestBlobText,
  type PagePackageFixtureEntry,
} from '../../features/web-snapshot/package.test-support';

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

async function stubRecord(
  html: string,
  extras: Array<{ content: string; mimeType: string; path: string }> = []
): Promise<void> {
  const base = await createPagePackageArchiveFixture();
  const entries: PagePackageFixtureEntry[] = [
    ...base.entries.filter((entry) => entry.path !== PAGE_PACKAGE_ARCHIVE_PATHS.snapshotHtml),
    {
      blob: new Blob([html], { type: 'text/html' }),
      component: 'webCopy',
      path: PAGE_PACKAGE_ARCHIVE_PATHS.snapshotHtml,
    },
    ...extras.map((asset) => ({
      blob: new Blob([asset.content], { type: asset.mimeType }),
      component: 'webCopy' as const,
      path: asset.path,
    })),
  ];
  const fixture = await createPagePackageArchiveFixture({ entries });
  mocks.getWebSnapshotRecord.mockResolvedValue({
    createdAt: 1,
    id: 'snapshot-1',
    manifest: fixture.manifest,
    packageFile: new File([fixture.packageBlob], 'snapshot.sniptale-page-package.zip', {
      type: PAGE_PACKAGE_ARCHIVE_MIME_TYPE,
    }),
    size: fixture.packageBlob.size,
    updatedAt: 1,
  } satisfies WebSnapshotRecord);
}

function stubObjectUrlStatics(
  createObjectURL: ReturnType<typeof vi.fn<(blob: Blob) => string>> = vi.fn(
    () => 'blob:snapshot-image'
  )
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
  mocks.getWebSnapshotScreenshotFile.mockResolvedValue(
    new File(['png'], 'snapshot.png', { type: 'image/png' })
  );
  mocks.validateRetainedWebSnapshotScreenshot.mockResolvedValue({ height: 720, width: 1280 });
  stubObjectUrlStatics();
});

afterEach(() => vi.unstubAllGlobals());

it('re-sanitizes restored static HTML before returning Viewer content', async () => {
  await stubRecord(
    [
      '<main>',
      '<script>window.evil = true</script>',
      '<meta http-equiv="refresh" content="0; url=https://tracker.example">',
      '<iframe srcdoc="<script>alert(1)</script>"></iframe>',
      '<img src="../assets/image.png" onerror="alert(1)">',
      '<a href="https://tracker.example/page">External</a>',
      '<style>.hero { background: u\\72l("https://tracker.example/pixel.png"); }</style>',
      '</main>',
    ].join(''),
    [{ content: 'png', mimeType: 'image/png', path: 'assets/image.png' }]
  );

  const loaded = await loadWebSnapshotPackage('snapshot-1');

  expect(loaded.html).toContain('src="blob:snapshot-image"');
  expect(loaded.html).not.toContain('<script');
  expect(loaded.html).not.toContain('http-equiv="refresh"');
  expect(loaded.html).not.toContain('<iframe');
  expect(loaded.html).not.toContain('onerror');
  expect(loaded.html).not.toContain('tracker.example');
});

it('blocks all unresolved navigation and resource links in offline Viewer content', async () => {
  await stubRecord(
    [
      '<a href="https://example.com/details">Details</a>',
      '<link rel="stylesheet" href="https://tracker.example/style.css">',
      '<map><area href="https://tracker.example/map"></map>',
      '<svg><use href="https://tracker.example/icon.svg"></use></svg>',
      '<img src="https://tracker.example/pixel.png">',
    ].join('')
  );

  const loaded = await loadWebSnapshotPackage('snapshot-1');

  expect(loaded.html).not.toContain('https://');
});

it('sanitizes restored CSS assets before creating preview object URLs', async () => {
  const createdBlobs: Blob[] = [];
  stubObjectUrlStatics(
    vi.fn((blob) => {
      createdBlobs.push(blob);
      return blob.type === 'text/css' ? 'blob:snapshot-css' : 'blob:snapshot-image';
    })
  );
  await stubRecord('<link rel="stylesheet" href="../assets/style.css"><main>Page</main>', [
    {
      content: [
        '@im/* hidden */port "https://tracker.example/style.css";',
        '.hero { background: u\\72l("https://tracker.example/pixel.png"); color: red; }',
      ].join('\n'),
      mimeType: 'text/css',
      path: 'assets/style.css',
    },
  ]);

  const loaded = await loadWebSnapshotPackage('snapshot-1');
  const cssBlob = createdBlobs.filter((blob) => blob.type === 'text/css').at(-1);

  expect(loaded.html).toContain('href="blob:snapshot-css"');
  expect(cssBlob).toBeDefined();
  await expect(readPagePackageTestBlobText(cssBlob!)).resolves.toBe('');
});
