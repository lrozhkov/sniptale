import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  deleteMediaThumbnailMock,
  deleteScenarioProjectMock,
  listScenarioExportsMock,
  publishMediaHubLibraryChangedMock,
} = vi.hoisted(() => ({
  deleteMediaThumbnailMock: vi.fn(),
  deleteScenarioProjectMock: vi.fn(),
  listScenarioExportsMock: vi.fn(),
  publishMediaHubLibraryChangedMock: vi.fn(),
}));

vi.mock('../../projects', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../projects')>()),
  deleteScenarioProject: deleteScenarioProjectMock,
  listScenarioExports: listScenarioExportsMock,
}));

vi.mock('../../../media-library/index.library.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../media-library/index.library.ts')>()),
  deleteMediaThumbnail: deleteMediaThumbnailMock,
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
  listScenarioExportsMock.mockResolvedValue([]);
  deleteScenarioProjectMock.mockResolvedValue(undefined);
  deleteMediaThumbnailMock.mockResolvedValue(undefined);
});

async function verifyCascadeDeletionLifecycle() {
  const project = createScenarioStoreProjectFixture();
  listScenarioExportsMock.mockResolvedValue([{ id: 'export-1', projectId: project.id }]);

  await deleteScenarioProjectRecord(project.id);

  expect(deleteMediaThumbnailMock).toHaveBeenCalledWith(`scenario:${project.id}`);
  expect(deleteMediaThumbnailMock).toHaveBeenCalledWith('scenario-export:export-1');
  expect(deleteScenarioProjectMock).toHaveBeenCalledWith(project.id);
  expect(publishMediaHubLibraryChangedMock).toHaveBeenCalledWith('delete', [
    `scenario:${project.id}`,
    'scenario-export:export-1',
  ]);
}

async function verifyEmptyCascadeDeletionLifecycle() {
  await deleteScenarioProjectRecord('project-1');

  expect(deleteMediaThumbnailMock).toHaveBeenCalledWith('scenario:project-1');
  expect(deleteScenarioProjectMock).toHaveBeenCalledWith('project-1');
}

describe('project records delete', () => {
  it(
    'delegates authoritative graph deletion before cleaning derived thumbnails',
    verifyCascadeDeletionLifecycle
  );
  it(
    'still deletes the project when no local artifacts are stored',
    verifyEmptyCascadeDeletionLifecycle
  );
});
