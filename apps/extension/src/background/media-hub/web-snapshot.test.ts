import { beforeEach, expect, it, vi } from 'vitest';
import JSZip from 'jszip';
import {
  WebSnapshotCaptureMode,
  type WebSnapshotManifest,
} from '@sniptale/runtime-contracts/web-snapshot';
import { WEB_SNAPSHOT_PACKAGE_PATHS } from '../../features/web-snapshot/manifest';
import { saveWebSnapshotToMediaHub } from './web-snapshot';

const mocks = vi.hoisted(() => ({
  ensureHeadroom: vi.fn(),
  saveWebSnapshot: vi.fn(),
}));

vi.mock('../../workflows/media-hub/store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../workflows/media-hub/store')>()),
  deleteMediaLibraryAssetsBatchSafely: vi.fn(),
  deleteOrphanedRawRecordingsSafely: vi.fn(),
  deleteStorageCleanupCandidatesSafely: vi.fn(),
  filterMediaItemsByTags: vi.fn(),
  getStorageCleanupReport: vi.fn(),
  saveProjectAssetSafely: vi.fn(),
  saveProjectExportSafely: vi.fn(),
  saveRecordingSafely: vi.fn(),
  saveRecordingTelemetrySafely: vi.fn(),
  saveScreenshotMediaAssetSafely: vi.fn(),
  saveWebSnapshotMediaAssetSafely: mocks.saveWebSnapshot,
  updateMediaLibraryEntrySafely: vi.fn(),
  updateScreenshotMediaAssetSafely: vi.fn(),
}));

vi.mock('../../features/media-hub/storage-capacity', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../features/media-hub/storage-capacity')>()),
  ensureMediaHubStorageHeadroom: mocks.ensureHeadroom,
  getStorageEstimateInfo: vi.fn(),
}));

function createManifest(): WebSnapshotManifest {
  return {
    captureMode: WebSnapshotCaptureMode.ReadOnlyNoScripts,
    capturedAt: '2026-05-12T00:00:00.000Z',
    id: 'snapshot-1',
    paths: {
      computedStyles: 'logs/css/computed-styles.json',
      domSnapshot: 'logs/dom.html',
      errors: 'logs/errors.log',
      manifest: 'manifest.json',
      screenshot: 'page-screenshot.png',
      snapshotHtml: 'snapshot/index.html',
      stylesheets: 'logs/css/stylesheets.json',
      virtualDomSnapshot: 'logs/virtual-dom.html',
    },
    schemaVersion: 1,
    source: {
      faviconUrl: 'https://example.com/favicon.ico',
      title: 'Example Page',
      url: 'https://example.com/page',
    },
    stats: { assetCount: 1, failedAssetCount: 0, packageSize: 10 },
    warnings: [],
  };
}

async function createPackageBase64(
  manifest: WebSnapshotManifest,
  extras: Record<string, string> = {}
): Promise<string> {
  const zip = new JSZip();
  zip.file(WEB_SNAPSHOT_PACKAGE_PATHS.manifest, JSON.stringify(manifest));
  zip.file(WEB_SNAPSHOT_PACKAGE_PATHS.snapshotHtml, '<!doctype html><main>Snapshot</main>');
  zip.file(WEB_SNAPSHOT_PACKAGE_PATHS.screenshot, 'png');
  zip.file(WEB_SNAPSHOT_PACKAGE_PATHS.computedStyles, '{}');
  zip.file(WEB_SNAPSHOT_PACKAGE_PATHS.domSnapshot, '<main>Snapshot</main>');
  zip.file(WEB_SNAPSHOT_PACKAGE_PATHS.errors, '');
  zip.file(WEB_SNAPSHOT_PACKAGE_PATHS.stylesheets, '[]');
  zip.file(WEB_SNAPSHOT_PACKAGE_PATHS.virtualDomSnapshot, '{}');
  for (const [path, content] of Object.entries(extras)) {
    zip.file(path, content);
  }

  const buffer = await zip.generateAsync({ type: 'nodebuffer' });
  return buffer.toString('base64');
}

async function createPayload(
  overrides: {
    manifest?: unknown;
    packageChunkBase64?: string;
    screenshotMimeType?: string;
  } = {}
) {
  const manifest = createManifest();
  const packageBase64 = overrides.packageChunkBase64 ?? (await createPackageBase64(manifest));
  const screenshotBase64 = Buffer.from('png').toString('base64');
  return {
    packageBlob: new Blob([Buffer.from(packageBase64, 'base64')], {
      type: 'application/x-sniptale-web-snapshot+zip',
    }),
    payload: {
      manifest: (overrides.manifest ?? manifest) as WebSnapshotManifest,
      packageStagedBlobId: 'package-stage-1',
      screenshotMimeType: overrides.screenshotMimeType ?? 'image/png',
      screenshotStagedBlobId: 'screenshot-stage-1',
      snapshotSessionId: 'snapshot-session-1',
    },
    screenshotBlob: new Blob([Buffer.from(screenshotBase64, 'base64')], {
      type: overrides.screenshotMimeType ?? 'image/png',
    }),
  };
}

function createProfiledPackageEntry(path: string, content = '{}') {
  return {
    _data: {
      compressedSize: Buffer.byteLength(content),
      uncompressedSize: Buffer.byteLength(content),
    },
    async: vi.fn(async () => new TextEncoder().encode(content)),
    dir: false,
    name: path,
  };
}

function mockPackageZipWithLargeAsset(
  manifest: WebSnapshotManifest,
  readLargeEntry: ReturnType<typeof vi.fn>
) {
  const entries = {
    [WEB_SNAPSHOT_PACKAGE_PATHS.manifest]: createProfiledPackageEntry(
      WEB_SNAPSHOT_PACKAGE_PATHS.manifest,
      JSON.stringify(manifest)
    ),
    [WEB_SNAPSHOT_PACKAGE_PATHS.snapshotHtml]: createProfiledPackageEntry(
      WEB_SNAPSHOT_PACKAGE_PATHS.snapshotHtml,
      '<!doctype html><main>Snapshot</main>'
    ),
    [WEB_SNAPSHOT_PACKAGE_PATHS.screenshot]: createProfiledPackageEntry(
      WEB_SNAPSHOT_PACKAGE_PATHS.screenshot,
      'png'
    ),
    'assets/large.bin': {
      _data: { compressedSize: 32, uncompressedSize: 26 * 1024 * 1024 },
      async: readLargeEntry,
      dir: false,
      name: 'assets/large.bin',
    },
  };
  const zip = Object.assign(new JSZip(), {
    file: (path: string) => entries[path as keyof typeof entries] ?? null,
    files: entries,
  });
  return vi.spyOn(JSZip, 'loadAsync').mockResolvedValue(zip);
}

beforeEach(() => {
  vi.restoreAllMocks();
  mocks.ensureHeadroom.mockReset();
  mocks.saveWebSnapshot.mockReset();
  vi.stubGlobal('atob', (value: string) => Buffer.from(value, 'base64').toString('binary'));
});

it('persists a web snapshot package through the media hub safe API', async () => {
  mocks.saveWebSnapshot.mockResolvedValue({ assetId: 'asset-1' });
  const manifest = createManifest();

  await expect(saveWebSnapshotToMediaHub(await createPayload({ manifest }))).resolves.toBe(
    'asset-1'
  );

  expect(mocks.ensureHeadroom).toHaveBeenCalledOnce();
  expect(mocks.saveWebSnapshot).toHaveBeenCalledWith(
    expect.objectContaining({
      filename: 'Example_Page.sniptale-web-snapshot.zip',
      sourceTitle: 'Example Page',
      sourceUrl: 'https://example.com/page',
    })
  );
});

it('sanitizes source provenance in saved web snapshot metadata and package manifest', async () => {
  mocks.saveWebSnapshot.mockResolvedValue({ assetId: 'asset-sensitive' });
  const manifest = createManifest();
  manifest.source = {
    faviconUrl: 'https://user:pass@example.com/favicon.ico?token=secret#hash',
    title: 'Sensitive Page',
    url: 'https://user:pass@example.com/invite/abc?token=secret#access_token=abc',
  };

  await saveWebSnapshotToMediaHub(await createPayload({ manifest }));

  const savedInput = mocks.saveWebSnapshot.mock.calls[0]?.[0];
  expect(savedInput).toEqual(
    expect.objectContaining({
      sourceFavicon: 'https://example.com/favicon.ico',
      sourceTitle: 'Sensitive Page',
      sourceUrl: 'https://example.com/',
    })
  );
  if (!savedInput) {
    throw new Error('Expected web snapshot to be saved');
  }

  const savedPackage = await JSZip.loadAsync(await savedInput.packageBlob.arrayBuffer());
  const savedManifestText = await savedPackage
    .file(WEB_SNAPSHOT_PACKAGE_PATHS.manifest)
    ?.async('string');

  expect(JSON.parse(savedManifestText ?? '{}').source).toEqual({
    faviconUrl: 'https://example.com/favicon.ico',
    title: 'Example Page',
    url: 'https://example.com/',
  });
});

it('falls back to safe snapshot filenames when source title is unavailable', async () => {
  mocks.saveWebSnapshot.mockResolvedValue({ assetId: 'asset-2' });
  const manifest = createManifest();
  manifest.source = { faviconUrl: null, title: null, url: null };

  await saveWebSnapshotToMediaHub(await createPayload({ manifest }));

  expect(mocks.saveWebSnapshot).toHaveBeenCalledWith(
    expect.objectContaining({
      filename: 'web-snapshot.sniptale-web-snapshot.zip',
      sourceFavicon: null,
      sourceTitle: null,
      sourceUrl: null,
    })
  );
});

it('rejects invalid manifests before persisting snapshot packages', async () => {
  await expect(
    saveWebSnapshotToMediaHub(await createPayload({ manifest: { id: 'snapshot-1' } }))
  ).rejects.toThrow('Web snapshot manifest is invalid');

  expect(mocks.saveWebSnapshot).not.toHaveBeenCalled();
});

it('rejects disallowed screenshot MIME types before decoding packages', async () => {
  await expect(
    saveWebSnapshotToMediaHub(await createPayload({ screenshotMimeType: 'image/svg+xml' }))
  ).rejects.toThrow('Web snapshot screenshot MIME type is not allowed');

  expect(mocks.saveWebSnapshot).not.toHaveBeenCalled();
});

it('rejects unexpected ZIP package entries before persisting snapshot packages', async () => {
  const manifest = createManifest();

  await expect(
    saveWebSnapshotToMediaHub(
      await createPayload({
        manifest,
        packageChunkBase64: await createPackageBase64(manifest, {
          'snapshot/extra.html': '<script></script>',
        }),
      })
    )
  ).rejects.toThrow('Web snapshot package contains an unexpected path');

  expect(mocks.saveWebSnapshot).not.toHaveBeenCalled();
});

it('rejects oversized ZIP entry metadata before inflating web snapshot packages', async () => {
  const manifest = createManifest();
  const readLargeEntry = vi.fn(() => {
    throw new Error('Rejected ZIP entry was inflated.');
  });
  mockPackageZipWithLargeAsset(manifest, readLargeEntry);

  await expect(
    saveWebSnapshotToMediaHub(
      await createPayload({
        manifest,
        packageChunkBase64: Buffer.from('zip').toString('base64'),
      })
    )
  ).rejects.toThrow('Web snapshot package entry is too large');

  expect(readLargeEntry).not.toHaveBeenCalled();
  expect(mocks.saveWebSnapshot).not.toHaveBeenCalled();
});
