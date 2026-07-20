import { beforeEach, expect, it, vi } from 'vitest';

import { createMediaLibraryEntry, createProjectExportEntry } from './index.test-support.ts';
import type { ProjectExportEntry } from './contracts';

const exportMocks = vi.hoisted(() => ({
  buildProjectAssetMediaEntryMock: vi.fn(),
  buildProjectExportMediaEntryMock: vi.fn(),
  buildRecordingMediaEntryMock: vi.fn(),
  createProjectAssetMediaIdMock: vi.fn(),
  createRecordingMediaIdMock: vi.fn(),
  dbGetMock: vi.fn(),
  getRecordingMock: vi.fn(),
  initDBMock: vi.fn(),
  txDeleteMock: vi.fn(),
  txDoneMock: vi.fn(),
  txPutMock: vi.fn(),
  upsertMediaEntryMock: vi.fn(),
}));

vi.mock('../infrastructure/indexed-db/core', () => ({
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
        recordingId: entry.recordingId,
      },
    })
  );
  exportMocks.createRecordingMediaIdMock.mockImplementation((id: string) => `recording:${id}`);
});

it('commits project export and media-library replacement through one transaction', async () => {
  const { commitProjectExport } = await import('./index');
  const entry = createProjectExportEntry();

  await commitProjectExport(entry);

  expect(exportMocks.txPutMock).toHaveBeenNthCalledWith(1, entry);
  expect(exportMocks.txDeleteMock).toHaveBeenCalledWith('recording:recording-1');
  expect(exportMocks.txPutMock).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({ id: 'export:export-1' })
  );
  expect(exportMocks.upsertMediaEntryMock).not.toHaveBeenCalled();
});

it('surfaces transaction failure from project export commit without fallback writes', async () => {
  const { commitProjectExport } = await import('./index');
  exportMocks.txDoneMock.mockRejectedValueOnce(new Error('transaction failed'));

  await expect(commitProjectExport(createProjectExportEntry())).rejects.toThrow(
    'transaction failed'
  );

  expect(exportMocks.upsertMediaEntryMock).not.toHaveBeenCalled();
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
