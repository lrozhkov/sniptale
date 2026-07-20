import JSZip from 'jszip';
import { beforeEach, expect, it, vi } from 'vitest';
import type { WebSnapshotManifest } from '@sniptale/runtime-contracts/web-snapshot';
import {
  createWebSnapshotManifest,
  WEB_SNAPSHOT_PACKAGE_PATHS,
} from '../../../features/web-snapshot/manifest';
import type { MediaLibraryEntry } from './contracts';
import type { WebSnapshotRecord } from '../web-snapshots/contracts';

const dbMocks = vi.hoisted(() => ({
  getMock: vi.fn(),
  getWebSnapshotRecordMock: vi.fn(),
  initDBMock: vi.fn(),
}));

vi.mock('../infrastructure/indexed-db/core', () => ({
  MEDIA_LIBRARY_STORE: 'media_library',
  THUMBNAILS_STORE: 'thumbnails',
  initDB: dbMocks.initDBMock,
}));

vi.mock('../projects/index', async (importOriginal) => ({
  ...(await importOriginal()),
  getProjectAsset: vi.fn(),
}));

vi.mock('../recordings/index', async (importOriginal) => ({
  ...(await importOriginal()),
  getRecording: vi.fn(),
}));

vi.mock('../web-snapshots', async (importOriginal) => ({
  ...(await importOriginal()),
  getWebSnapshotRecord: dbMocks.getWebSnapshotRecordMock,
}));

beforeEach(() => {
  vi.clearAllMocks();
  dbMocks.getMock.mockResolvedValue(createWebSnapshotMediaEntry());
  dbMocks.initDBMock.mockResolvedValue({
    get: dbMocks.getMock,
  });
});

it('sanitizes web snapshot package provenance before direct media blob egress', async () => {
  const manifest = createLegacyManifest();
  const packageBlob = await createPackageBlob(manifest);
  dbMocks.getWebSnapshotRecordMock.mockResolvedValue(createSnapshotRecord(manifest, packageBlob));
  const { getMediaAssetBlob } = await import('./index.library.ts');

  const result = await getMediaAssetBlob('asset-1');

  expect(result).toBeInstanceOf(Blob);
  const zip = await JSZip.loadAsync(await result!.arrayBuffer());
  const manifestText = await zip.file(WEB_SNAPSHOT_PACKAGE_PATHS.manifest)?.async('string');
  expect(JSON.parse(manifestText ?? '{}').source).toEqual({
    faviconUrl: 'https://example.com/favicon.ico',
    title: 'Snapshot',
    url: 'https://example.com/',
  });
});

function createWebSnapshotMediaEntry(): MediaLibraryEntry {
  return {
    createdAt: 10,
    duration: null,
    filename: 'snapshot.zip',
    height: null,
    id: 'asset-1',
    kind: 'web-archive',
    mimeType: 'application/x-sniptale-web-snapshot+zip',
    originalFilename: 'snapshot.zip',
    size: 10,
    source: { kind: 'web-snapshot', snapshotId: 'snapshot-1' },
    sourceFavicon: null,
    sourceTitle: 'Snapshot',
    sourceUrl: null,
    tags: [],
    updatedAt: 20,
    width: null,
  };
}

function createLegacyManifest(): WebSnapshotManifest {
  return createWebSnapshotManifest({
    id: 'snapshot-1',
    source: {
      faviconUrl: 'https://user:pass@example.com/favicon.ico?token=secret#hash',
      title: 'Snapshot',
      url: 'https://user:pass@example.com/reset-password/abc123?token=secret#hash',
    },
  });
}

async function createPackageBlob(manifest: WebSnapshotManifest): Promise<Blob> {
  const zip = new JSZip();
  zip.file(WEB_SNAPSHOT_PACKAGE_PATHS.manifest, JSON.stringify(manifest));
  zip.file(WEB_SNAPSHOT_PACKAGE_PATHS.snapshotHtml, '<main></main>');
  return zip.generateAsync({ type: 'blob' });
}

function createSnapshotRecord(manifest: WebSnapshotManifest, packageBlob: Blob): WebSnapshotRecord {
  return {
    createdAt: 10,
    id: 'snapshot-1',
    manifest,
    packageBlob,
    size: packageBlob.size,
    updatedAt: 20,
  };
}
