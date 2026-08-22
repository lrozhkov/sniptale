import { beforeEach, expect, it, vi } from 'vitest';

import { createMediaLibraryEntry, createProjectExportEntry } from './index.test-support.ts';
import type { ProjectExportEntry } from './contracts';

const exportMocks = vi.hoisted(() => ({
  assertAssetWriteAdmissionMock: vi.fn(),
  buildProjectAssetMediaEntryMock: vi.fn(),
  buildProjectExportMediaEntryMock: vi.fn(),
  buildRecordingMediaEntryMock: vi.fn(),
  createProjectAssetMediaIdMock: vi.fn(),
  createRecordingMediaIdMock: vi.fn(),
  dbGetMock: vi.fn(),
  getRecordingMock: vi.fn(),
  initDBMock: vi.fn(),
  txDeleteMock: vi.fn(),
  txCountMock: vi.fn(),
  txDoneMock: vi.fn(),
  txPutMock: vi.fn(),
  upsertMediaEntryMock: vi.fn(),
  writeBlobToAssetMock: vi.fn(),
  createAssetPublicationJournalMock: vi.fn(),
  publishReadyJournalWithRetryMock: vi.fn(),
  recoverProjectMediaPublicationsMock: vi.fn(),
  discardPreparedAssetMock: vi.fn(),
  readAssetFileMock: vi.fn(),
  releaseAssetReadyProtectionMock: vi.fn(),
}));

vi.mock('../assets', async (importOriginal) => ({
  ...(await importOriginal()),
  assertAssetWriteAdmission: exportMocks.assertAssetWriteAdmissionMock,
  createAssetPublicationJournal: exportMocks.createAssetPublicationJournalMock,
  discardPreparedAsset: exportMocks.discardPreparedAssetMock,
  publishReadyJournalWithRetry: exportMocks.publishReadyJournalWithRetryMock,
  readAssetFile: exportMocks.readAssetFileMock,
  releaseAssetReadyProtection: exportMocks.releaseAssetReadyProtectionMock,
  writeBlobToAsset: exportMocks.writeBlobToAssetMock,
}));

vi.mock('./asset-publication', async (importOriginal) => ({
  ...(await importOriginal()),
  recoverProjectMediaPublications: exportMocks.recoverProjectMediaPublicationsMock,
}));

vi.mock('../infrastructure/indexed-db/core', async (importOriginal) => ({
  ...(await importOriginal()),
  MEDIA_LIBRARY_STORE: 'media_library',
  PROJECT_ASSETS_STORE: 'project_assets',
  PROJECT_EXPORTS_STORE: 'project_exports',
  VIDEO_PROJECTS_STORE: 'video_projects',
  initDB: exportMocks.initDBMock,
}));

vi.mock('../media-library/entry-mapping', async (importOriginal) => ({
  ...(await importOriginal()),
  buildProjectAssetMediaEntry: exportMocks.buildProjectAssetMediaEntryMock,
  buildProjectExportMediaEntry: exportMocks.buildProjectExportMediaEntryMock,
  buildRecordingMediaEntry: exportMocks.buildRecordingMediaEntryMock,
  createProjectAssetMediaId: exportMocks.createProjectAssetMediaIdMock,
  createRecordingMediaId: exportMocks.createRecordingMediaIdMock,
}));

vi.mock('../media-library/store', () => ({
  upsertMediaEntry: exportMocks.upsertMediaEntryMock,
}));

vi.mock('../recordings/index', async (importOriginal) => ({
  ...(await importOriginal()),
  getRecording: exportMocks.getRecordingMock,
}));

beforeEach(() => {
  vi.clearAllMocks();
  exportMocks.txDoneMock.mockResolvedValue(undefined);
  exportMocks.initDBMock.mockResolvedValue({
    get: exportMocks.dbGetMock,
    transaction: vi.fn(() => ({
      done: exportMocks.txDoneMock(),
      objectStore: vi.fn(() => ({
        delete: exportMocks.txDeleteMock,
        get: exportMocks.dbGetMock,
        index: vi.fn(() => ({ count: exportMocks.txCountMock })),
        put: exportMocks.txPutMock,
      })),
    })),
  });
  exportMocks.buildProjectExportMediaEntryMock.mockImplementation((entry: ProjectExportEntry) =>
    createMediaLibraryEntry({
      filename: entry.filename,
      id: `export:${entry.id}`,
      kind: 'export',
      source: {
        kind: 'project-export',
        exportId: entry.id,
        projectId: entry.projectId,
      },
    })
  );
  exportMocks.createRecordingMediaIdMock.mockImplementation((id: string) => `recording:${id}`);
});

it('prepares and publishes a project export without a recording alias', async () => {
  const { commitProjectExport } = await import('./index');
  const entry = createProjectExportEntry();
  const blob = new Blob(['video'], { type: 'video/mp4' });

  await commitProjectExport({ ...entry, blob });

  expect(exportMocks.assertAssetWriteAdmissionMock).toHaveBeenCalledWith(blob.size);
  expect(exportMocks.createAssetPublicationJournalMock).toHaveBeenCalledWith(
    expect.objectContaining({
      assetRefs: [expect.objectContaining({ assetId: 'asset-export-1' })],
      payload: {
        entry: expect.objectContaining({
          assetId: 'asset-export-1',
          id: 'export-1',
          projectId: 'project-1',
        }),
      },
    })
  );
  expect(exportMocks.publishReadyJournalWithRetryMock).toHaveBeenCalledOnce();
  expect(exportMocks.upsertMediaEntryMock).not.toHaveBeenCalled();
});

it('surfaces transaction failure from project export commit without fallback writes', async () => {
  const { commitProjectExport } = await import('./index');
  exportMocks.publishReadyJournalWithRetryMock.mockRejectedValueOnce(
    new Error('transaction failed')
  );

  await expect(
    commitProjectExport({
      ...createProjectExportEntry(),
      blob: new Blob(['video'], { type: 'video/mp4' }),
    })
  ).rejects.toThrow('transaction failed');

  expect(exportMocks.upsertMediaEntryMock).not.toHaveBeenCalled();
});

it('rejects missing or ambiguous export binary sources before publication', async () => {
  const { commitProjectExport } = await import('./index');
  const entry = createProjectExportEntry();
  const preparedAsset = {
    ref: {
      assetId: 'prepared-1',
      createdAt: 1,
      location: { kind: 'opfs' as const, objectKey: 'objects/prepared-1' },
      mimeType: 'video/mp4',
      sha256: null,
      size: 5,
    },
  };

  await expect(commitProjectExport(entry)).rejects.toThrow(
    'Project export must provide exactly one binary source.'
  );
  await expect(
    commitProjectExport({ ...entry, blob: new Blob(['video']), preparedAsset })
  ).rejects.toThrow('Project export must provide exactly one binary source.');
  expect(exportMocks.recoverProjectMediaPublicationsMock).not.toHaveBeenCalled();
});

it('publishes a prepared export without blob admission and preserves an absent format', async () => {
  const { commitProjectExport } = await import('./index');
  const { format: _format, ...entry } = createProjectExportEntry();
  const preparedAsset = {
    ref: {
      assetId: 'asset-prepared',
      createdAt: 1,
      location: { kind: 'opfs' as const, objectKey: 'objects/asset-prepared' },
      mimeType: 'video/mp4',
      sha256: null,
      size: 5,
    },
  };

  await commitProjectExport({ ...entry, preparedAsset });

  expect(exportMocks.assertAssetWriteAdmissionMock).not.toHaveBeenCalled();
  expect(exportMocks.writeBlobToAssetMock).not.toHaveBeenCalled();
  expect(exportMocks.createAssetPublicationJournalMock).toHaveBeenCalledWith(
    expect.objectContaining({
      payload: { entry: expect.not.objectContaining({ format: expect.anything() }) },
    })
  );
  expect(exportMocks.releaseAssetReadyProtectionMock).not.toHaveBeenCalled();
});

it('discards a newly written object when journal creation fails', async () => {
  const { commitProjectExport } = await import('./index');
  exportMocks.createAssetPublicationJournalMock.mockRejectedValueOnce(
    new Error('journal creation failed')
  );

  await expect(
    commitProjectExport({
      ...createProjectExportEntry(),
      blob: new Blob(['video'], { type: 'video/mp4' }),
    })
  ).rejects.toThrow('journal creation failed');

  expect(exportMocks.discardPreparedAssetMock).toHaveBeenCalledWith('asset-export-1');
});

it('fails closed when export metadata, ref, or OPFS object is unavailable', async () => {
  const { getProjectExport } = await import('./index');
  const entry = createProjectExportEntry();
  exportMocks.dbGetMock
    .mockResolvedValueOnce(undefined)
    .mockResolvedValueOnce(entry)
    .mockResolvedValueOnce(undefined)
    .mockResolvedValueOnce(entry)
    .mockResolvedValueOnce({
      assetId: entry.assetId,
      createdAt: 1,
      location: { kind: 'opfs', objectKey: `objects/${entry.assetId}` },
      mimeType: 'video/mp4',
      sha256: null,
      size: entry.size,
    });
  exportMocks.readAssetFileMock.mockRejectedValueOnce(new Error('object missing'));

  await expect(getProjectExport('missing')).resolves.toBeUndefined();
  await expect(getProjectExport(entry.id)).resolves.toBeUndefined();
  await expect(getProjectExport(entry.id)).resolves.toBeUndefined();
});

it('deletes export mirrors even when the source export or recording is already absent', async () => {
  const { deleteProjectExport } = await import('./index');
  exportMocks.dbGetMock.mockResolvedValueOnce(undefined);
  exportMocks.getRecordingMock.mockResolvedValueOnce(undefined);

  await deleteProjectExport('missing-export');

  expect(exportMocks.txDeleteMock).toHaveBeenNthCalledWith(1, 'missing-export');
  expect(exportMocks.txDeleteMock).toHaveBeenNthCalledWith(2, 'export:missing-export');
  expect(exportMocks.txPutMock).not.toHaveBeenCalled();
});

it('does not delete an export while a committed ready journal cannot be drained', async () => {
  const { deleteProjectExport } = await import('./index');
  exportMocks.recoverProjectMediaPublicationsMock.mockRejectedValueOnce(
    new Error('ready journal replay failed')
  );

  await expect(deleteProjectExport('export-1')).rejects.toThrow('ready journal replay failed');

  expect(exportMocks.txDeleteMock).not.toHaveBeenCalled();
});
exportMocks.assertAssetWriteAdmissionMock.mockResolvedValue(undefined);
exportMocks.recoverProjectMediaPublicationsMock.mockResolvedValue(undefined);
exportMocks.writeBlobToAssetMock.mockResolvedValue({
  ref: {
    assetId: 'asset-export-1',
    createdAt: 1,
    location: { kind: 'opfs', objectKey: 'objects/asset-export-1' },
    mimeType: 'video/mp4',
    sha256: null,
    size: 5,
  },
});
exportMocks.createAssetPublicationJournalMock.mockResolvedValue({ journalId: 'journal-1' });
exportMocks.publishReadyJournalWithRetryMock.mockResolvedValue(undefined);
exportMocks.discardPreparedAssetMock.mockResolvedValue(undefined);
exportMocks.txCountMock.mockResolvedValue(0);
