import type JSZip from 'jszip';
import { beforeEach, expect, it, vi } from 'vitest';
import type { MediaLibraryEntry } from '../../../composition/persistence/media-library/contracts';
import type { MediaHubBackupMetadata } from '../contracts/types';

const {
  assertBackupImportAssetEntriesAvailableMock,
  deleteExistingAssetRecordMock,
  getImportTransactionStoreNamesMock,
  initDBMock,
  assertBackupImportWritePreflightCompleteMock,
  loadBackupImportAssetBatchMock,
  prepareProjectDomainsMock,
  prepareBackupImportAssetMock,
  publishMediaHubLibraryChangedMock,
  assertPreparedProjectBlobsAvailableMock,
  restorePreparedProjectDomainsInTransactionMock,
  restoreAssetRecordMock,
  restoreAssetRecordSnapshotMock,
  snapshotExistingAssetRecordMock,
  withMediaHubWriteGuardMock,
} = vi.hoisted(() => ({
  assertBackupImportAssetEntriesAvailableMock: vi.fn(),
  deleteExistingAssetRecordMock: vi.fn(),
  getImportTransactionStoreNamesMock: vi.fn(),
  initDBMock: vi.fn(),
  assertBackupImportWritePreflightCompleteMock: vi.fn(),
  loadBackupImportAssetBatchMock: vi.fn(),
  prepareProjectDomainsMock: vi.fn(),
  prepareBackupImportAssetMock: vi.fn(),
  publishMediaHubLibraryChangedMock: vi.fn(),
  assertPreparedProjectBlobsAvailableMock: vi.fn(),
  restorePreparedProjectDomainsInTransactionMock: vi.fn(),
  restoreAssetRecordMock: vi.fn(),
  restoreAssetRecordSnapshotMock: vi.fn(),
  snapshotExistingAssetRecordMock: vi.fn(),
  withMediaHubWriteGuardMock: vi.fn(),
}));

vi.mock(
  '../../../composition/persistence/infrastructure/indexed-db/core',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../../composition/persistence/infrastructure/indexed-db/core')
    >()),
    initDB: initDBMock,
  })
);

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.mock('../../../features/media-hub/events', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../features/media-hub/events')>()),
  publishMediaHubLibraryChanged: publishMediaHubLibraryChangedMock,
}));

vi.mock('../../../features/media-hub/storage-errors', () => ({
  createMediaHubStorageHeadroomError: vi.fn(),
  withMediaHubWriteGuard: withMediaHubWriteGuardMock,
}));

vi.mock('./prepare', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./prepare')>()),
  assertBackupImportAssetEntriesAvailable: assertBackupImportAssetEntriesAvailableMock,
  loadBackupImportAssetBatch: loadBackupImportAssetBatchMock,
  prepareBackupImportAsset: prepareBackupImportAssetMock,
}));

vi.mock('./project/prepare', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./project/prepare')>()),
  prepareProjectDomains: prepareProjectDomainsMock,
}));

vi.mock('./project/preflight', () => ({
  assertPreparedProjectBlobsAvailable: assertPreparedProjectBlobsAvailableMock,
}));

vi.mock('./projects', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./projects')>()),
  isEmptyProjectDomainPlan: (prepared: { scenarioProjects: unknown[]; videoProjects: unknown[] }) =>
    prepared.videoProjects.length === 0 && prepared.scenarioProjects.length === 0,
  restorePreparedProjectDomainsInTransaction: restorePreparedProjectDomainsInTransactionMock,
}));

vi.mock('./write', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./write')>()),
  assertBackupImportWritePreflightComplete: assertBackupImportWritePreflightCompleteMock,
  deleteExistingAssetRecord: deleteExistingAssetRecordMock,
  getImportTransactionStoreNames: getImportTransactionStoreNamesMock,
  restoreAssetRecordSnapshot: restoreAssetRecordSnapshotMock,
  restoreAssetRecord: restoreAssetRecordMock,
  snapshotExistingAssetRecord: snapshotExistingAssetRecordMock,
}));

function createMediaEntry(
  source: MediaLibraryEntry['source'],
  overrides: Partial<Omit<MediaLibraryEntry, 'blob'>> = {}
): Omit<MediaLibraryEntry, 'blob'> {
  return {
    createdAt: 10,
    duration: null,
    filename: 'asset.png',
    height: 1080,
    id: 'asset-1',
    kind: 'screenshot',
    mimeType: 'image/png',
    originalFilename: 'asset.png',
    size: 123,
    source,
    sourceFavicon: null,
    sourceTitle: null,
    sourceUrl: null,
    tags: [],
    updatedAt: 20,
    width: 1920,
    ...overrides,
  };
}

function createMetadata(entry: Omit<MediaLibraryEntry, 'blob'>): MediaHubBackupMetadata {
  return {
    assets: [{ assetPath: 'assets/asset-1', entry, thumbnailPath: null }],
    effectBundles: [],
  };
}

function createTransactionHarness() {
  const tx = { done: Promise.resolve() };
  const transaction = vi.fn().mockReturnValue(tx);

  initDBMock.mockResolvedValue({ transaction });
  getImportTransactionStoreNamesMock.mockReturnValue(['media_library']);

  return { transaction, tx };
}

function createDuplicatePreparedAsset(args: {
  existingEntry: Omit<MediaLibraryEntry, 'blob'>;
  nextEntry: Omit<MediaLibraryEntry, 'blob'>;
}) {
  return {
    assetPath: 'assets/asset-1',
    existingEntry: args.existingEntry,
    nextEntry: args.nextEntry,
    recordingTelemetry: null,
    thumbnailPath: 'thumbnails/asset-1',
    webSnapshotPackage: null,
  };
}

function createDuplicateLoadedAsset(args: {
  existingEntry: Omit<MediaLibraryEntry, 'blob'>;
  nextEntry: Omit<MediaLibraryEntry, 'blob'>;
}) {
  return {
    ...createDuplicatePreparedAsset(args),
    assetBlob: new Blob(['asset']),
    thumbnailBlob: new Blob(['thumb']),
    webSnapshotRecord: null,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  withMediaHubWriteGuardMock.mockImplementation(async (_label, callback: () => Promise<void>) =>
    callback()
  );
  prepareProjectDomainsMock.mockResolvedValue({
    changedIds: [],
    conflictsResolved: 0,
    effectBundles: [],
    scenarioProjects: [],
    skipped: 0,
    videoProjects: [],
  });
  assertPreparedProjectBlobsAvailableMock.mockResolvedValue(undefined);
  restorePreparedProjectDomainsInTransactionMock.mockResolvedValue(0);
});

it('duplicates conflicting assets without deleting the existing record', async () => {
  const { importMediaHubBackupAssets } = await import('.');
  const { transaction, tx } = createTransactionHarness();
  const existingEntry = createMediaEntry({ kind: 'screenshot' }, { id: 'asset-1' });
  const nextEntry = createMediaEntry(
    { kind: 'project-asset', projectAssetId: 'project-asset-imported' },
    { id: 'project-asset:project-asset-imported', kind: 'image' }
  );

  prepareBackupImportAssetMock.mockResolvedValue({
    prepared: createDuplicatePreparedAsset({ existingEntry, nextEntry }),
    resolvedConflict: true,
  });
  loadBackupImportAssetBatchMock.mockResolvedValue([
    createDuplicateLoadedAsset({ existingEntry, nextEntry }),
  ]);

  await expect(
    importMediaHubBackupAssets({
      metadata: createMetadata(existingEntry),
      remapEntryForDuplicate: vi.fn(),
      strategy: 'duplicate',
      zip: {} as JSZip,
    })
  ).resolves.toEqual({
    conflictsResolved: 1,
    imported: 1,
    skipped: 0,
  });

  expect(transaction).toHaveBeenCalledWith(['media_library'], 'readwrite');
  expect(deleteExistingAssetRecordMock).not.toHaveBeenCalled();
  expect(restoreAssetRecordMock).toHaveBeenCalledWith(
    tx,
    nextEntry,
    expect.any(Blob),
    expect.any(Blob),
    null,
    null
  );
  expect(publishMediaHubLibraryChangedMock).toHaveBeenCalledWith('import', [nextEntry.id]);
});
