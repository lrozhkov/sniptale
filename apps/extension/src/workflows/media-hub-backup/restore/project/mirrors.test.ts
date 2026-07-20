import type JSZip from 'jszip';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MediaLibraryEntry } from '../../../../composition/persistence/media-library/contracts';
import type { RecordingEntry } from '../../../../composition/persistence/recordings/contracts';
import {
  createProjectExportEntry,
  createVideoProjectEntry,
} from '../../../../composition/persistence/projects/index.test-support.ts';

const {
  assertBackupImportAssetEntriesAvailableMock,
  loadBackupImportAssetBatchMock,
  prepareBackupImportAssetMock,
  prepareProjectDomainsMock,
  restorePreparedProjectDomainsInTransactionMock,
  withMediaHubWriteGuardMock,
} = vi.hoisted(() => ({
  assertBackupImportAssetEntriesAvailableMock: vi.fn(),
  loadBackupImportAssetBatchMock: vi.fn(),
  prepareBackupImportAssetMock: vi.fn(),
  prepareProjectDomainsMock: vi.fn(),
  restorePreparedProjectDomainsInTransactionMock: vi.fn(),
  withMediaHubWriteGuardMock: vi.fn(),
}));

vi.mock(
  '../../../../composition/persistence/infrastructure/indexed-db/core',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../../../composition/persistence/infrastructure/indexed-db/core')
    >()),
    initDB: vi.fn(),
  })
);

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal()),
  translate: (key: string) => key,
}));

vi.mock('../../../../features/media-hub/events', async (importOriginal) => ({
  ...(await importOriginal()),
  publishMediaHubLibraryChanged: vi.fn(),
}));

vi.mock('../../../../features/media-hub/storage-errors', () => ({
  createMediaHubStorageHeadroomError: vi.fn(),
  withMediaHubWriteGuard: withMediaHubWriteGuardMock,
}));

vi.mock('../prepare', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../prepare')>()),
  assertBackupImportAssetEntriesAvailable: assertBackupImportAssetEntriesAvailableMock,
  loadBackupImportAssetBatch: loadBackupImportAssetBatchMock,
  prepareBackupImportAsset: prepareBackupImportAssetMock,
}));

vi.mock('./prepare', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./prepare')>()),
  prepareProjectDomains: prepareProjectDomainsMock,
}));

vi.mock('../projects', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../projects')>()),
  isEmptyProjectDomainPlan: (prepared: { scenarioProjects: unknown[]; videoProjects: unknown[] }) =>
    prepared.videoProjects.length === 0 && prepared.scenarioProjects.length === 0,
  restorePreparedProjectDomainsInTransaction: restorePreparedProjectDomainsInTransactionMock,
}));

vi.mock('../write', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../write')>()),
  assertBackupImportWritePreflightComplete: vi.fn(),
  deleteExistingAssetRecord: vi.fn(),
  getImportTransactionStoreNames: vi.fn(),
  restoreAssetRecordSnapshot: vi.fn(),
  restoreAssetRecord: vi.fn(),
  snapshotExistingAssetRecord: vi.fn(),
}));

function createProjectExportMirror(): Omit<MediaLibraryEntry, 'blob'> {
  return {
    createdAt: 1,
    duration: 1,
    filename: 'export.webm',
    height: 720,
    id: 'export:export-1',
    kind: 'export',
    mimeType: 'video/webm',
    originalFilename: 'export.webm',
    size: 10,
    source: {
      exportId: 'export-1',
      kind: 'project-export',
      projectId: 'project-1',
      recordingId: 'recording-1',
    },
    sourceFavicon: null,
    sourceTitle: null,
    sourceUrl: null,
    tags: [],
    updatedAt: 1,
    width: 1280,
  };
}

function createProjectMirrorBackupMetadata() {
  const recordingEntry = {
    createdAt: 1,
    filename: 'recording.webm',
    id: 'recording-1',
    size: 10,
  } satisfies Omit<RecordingEntry, 'blob'>;

  return {
    assets: [
      {
        assetPath: 'assets/export-1',
        entry: createProjectExportMirror(),
        thumbnailPath: null,
      },
    ],
    effectBundles: [],
    videoProjects: [
      {
        entry: createVideoProjectEntry(),
        projectAssets: [],
        projectExports: [
          {
            entry: createProjectExportEntry(),
            recording: { blobPath: 'recording', entry: recordingEntry },
          },
        ],
      },
    ],
  };
}

describe('media hub backup restore v2 media mirror filtering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    withMediaHubWriteGuardMock.mockImplementation(
      async (_label: string, callback: () => Promise<void>) => callback()
    );
    prepareProjectDomainsMock.mockResolvedValue({
      changedIds: [],
      conflictsResolved: 0,
      effectBundles: [],
      scenarioProjects: [],
      skipped: 0,
      videoProjects: [],
    });
    restorePreparedProjectDomainsInTransactionMock.mockResolvedValue(0);
  });

  it('does not restore v2 project-owned media mirrors as standalone assets', async () => {
    const { importMediaHubBackupAssets } = await import('..');

    await expect(
      importMediaHubBackupAssets({
        metadata: createProjectMirrorBackupMetadata(),
        remapEntryForDuplicate: vi.fn(),
        strategy: 'duplicate',
        zip: {} as JSZip,
      })
    ).resolves.toEqual({ conflictsResolved: 0, imported: 0, skipped: 0 });

    expect(prepareBackupImportAssetMock).not.toHaveBeenCalled();
  });
});
