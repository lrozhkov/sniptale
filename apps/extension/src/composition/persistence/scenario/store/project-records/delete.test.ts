import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  deleteMediaThumbnailMock,
  deleteScenarioAssetMock,
  deleteScenarioExportMock,
  deleteScenarioProjectMock,
  deleteScenarioStepEditorDocumentRecordMock,
  listScenarioAssetsMock,
  listScenarioExportsMock,
  listScenarioStepEditorDocumentRecordsMock,
  publishMediaHubLibraryChangedMock,
} = vi.hoisted(() => ({
  deleteMediaThumbnailMock: vi.fn(),
  deleteScenarioAssetMock: vi.fn(),
  deleteScenarioExportMock: vi.fn(),
  deleteScenarioProjectMock: vi.fn(),
  deleteScenarioStepEditorDocumentRecordMock: vi.fn(),
  listScenarioAssetsMock: vi.fn(),
  listScenarioExportsMock: vi.fn(),
  listScenarioStepEditorDocumentRecordsMock: vi.fn(),
  publishMediaHubLibraryChangedMock: vi.fn(),
}));

vi.mock('../../projects', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../projects')>()),
  deleteScenarioAsset: deleteScenarioAssetMock,
  deleteScenarioExport: deleteScenarioExportMock,
  deleteScenarioProject: deleteScenarioProjectMock,
  listScenarioAssets: listScenarioAssetsMock,
  listScenarioExports: listScenarioExportsMock,
}));

vi.mock('../../../media-library/index.library.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../media-library/index.library.ts')>()),
  deleteMediaThumbnail: deleteMediaThumbnailMock,
}));

vi.mock('../step-editor-documents/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../step-editor-documents/index')>()),
  deleteScenarioStepEditorDocumentRecord: deleteScenarioStepEditorDocumentRecordMock,
  listScenarioStepEditorDocumentRecords: listScenarioStepEditorDocumentRecordsMock,
}));

vi.mock('../../../../../features/media-hub/events', () => ({
  publishMediaHubLibraryChanged: publishMediaHubLibraryChangedMock,
  publishMediaHubStorageAlert: vi.fn(),
  subscribeToMediaHubEvents: vi.fn(),
}));

import { deleteScenarioProjectRecord } from './delete';
import { createScenarioStoreProjectFixture } from '../test.helpers.ts';

beforeEach(() => {
  vi.clearAllMocks();
  listScenarioAssetsMock.mockResolvedValue([]);
  listScenarioExportsMock.mockResolvedValue([]);
  listScenarioStepEditorDocumentRecordsMock.mockResolvedValue([]);
  deleteScenarioAssetMock.mockResolvedValue(undefined);
  deleteScenarioExportMock.mockResolvedValue(undefined);
  deleteScenarioProjectMock.mockResolvedValue(undefined);
  deleteScenarioStepEditorDocumentRecordMock.mockResolvedValue(undefined);
  deleteMediaThumbnailMock.mockResolvedValue(undefined);
});

async function verifyCascadeDeletionLifecycle() {
  const project = createScenarioStoreProjectFixture();
  listScenarioAssetsMock.mockResolvedValue([{ id: 'asset-1', projectId: project.id }]);
  listScenarioExportsMock.mockResolvedValue([{ id: 'export-1', projectId: project.id }]);
  listScenarioStepEditorDocumentRecordsMock.mockResolvedValue([
    { stepId: 'step-1', projectId: project.id },
  ]);

  await deleteScenarioProjectRecord(project.id);

  expect(deleteScenarioAssetMock).toHaveBeenCalledWith('asset-1');
  expect(deleteScenarioExportMock).toHaveBeenCalledWith('export-1');
  expect(deleteMediaThumbnailMock).toHaveBeenCalledWith(`scenario:${project.id}`);
  expect(deleteMediaThumbnailMock).toHaveBeenCalledWith('scenario-export:export-1');
  expect(deleteScenarioStepEditorDocumentRecordMock).toHaveBeenCalledWith('step-1');
  expect(deleteScenarioProjectMock).toHaveBeenCalledWith(project.id);
  expect(publishMediaHubLibraryChangedMock).toHaveBeenCalledWith('delete', [
    `scenario:${project.id}`,
    'scenario-export:export-1',
  ]);
}

async function verifyEmptyCascadeDeletionLifecycle() {
  await deleteScenarioProjectRecord('project-1');

  expect(deleteScenarioAssetMock).not.toHaveBeenCalled();
  expect(deleteScenarioExportMock).not.toHaveBeenCalled();
  expect(deleteMediaThumbnailMock).toHaveBeenCalledWith('scenario:project-1');
  expect(deleteScenarioStepEditorDocumentRecordMock).not.toHaveBeenCalled();
  expect(deleteScenarioProjectMock).toHaveBeenCalledWith('project-1');
}

describe('project records delete', () => {
  it(
    'cleans up project-local artifacts before deleting the project',
    verifyCascadeDeletionLifecycle
  );
  it(
    'still deletes the project when no local artifacts are stored',
    verifyEmptyCascadeDeletionLifecycle
  );
});
