// @vitest-environment jsdom

import JSZip from 'jszip';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  WebSnapshotCaptureMode,
  type WebSnapshotManifest,
} from '@sniptale/runtime-contracts/web-snapshot';
import { WEB_SNAPSHOT_PACKAGE_PATHS } from '../../features/web-snapshot/manifest';
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
    super(parts, 'snapshot.zip');
  }

  override get size(): number {
    return 101 * 1024 * 1024;
  }
}

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
async function createPackageBlob(args: {
  extras?: Record<string, string | Uint8Array>;
  html?: string | Uint8Array;
  manifest?: WebSnapshotManifest | string;
}): Promise<Blob> {
  const manifest = args.manifest ?? createManifest();
  const zip = new JSZip();
  zip.file(
    WEB_SNAPSHOT_PACKAGE_PATHS.manifest,
    typeof manifest === 'string' ? manifest : JSON.stringify(manifest)
  );
  zip.file(
    WEB_SNAPSHOT_PACKAGE_PATHS.snapshotHtml,
    args.html ??
      [
        '<!doctype html>',
        '<img src="../assets/image.png" srcset="../assets/image.png 1x, ../assets/missing.png 2x">',
        '<a href="../assets/document.txt">Document</a>',
      ].join('')
  );
  zip.file(WEB_SNAPSHOT_PACKAGE_PATHS.screenshot, 'png');
  zip.file(WEB_SNAPSHOT_PACKAGE_PATHS.computedStyles, '{}');
  zip.file(WEB_SNAPSHOT_PACKAGE_PATHS.domSnapshot, '<main>Snapshot</main>');
  zip.file(WEB_SNAPSHOT_PACKAGE_PATHS.errors, '');
  zip.file(WEB_SNAPSHOT_PACKAGE_PATHS.stylesheets, '[]');
  zip.file(WEB_SNAPSHOT_PACKAGE_PATHS.virtualDomSnapshot, '{}');

  for (const [path, content] of Object.entries(args.extras ?? {})) {
    zip.file(path, content);
  }
  return zip.generateAsync({ type: 'blob' });
}

async function stubWebSnapshotRecord(args: {
  extras?: Record<string, string | Uint8Array>;
  html?: string | Uint8Array;
  manifest?: WebSnapshotManifest | string;
  recordManifest?: WebSnapshotManifest;
}): Promise<void> {
  const recordManifest = args.recordManifest ?? createManifest();
  const packageArgs: Parameters<typeof createPackageBlob>[0] = {
    manifest: args.manifest ?? recordManifest,
  };
  if (args.extras !== undefined) {
    packageArgs.extras = args.extras;
  }
  if (args.html !== undefined) {
    packageArgs.html = args.html;
  }

  mocks.getWebSnapshotRecord.mockResolvedValue({
    createdAt: 1,
    id: 'snapshot-1',
    manifest: recordManifest,
    packageFile: new File([await createPackageBlob(packageArgs)], 'snapshot.zip'),
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
    size: 101 * 1024 * 1024,
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
      'assets/document.txt': 'document',
      'assets/image.png': 'png',
    },
  });

  const loaded = await loadWebSnapshotPackage('snapshot-1');

  expect(loaded.objectUrls).toEqual([
    'blob:snapshot-asset',
    'blob:snapshot-asset',
    'blob:snapshot-asset',
  ]);
  expect(loaded.screenshotUrl).toBe('blob:snapshot-asset');
  expect(loaded.html).toContain('src="blob:snapshot-asset"');
  expect(loaded.html).toContain('<a>Document</a>');
  expect(loaded.html).not.toContain('href=');
  expect(loaded.html).toContain('srcset="blob:snapshot-asset 1x"');
  expect(URL.createObjectURL).toHaveBeenCalledTimes(3);
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
    'Web snapshot package contains an unsafe path.'
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
    packageFile: new File(['zip'], 'snapshot.zip'),
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
    manifest: createManifest({ id: 'package-snapshot' }),
    recordManifest: createManifest({ id: 'record-snapshot' }),
  });

  await expect(loadWebSnapshotPackage('snapshot-1')).rejects.toThrow(
    'Web snapshot package manifest does not match the saved record.'
  );

  expect(URL.createObjectURL).not.toHaveBeenCalled();
});
