import type JSZip from 'jszip';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
  loadBackupImportAssetBatchMock.mockImplementation(async ({ preparedAssets }) =>
    preparedAssets.map((prepared: { nextEntry: Omit<MediaLibraryEntry, 'blob'> }) => ({
      ...prepared,
      assetBlob: new Blob(['asset']),
      thumbnailBlob: null,
      webSnapshotRecord: null,
    }))
  );
  restorePreparedProjectDomainsInTransactionMock.mockResolvedValue(0);
  snapshotExistingAssetRecordMock.mockResolvedValue({ mediaLibraryEntry: { id: 'existing' } });
});

describe('media hub backup restore skip orchestration', () => {
  it('skips database writes and publishes nothing when every asset is skipped', async () => {
    const { importMediaHubBackupAssets } = await import('.');

    prepareBackupImportAssetMock.mockResolvedValue({
      prepared: null,
      resolvedConflict: false,
    });

    await expect(
      importMediaHubBackupAssets({
        metadata: createMetadata(createMediaEntry({ kind: 'screenshot' })),
        remapEntryForDuplicate: vi.fn(),
        strategy: 'skip',
        zip: {} as JSZip,
      })
    ).resolves.toEqual({
      conflictsResolved: 0,
      imported: 0,
      skipped: 1,
    });

    expect(initDBMock).not.toHaveBeenCalled();
    expect(restoreAssetRecordMock).not.toHaveBeenCalled();
    expect(publishMediaHubLibraryChangedMock).not.toHaveBeenCalled();
  });
});

describe('media hub backup restore project-domain orchestration', () => {
  it('adds prepared v2 project bundle counters to the import result and change event', async () => {
    const { importMediaHubBackupAssets } = await import('.');
    const { tx } = createTransactionHarness();
    const preparedProjectDomains = {
      changedIds: ['video-project:project-copy'],
      conflictsResolved: 1,
      scenarioProjects: [],
      skipped: 0,
      videoProjects: [
        {
          descriptor: { projectAssets: [], projectExports: [] },
          idChanged: false,
          projectAssetIdMap: new Map<string, string>(),
          projectExportIdMap: new Map<string, string>(),
          projectId: 'project-copy',
          recordingIdMap: new Map<string, string>(),
        },
      ],
    };
    prepareBackupImportAssetMock.mockResolvedValue({ prepared: null, resolvedConflict: false });
    prepareProjectDomainsMock.mockResolvedValue(preparedProjectDomains);
    restorePreparedProjectDomainsInTransactionMock.mockResolvedValue(1);

    await expect(
      importMediaHubBackupAssets({
        metadata: createMetadata(createMediaEntry({ kind: 'screenshot' })),
        remapEntryForDuplicate: vi.fn(),
        strategy: 'duplicate',
        zip: {} as JSZip,
      })
    ).resolves.toEqual({
      conflictsResolved: 1,
      imported: 1,
      skipped: 1,
    });

    expect(restorePreparedProjectDomainsInTransactionMock).toHaveBeenCalledWith(
      preparedProjectDomains,
      tx
    );
    expect(publishMediaHubLibraryChangedMock).toHaveBeenCalledWith('import', [
      'video-project:project-copy',
    ]);
  });
});

describe('media hub backup restore replace orchestration', () => {
  it('replaces conflicting assets through transaction and publish orchestration', async () => {
    const { importMediaHubBackupAssets } = await import('.');
    const { transaction, tx } = createTransactionHarness();
    const entry = createMediaEntry({ kind: 'screenshot' });

    prepareBackupImportAssetMock.mockResolvedValue({
      prepared: {
        assetPath: 'assets/asset-1',
        existingEntry: entry,
        nextEntry: entry,
        recordingTelemetry: null,
        thumbnailPath: null,
        webSnapshotPackage: null,
      },
      resolvedConflict: true,
    });

    await expect(
      importMediaHubBackupAssets({
        metadata: createMetadata(entry),
        remapEntryForDuplicate: vi.fn(),
        strategy: 'replace',
        zip: {} as JSZip,
      })
    ).resolves.toEqual({
      conflictsResolved: 1,
      imported: 1,
      skipped: 0,
    });

    expect(transaction).toHaveBeenCalledWith(['media_library'], 'readwrite');
    expect(deleteExistingAssetRecordMock).toHaveBeenCalledWith(tx, entry);
    expect(restoreAssetRecordMock).toHaveBeenCalledWith(
      tx,
      entry,
      expect.any(Blob),
      null,
      null,
      null
    );
    expect(publishMediaHubLibraryChangedMock).toHaveBeenCalledWith('import', [entry.id]);
  });
});
