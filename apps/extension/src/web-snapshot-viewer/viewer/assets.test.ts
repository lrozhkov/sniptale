// @vitest-environment jsdom

import JSZip from 'jszip';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { WebSnapshotManifest } from '@sniptale/runtime-contracts/web-snapshot';
import {
  PAGE_PACKAGE_ARCHIVE_MIME_TYPE,
  PAGE_PACKAGE_ARCHIVE_PATHS,
} from '@sniptale/runtime-contracts/page-package';
import { WEB_SNAPSHOT_PACKAGE_PATHS } from '../../features/web-snapshot/manifest';
import { createPagePackageManifestFixture } from '../../features/web-snapshot/manifest.test-support';
import {
  createPagePackageArchiveFixture,
  createPagePackagePngBytes,
  createPagePackageTestBlobFromBytes,
  readPagePackageTestBlobBytes,
  type PagePackageFixtureEntry,
} from '../../features/web-snapshot/package.test-support';
import type { WebSnapshotRecord } from '../../composition/persistence/web-snapshots/contracts';

const NativeURL = URL;

const mocks = vi.hoisted(() => ({
  getWebSnapshotRecord: vi.fn(),
  getWebSnapshotScreenshotFile: vi.fn(),
  validateRetainedWebSnapshotScreenshot: vi.fn(),
}));

vi.mock('../../composition/persistence/web-snapshots', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../composition/persistence/web-snapshots')>()),
  getWebSnapshotRecord: mocks.getWebSnapshotRecord,
  getWebSnapshotScreenshotFile: mocks.getWebSnapshotScreenshotFile,
}));

vi.mock('../../features/web-snapshot/screenshot-validation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../features/web-snapshot/screenshot-validation')>()),
  validateRetainedWebSnapshotScreenshot: mocks.validateRetainedWebSnapshotScreenshot,
}));

import { loadWebSnapshotPackage } from './assets';

class OversizedWebSnapshotPackageFile extends File {
  constructor(parts: BlobPart[]) {
    super(parts, 'snapshot.sniptale-page-package.zip');
  }

  override get size(): number {
    return 250 * 1024 * 1024 + 1;
  }
}

function createManifest(overrides: Partial<WebSnapshotManifest> = {}): WebSnapshotManifest {
  return createPagePackageManifestFixture(overrides);
}
async function createPackageBlob(args: {
  diagnosticExtras?: Record<string, string | Uint8Array>;
  extras?: Record<string, string | Uint8Array>;
  html?: string | Uint8Array;
  manifest?: WebSnapshotManifest | string;
  screenshotCoverage?: 'full-page' | 'viewport';
}): Promise<{ manifest: WebSnapshotManifest; packageBlob: Blob }> {
  const html =
    args.html ??
    [
      '<!doctype html>',
      '<img src="../assets/image.png" srcset="../assets/image.png 1x, ../assets/missing.png 2x">',
      '<a href="../assets/document.png">Document</a>',
    ].join('');
  const toBlob = (content: string | Uint8Array, type: string): Blob => {
    if (typeof content === 'string') return new Blob([content], { type });
    const copy = new Uint8Array(new ArrayBuffer(content.byteLength));
    copy.set(content);
    return new Blob([copy], { type });
  };
  const entries: PagePackageFixtureEntry[] = [
    {
      blob: toBlob(html, 'text/html'),
      component: 'webCopy',
      path: PAGE_PACKAGE_ARCHIVE_PATHS.snapshotHtml,
    },
    {
      blob: toBlob(createPagePackagePngBytes(), 'image/png'),
      component: 'webCopy',
      path:
        args.screenshotCoverage === 'viewport'
          ? PAGE_PACKAGE_ARCHIVE_PATHS.partialScreenshot
          : PAGE_PACKAGE_ARCHIVE_PATHS.screenshot,
    },
    {
      blob: new Blob(['webp'], { type: 'image/webp' }),
      component: 'webCopy',
      path: PAGE_PACKAGE_ARCHIVE_PATHS.thumbnail,
    },
    ...Object.entries(args.extras ?? {})
      .filter(([path]) => !path.includes('..'))
      .map(([path, content]) => ({
        blob: toBlob(
          content,
          path.toLowerCase().endsWith('.css')
            ? 'text/css'
            : path.toLowerCase().endsWith('.png')
              ? 'image/png'
              : 'image/png'
        ),
        component: 'webCopy' as const,
        path,
      })),
    ...Object.entries(args.diagnosticExtras ?? {}).map(([path, content]) => ({
      blob: toBlob(content, 'text/plain'),
      component: 'diagnostics' as const,
      path,
    })),
  ];
  const fixture = await createPagePackageArchiveFixture({ entries });
  const zip = await JSZip.loadAsync(await readPagePackageTestBlobBytes(fixture.packageBlob));
  for (const [path, content] of Object.entries(args.extras ?? {})) {
    if (path.includes('..')) zip.file(path, content, { createFolders: false });
  }
  const manifest =
    args.manifest ??
    (args.screenshotCoverage === 'viewport'
      ? {
          ...fixture.manifest,
          components: fixture.manifest.components.map((component) =>
            component.id === 'webCopy' ? { ...component, status: 'partial' as const } : component
          ),
        }
      : fixture.manifest);
  zip.file(
    WEB_SNAPSHOT_PACKAGE_PATHS.manifest,
    typeof manifest === 'string' ? manifest : JSON.stringify(manifest)
  );
  const raw = await zip.generateAsync({ type: 'uint8array' });
  return {
    manifest: typeof manifest === 'string' ? fixture.manifest : manifest,
    packageBlob: createPagePackageTestBlobFromBytes(raw, PAGE_PACKAGE_ARCHIVE_MIME_TYPE),
  };
}

async function stubWebSnapshotRecord(args: {
  diagnosticExtras?: Record<string, string | Uint8Array>;
  extras?: Record<string, string | Uint8Array>;
  html?: string | Uint8Array;
  manifest?: WebSnapshotManifest | string;
  recordManifest?: WebSnapshotManifest;
  screenshotCoverage?: 'full-page' | 'viewport';
}): Promise<void> {
  const packageArgs: Parameters<typeof createPackageBlob>[0] = {
    ...(args.diagnosticExtras === undefined ? {} : { diagnosticExtras: args.diagnosticExtras }),
    ...(args.manifest === undefined ? {} : { manifest: args.manifest }),
    ...(args.screenshotCoverage === undefined
      ? {}
      : { screenshotCoverage: args.screenshotCoverage }),
  };
  if (args.extras !== undefined) {
    packageArgs.extras = args.extras;
  }
  if (args.html !== undefined) {
    packageArgs.html = args.html;
  }

  const packaged = await createPackageBlob(packageArgs);
  const recordManifest = args.recordManifest ?? packaged.manifest;
  mocks.getWebSnapshotRecord.mockResolvedValue({
    createdAt: 1,
    id: 'snapshot-1',
    manifest: recordManifest,
    packageFile: new File([packaged.packageBlob], 'snapshot.sniptale-page-package.zip', {
      type: PAGE_PACKAGE_ARCHIVE_MIME_TYPE,
    }),
    size: 1,
    updatedAt: 1,
  } satisfies WebSnapshotRecord);
}

function stubOversizedWebSnapshotRecord(): void {
  mocks.getWebSnapshotRecord.mockResolvedValue({
    createdAt: 1,
    id: 'snapshot-1',
    manifest: createManifest(),
    packageFile: new OversizedWebSnapshotPackageFile(['zip']),
    size: 250 * 1024 * 1024 + 1,
    updatedAt: 1,
  } satisfies WebSnapshotRecord);
}

function stubObjectUrlStatics(
  args: {
    createObjectURL?: ReturnType<typeof vi.fn>;
    revokeObjectURL?: ReturnType<typeof vi.fn>;
  } = {}
) {
  const createObjectURL = args.createObjectURL ?? vi.fn(() => 'blob:snapshot-asset');
  const revokeObjectURL = args.revokeObjectURL ?? vi.fn();

  class MockURL extends NativeURL {}
  Object.defineProperties(MockURL, {
    createObjectURL: { configurable: true, value: createObjectURL },
    revokeObjectURL: { configurable: true, value: revokeObjectURL },
  });
  vi.stubGlobal('URL', MockURL);

  return { createObjectURL, revokeObjectURL };
}

function readTestBlobText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.readAsText(blob);
  });
}

function mockLargeViewerZip(
  manifest: WebSnapshotManifest,
  readLargeEntry: ReturnType<typeof vi.fn>
) {
  const entry = (path: string, content = '{}') => ({
    _data: {
      compressedSize: Buffer.byteLength(content),
      uncompressedSize: Buffer.byteLength(content),
    },
    async: vi.fn(async () => new TextEncoder().encode(content)),
    dir: false,
    name: path,
    unsafeOriginalName: path,
  });
  const entries = {
    [WEB_SNAPSHOT_PACKAGE_PATHS.manifest]: entry(
      WEB_SNAPSHOT_PACKAGE_PATHS.manifest,
      JSON.stringify(manifest)
    ),
    [WEB_SNAPSHOT_PACKAGE_PATHS.snapshotHtml]: entry(
      WEB_SNAPSHOT_PACKAGE_PATHS.snapshotHtml,
      '<!doctype html><main>Snapshot</main>'
    ),
    [WEB_SNAPSHOT_PACKAGE_PATHS.screenshot]: entry(WEB_SNAPSHOT_PACKAGE_PATHS.screenshot, 'png'),
    'assets/large.bin': {
      _data: { compressedSize: 32, uncompressedSize: 26 * 1024 * 1024 },
      async: readLargeEntry,
      dir: false,
      name: 'assets/large.bin',
      unsafeOriginalName: 'assets/large.bin',
    },
  };
  return vi.spyOn(JSZip, 'loadAsync').mockResolvedValue(
    Object.assign(new JSZip(), {
      file: (path: string) => entries[path as keyof typeof entries] ?? null,
      files: entries,
    })
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getWebSnapshotScreenshotFile.mockResolvedValue(
    new File(['png'], 'snapshot.png', { type: 'image/png' })
  );
  mocks.validateRetainedWebSnapshotScreenshot.mockResolvedValue({ height: 720, width: 1280 });
  stubObjectUrlStatics();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it('loads a valid package and rewrites captured asset references to object URLs', async () => {
  await stubWebSnapshotRecord({
    extras: {
      'assets/document.png': 'document',
      'assets/image.png': 'png',
    },
  });

  const loaded = await loadWebSnapshotPackage('snapshot-1');

  expect(loaded.objectUrls).toEqual([
    'blob:snapshot-asset',
    'blob:snapshot-asset',
    'blob:snapshot-asset',
    'blob:snapshot-asset',
    'blob:snapshot-asset',
  ]);
  expect(loaded.archiveFilename).toBe('Snapshot.sniptale-page-package.zip');
  expect(loaded.archiveSize).toBeGreaterThan(0);
  expect(loaded.archiveUrl).toBe('blob:snapshot-asset');
  expect(loaded.screenshotUrl).toBe('blob:snapshot-asset');
  expect(loaded.screenshotCoverage).toBe('full-page');
  expect(loaded.html).toContain('src="blob:snapshot-asset"');
  expect(loaded.html).toContain(
    '<a data-sniptale-external-href="https://example.test/assets/document.png">Document</a>'
  );
  expect(loaded.html).not.toContain(' href=');
  expect(loaded.html).toContain('srcset="blob:snapshot-asset 1x"');
  expect(URL.createObjectURL).toHaveBeenCalledTimes(5);
});

it('materializes SVG sprite fragments in DOM and CSS asset references', async () => {
  await stubWebSnapshotRecord({
    extras: { 'assets/icons.svg': '<svg></svg>' },
    html: [
      '<!doctype html>',
      '<style>.approve { background-image: url("../assets/icons.svg#approve"); }</style>',
      '<svg><use href="../assets/icons.svg#approve"></use>',
      '<use xlink:href="../assets/icons.svg#reject"></use></svg>',
    ].join(''),
  });

  const loaded = await loadWebSnapshotPackage('snapshot-1');

  expect(loaded.html).toContain('url("blob:snapshot-asset#approve")');
  expect(loaded.html).toContain('href="blob:snapshot-asset#approve"');
  expect(loaded.html).toContain('xlink:href="blob:snapshot-asset#reject"');
});

it('loads a partial viewport preview and exposes its coverage to the Viewer UI', async () => {
  await stubWebSnapshotRecord({ screenshotCoverage: 'viewport' });

  const loaded = await loadWebSnapshotPackage('snapshot-1');

  expect(loaded.screenshotCoverage).toBe('viewport');
  expect(mocks.validateRetainedWebSnapshotScreenshot).toHaveBeenCalledOnce();
});

it('loads an asset-rich package beyond the removed legacy viewer file ceiling', async () => {
  const extras = Object.fromEntries(
    Array.from({ length: 501 }, (_, index) => [`assets/image-${index}.png`, 'png'])
  );
  await stubWebSnapshotRecord({ extras });

  const loaded = await loadWebSnapshotPackage('snapshot-1');

  expect(loaded.assets).toHaveLength(501);
});

it('does not inflate diagnostic entries that the passive Viewer does not render', async () => {
  await stubWebSnapshotRecord({
    diagnosticExtras: { 'diagnostics/standard/dom.html.txt': 'diagnostic DOM' },
    extras: { 'assets/image.png': 'png' },
  });
  const record = await mocks.getWebSnapshotRecord('snapshot-1');
  const zip = await JSZip.loadAsync(record!.packageFile);
  const diagnosticEntry = zip.file('diagnostics/standard/dom.html.txt')!;
  const diagnosticRead = vi.spyOn(diagnosticEntry, 'async');
  const loadAsyncSpy = vi.spyOn(JSZip, 'loadAsync').mockResolvedValue(zip);

  try {
    await loadWebSnapshotPackage('snapshot-1');
    expect(diagnosticRead).not.toHaveBeenCalled();
  } finally {
    loadAsyncSpy.mockRestore();
  }
});

it('loads XHTML through a typed document blob without HTML tree normalization', async () => {
  const createdBlobs: Blob[] = [];
  const createObjectURL = vi.fn((blob: Blob) => {
    createdBlobs.push(blob);
    return `blob:snapshot-${createdBlobs.length}`;
  });
  stubObjectUrlStatics({ createObjectURL });
  await stubWebSnapshotRecord({
    extras: { 'assets/image.png': 'png' },
    html: [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<html xmlns="http://www.w3.org/1999/xhtml"><head><style>p&gt;div{display:block}</style></head>',
      '<body><p><div><img src="../assets/image.png" /></div></p>',
      '<table><tr><td>Cell</td></tr></table><pre>first&#13;second</pre></body></html>',
    ].join(''),
  });

  const loaded = await loadWebSnapshotPackage('snapshot-1');

  expect(loaded.documentUrl).toBe('blob:snapshot-2');
  const documentBlob = createdBlobs[1];
  expect(documentBlob?.type).toBe('application/xhtml+xml');
  const documentText = await readTestBlobText(documentBlob!);
  expect(documentText).toContain('<p><div><img src="blob:snapshot-1" /></div></p>');
  expect(documentText).toContain('<table><tr><td>Cell</td></tr></table>');
  expect(documentText).toContain('first&#13;second');
  expect(documentText).toContain('Content-Security-Policy');
  expect(documentText).toContain('data-sniptale-viewer-baseline="true"');
});

it('rewrites packaged CSS resources to verified object URLs without network references', async () => {
  await stubWebSnapshotRecord({
    extras: { 'assets/hero.png': 'png' },
    html: [
      '<style>.hero { background-image: url("../assets/hero.png"); }</style>',
      '<main class="hero" style="mask-image: url(https://tracker.example/mask.png)">Page</main>',
    ].join(''),
  });

  const loaded = await loadWebSnapshotPackage('snapshot-1');

  expect(loaded.html).toContain('background-image: url("blob:snapshot-asset")');
  expect(loaded.html).not.toContain('tracker.example');
  expect(loaded.html).not.toContain('../assets/hero.png');
});

it('rewrites packaged image and CSS assets inside nested declarative shadow roots', async () => {
  await stubWebSnapshotRecord({
    extras: { 'assets/shadow.png': 'png' },
    html: [
      '<section><template shadowrootmode="open">',
      '<style>.shadow { background:url("../assets/shadow.png"); }</style>',
      '<article><template shadowrootmode="open">',
      '<img class="shadow" src="../assets/shadow.png">',
      '<img src="https://tracker.example/escape.png">',
      '</template></article>',
      '</template></section>',
    ].join(''),
  });

  const loaded = await loadWebSnapshotPackage('snapshot-1');

  expect(loaded.html.match(/shadowrootmode="open"/g)).toHaveLength(2);
  expect(loaded.html).toContain('background:url("blob:snapshot-asset")');
  expect(loaded.html).toContain('src="blob:snapshot-asset"');
  expect(loaded.html).not.toContain('../assets/shadow.png');
  expect(loaded.html).not.toContain('tracker.example');
});

it('rejects a missing retained screenshot before creating package asset URLs', async () => {
  await stubWebSnapshotRecord({ extras: { 'assets/image.png': 'png' } });
  mocks.getWebSnapshotScreenshotFile.mockResolvedValue(undefined);

  await expect(loadWebSnapshotPackage('snapshot-1')).rejects.toThrow(
    'Web snapshot screenshot is missing.'
  );
  expect(URL.createObjectURL).not.toHaveBeenCalled();
  expect(URL.revokeObjectURL).not.toHaveBeenCalled();
});

it.each([
  'Web snapshot screenshot is too large.',
  'Web snapshot screenshot is invalid.',
  'Web snapshot screenshot dimensions exceed safe limits.',
])(
  'rejects an unsafe retained screenshot before creating package asset URLs: %s',
  async (message) => {
    await stubWebSnapshotRecord({ extras: { 'assets/image.png': 'png' } });
    mocks.validateRetainedWebSnapshotScreenshot.mockRejectedValue(new Error(message));

    await expect(loadWebSnapshotPackage('snapshot-1')).rejects.toThrow(message);
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
  }
);

it('rejects unsafe package paths before creating asset object URLs', async () => {
  await stubWebSnapshotRecord({
    extras: {
      '../escape.png': 'png',
      'assets/image.png': 'png',
    },
  });

  await expect(loadWebSnapshotPackage('snapshot-1')).rejects.toThrow(
    'Invalid media archive path: ../escape.png.'
  );

  expect(URL.createObjectURL).not.toHaveBeenCalled();
});

it('rejects oversized text entries before creating asset object URLs', async () => {
  await stubWebSnapshotRecord({
    extras: { 'assets/image.png': 'png' },
    html: new Uint8Array(10 * 1024 * 1024 + 1),
  });

  await expect(loadWebSnapshotPackage('snapshot-1')).rejects.toThrow(
    'Web snapshot package entry is too large.'
  );

  expect(URL.createObjectURL).not.toHaveBeenCalled();
});

it('rejects oversized entry metadata before inflating viewer package entries', async () => {
  const readLargeEntry = vi.fn(() => {
    throw new Error('Rejected ZIP entry was inflated.');
  });
  const recordManifest = createManifest();
  mocks.getWebSnapshotRecord.mockResolvedValue({
    createdAt: 1,
    id: 'snapshot-1',
    manifest: recordManifest,
    packageFile: new File(['zip'], 'snapshot.sniptale-page-package.zip'),
    size: 1,
    updatedAt: 1,
  } satisfies WebSnapshotRecord);
  const loadAsyncSpy = mockLargeViewerZip(recordManifest, readLargeEntry);

  try {
    await expect(loadWebSnapshotPackage('snapshot-1')).rejects.toThrow(
      'Web snapshot package entry is too large.'
    );
    expect(readLargeEntry).not.toHaveBeenCalled();
  } finally {
    loadAsyncSpy.mockRestore();
  }
});

it('rejects aggregate inflated metadata above 250 MiB before inflating viewer entries', async () => {
  const readEntry = vi.fn(() => {
    throw new Error('Rejected ZIP entry was inflated.');
  });
  const entries = Object.fromEntries(
    Array.from({ length: 11 }, (_, index) => {
      const path = `assets/chunk-${index}.bin`;
      return [
        path,
        {
          _data: { compressedSize: 32 * 1024, uncompressedSize: 24 * 1024 * 1024 },
          async: readEntry,
          dir: false,
          name: path,
          unsafeOriginalName: path,
        },
      ];
    })
  );
  mocks.getWebSnapshotRecord.mockResolvedValue({
    createdAt: 1,
    id: 'snapshot-1',
    manifest: createManifest(),
    packageFile: new File(['zip'], 'snapshot.sniptale-page-package.zip'),
    size: 1,
    updatedAt: 1,
  } satisfies WebSnapshotRecord);
  const loadAsyncSpy = vi
    .spyOn(JSZip, 'loadAsync')
    .mockResolvedValue(Object.assign(new JSZip(), { files: entries }));

  try {
    await expect(loadWebSnapshotPackage('snapshot-1')).rejects.toThrow(
      'Web snapshot package inflated content is too large.'
    );
    expect(readEntry).not.toHaveBeenCalled();
  } finally {
    loadAsyncSpy.mockRestore();
  }
});

it('rejects oversized compressed packages before unzip allocation', async () => {
  const loadAsyncSpy = vi.spyOn(JSZip, 'loadAsync');
  stubOversizedWebSnapshotRecord();

  await expect(loadWebSnapshotPackage('snapshot-1')).rejects.toThrow(
    'Web snapshot package archive is too large.'
  );

  expect(loadAsyncSpy).not.toHaveBeenCalled();
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});

it('rejects package manifests that do not match the saved record authority', async () => {
  await stubWebSnapshotRecord({
    extras: { 'assets/image.png': 'png' },
    recordManifest: createManifest({ id: 'record-snapshot' }),
  });

  await expect(loadWebSnapshotPackage('snapshot-1')).rejects.toThrow(
    'Web snapshot package manifest does not match the saved record.'
  );

  expect(URL.createObjectURL).not.toHaveBeenCalled();
});
