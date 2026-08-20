import type JSZip from 'jszip';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MediaLibraryEntry } from '../../../composition/persistence/media-library/contracts';
import type { MediaHubBackupMetadata } from '../contracts/types';

const {
  assertBackupImportAssetEntriesAvailableMock,
  deleteExistingAssetRecordMock,
  getImportTransactionStoreNamesMock,
  getBackupStoreMock,
  initDBMock,
  assertBackupImportWritePreflightCompleteMock,
  loadBackupImportAssetBatchMock,
  prepareProjectDomainsMock,
  prepareBackupImportAssetMock,
  publishMediaHubLibraryChangedMock,
  assertPreparedProjectBlobsAvailableMock,
  stagePreparedProjectAssetsMock,
  restorePreparedProjectDomainsInTransactionMock,
  restoreAssetRecordMock,
  restoreAssetRecordSnapshotMock,
  snapshotExistingAssetRecordMock,
  withMediaHubWriteGuardMock,
  runWithPersistenceMutationTransitionMock,
  createBackupRestoreOperationMock,
  transitionAssetOperationMock,
  recoverAssetPublicationsMock,
  deleteAssetObjectMock,
  deleteReadyJournalMock,
  releaseAssetReadyProtectionMock,
} = vi.hoisted(() => ({
  assertBackupImportAssetEntriesAvailableMock: vi.fn(),
  deleteExistingAssetRecordMock: vi.fn(),
  getImportTransactionStoreNamesMock: vi.fn(),
  getBackupStoreMock: vi.fn(),
  initDBMock: vi.fn(),
  assertBackupImportWritePreflightCompleteMock: vi.fn(),
  loadBackupImportAssetBatchMock: vi.fn(),
  prepareProjectDomainsMock: vi.fn(),
  prepareBackupImportAssetMock: vi.fn(),
  publishMediaHubLibraryChangedMock: vi.fn(),
  assertPreparedProjectBlobsAvailableMock: vi.fn(),
  stagePreparedProjectAssetsMock: vi.fn(),
  restorePreparedProjectDomainsInTransactionMock: vi.fn(),
  restoreAssetRecordMock: vi.fn(),
  restoreAssetRecordSnapshotMock: vi.fn(),
  snapshotExistingAssetRecordMock: vi.fn(),
  withMediaHubWriteGuardMock: vi.fn(),
  runWithPersistenceMutationTransitionMock: vi.fn(),
  createBackupRestoreOperationMock: vi.fn(),
  transitionAssetOperationMock: vi.fn(),
  recoverAssetPublicationsMock: vi.fn(),
  deleteAssetObjectMock: vi.fn(),
  deleteReadyJournalMock: vi.fn(),
  releaseAssetReadyProtectionMock: vi.fn(),
}));

vi.mock('../../../composition/persistence/assets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/assets')>()),
  deleteAssetObject: deleteAssetObjectMock,
  deleteReadyJournal: deleteReadyJournalMock,
  releaseAssetReadyProtection: releaseAssetReadyProtectionMock,
}));

vi.mock('../../../composition/persistence/assets/operations', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/assets/operations')>()),
  createBackupRestoreOperation: createBackupRestoreOperationMock,
  transitionAssetOperation: transitionAssetOperationMock,
}));

vi.mock('../storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../storage')>()),
  getStore: getBackupStoreMock,
}));

vi.mock('../../../composition/persistence/asset-publication-recovery', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../composition/persistence/asset-publication-recovery')
  >()),
  recoverAssetPublications: recoverAssetPublicationsMock,
}));

vi.mock(
  '../../../composition/persistence/infrastructure/mutation-barrier',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../../composition/persistence/infrastructure/mutation-barrier')
    >()),
    runWithPersistenceMutationTransition: runWithPersistenceMutationTransitionMock,
  })
);

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
  assertPreparedScenarioAssetBlobSafe: vi.fn(),
  stagePreparedProjectAssets: stagePreparedProjectAssetsMock,
}));

vi.mock('./projects', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./projects')>()),
  isEmptyProjectDomainPlan: (prepared: { scenarioProjects: unknown[]; videoProjects: unknown[] }) =>
    prepared.videoProjects.length === 0 && prepared.scenarioProjects.length === 0,
  commitPreparedProjectDomains: restorePreparedProjectDomainsInTransactionMock,
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
  runWithPersistenceMutationTransitionMock.mockImplementation(
    async (callback: () => Promise<void>) => callback()
  );
  createBackupRestoreOperationMock.mockResolvedValue({
    compensations: [],
    createdAt: 1,
    kind: 'backup-restore',
    obsoleteAssetIds: [],
    operationId: 'restore-1',
    status: 'pending',
    updatedAt: 1,
  });
  transitionAssetOperationMock.mockResolvedValue(undefined);
  recoverAssetPublicationsMock.mockResolvedValue(0);
  deleteAssetObjectMock.mockResolvedValue(undefined);
  deleteReadyJournalMock.mockResolvedValue(undefined);
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
  getBackupStoreMock.mockReturnValue({
    get: vi.fn().mockResolvedValue({
      compensations: [],
      createdAt: 1,
      kind: 'backup-restore',
      obsoleteAssetIds: [],
      operationId: 'restore-1',
      status: 'pending',
      updatedAt: 1,
    }),
    put: vi.fn(),
  });
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
  it('commits a standalone durable recording under its restore operation', async () => {
    const { importMediaHubBackupAssets } = await import('.');
    createTransactionHarness();
    const entry = createMediaEntry(
      { kind: 'recording', recordingId: 'recording-1' },
      { id: 'recording-1', kind: 'recording', mimeType: 'video/webm' }
    );
    prepareBackupImportAssetMock.mockResolvedValue({
      prepared: {
        assetPath: 'recordings/recording-1',
        existingEntry: null,
        nextEntry: entry,
        preparedAssetPublication: {
          asset: {
            ref: {
              assetId: 'opfs-recording-1',
              createdAt: 1,
              location: { kind: 'opfs', objectKey: 'objects/opfs-recording-1' },
              mimeType: 'video/webm',
              sha256: null,
              size: 5,
            },
          },
          journalId: 'recording-journal',
        },
        recordingTelemetry: null,
        thumbnailPath: null,
        webSnapshotPackage: null,
      },
      resolvedConflict: false,
    });

    await expect(
      importMediaHubBackupAssets({
        metadata: createMetadata(entry),
        remapEntryForDuplicate: vi.fn(),
        strategy: 'replace',
        zip: {} as JSZip,
      })
    ).resolves.toEqual({ conflictsResolved: 0, imported: 1, skipped: 0 });

    expect(createBackupRestoreOperationMock).toHaveBeenCalledOnce();
    expect(transitionAssetOperationMock).toHaveBeenCalledWith('restore-1', 'pending', 'committed');
    expect(deleteReadyJournalMock).toHaveBeenCalledWith('recording-journal');
    expect(releaseAssetReadyProtectionMock).toHaveBeenCalledWith(['opfs-recording-1']);
  });

  it('adds prepared v2 project bundle counters to the import result and change event', async () => {
    let transitionActive = false;
    runWithPersistenceMutationTransitionMock.mockImplementation(
      async (callback: () => Promise<void>) => {
        transitionActive = true;
        try {
          return await callback();
        } finally {
          transitionActive = false;
        }
      }
    );
    const { importMediaHubBackupAssets } = await import('.');
    createTransactionHarness();
    const preparedProjectDomains = {
      changedIds: ['video-project:project-copy'],
      conflictsResolved: 1,
      scenarioProjects: [
        {
          descriptor: { assets: [{}] },
          restoredScenarioAssets: new Map([
            [
              'scenario-asset',
              {
                asset: {
                  ref: {
                    assetId: 'opfs-scenario-asset',
                    createdAt: 1,
                    location: { kind: 'opfs', objectKey: 'objects/opfs-scenario-asset' },
                    mimeType: 'image/png',
                    sha256: null,
                    size: 5,
                  },
                },
                journalId: 'scenario-journal',
              },
            ],
          ]),
        },
        {
          descriptor: { assets: [] },
        },
      ],
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
    restorePreparedProjectDomainsInTransactionMock.mockImplementation(async () => {
      expect(transitionActive).toBe(true);
      return 1;
    });

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

    expect(restorePreparedProjectDomainsInTransactionMock).toHaveBeenCalledWith({
      operationId: 'restore-1',
      prepared: preparedProjectDomains,
    });
    expect(createBackupRestoreOperationMock).toHaveBeenCalledOnce();
    expect(runWithPersistenceMutationTransitionMock).toHaveBeenCalledOnce();
    expect(publishMediaHubLibraryChangedMock).toHaveBeenCalledWith('import', [
      'video-project:project-copy',
    ]);
    expect(deleteReadyJournalMock).toHaveBeenCalledWith('scenario-journal');
    expect(releaseAssetReadyProtectionMock).toHaveBeenCalledWith(['opfs-scenario-asset']);
    expect(deleteAssetObjectMock).not.toHaveBeenCalledWith('opfs-scenario-asset');
  });

  it('aborts before recovery when project-export staging fails', async () => {
    prepareProjectDomainsMock.mockResolvedValue({
      changedIds: [],
      conflictsResolved: 0,
      effectBundles: [],
      scenarioProjects: [],
      skipped: 0,
      videoProjects: [
        {
          descriptor: { projectAssets: [], projectExports: [{}] },
          idChanged: false,
          projectAssetIdMap: new Map<string, string>(),
          projectExportIdMap: new Map<string, string>(),
          projectId: 'project-1',
          recordingIdMap: new Map<string, string>(),
        },
      ],
    });
    stagePreparedProjectAssetsMock.mockRejectedValueOnce(
      new Error('second project export staging failed')
    );
    recoverAssetPublicationsMock
      .mockResolvedValueOnce(0)
      .mockRejectedValueOnce(new Error('operation recovery failed'));

    const { importMediaHubBackupAssets } = await import('.');
    await expect(
      importMediaHubBackupAssets({
        metadata: { assets: [], effectBundles: [] },
        remapEntryForDuplicate: vi.fn(),
        strategy: 'replace',
        zip: {} as JSZip,
      })
    ).rejects.toMatchObject({
      errors: [
        expect.objectContaining({ message: 'second project export staging failed' }),
        expect.objectContaining({ message: 'operation recovery failed' }),
      ],
    });

    expect(transitionAssetOperationMock).toHaveBeenCalledWith('restore-1', 'pending', 'aborted');
    expect(recoverAssetPublicationsMock).toHaveBeenCalledTimes(2);
    expect(transitionAssetOperationMock.mock.invocationCallOrder[0]).toBeLessThan(
      recoverAssetPublicationsMock.mock.invocationCallOrder[1] ?? 0
    );
    expect(restorePreparedProjectDomainsInTransactionMock).not.toHaveBeenCalled();
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
      null,
      null,
      null,
      undefined
    );
    expect(publishMediaHubLibraryChangedMock).toHaveBeenCalledWith('import', [entry.id]);
  });
});
