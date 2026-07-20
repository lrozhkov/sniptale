import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  listScenarioExportsMock,
  publishMediaHubLibraryChangedMock,
  randomUuidMock,
  saveScenarioExportMock,
} = vi.hoisted(() => ({
  listScenarioExportsMock: vi.fn(),
  publishMediaHubLibraryChangedMock: vi.fn(),
  randomUuidMock: vi.fn(),
  saveScenarioExportMock: vi.fn(),
}));

vi.mock('../../projects', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../projects')>()),
  listScenarioExports: listScenarioExportsMock,
  saveScenarioExport: saveScenarioExportMock,
}));

vi.mock('../../../../../features/media-hub/events', () => ({
  publishMediaHubLibraryChanged: publishMediaHubLibraryChangedMock,
  publishMediaHubStorageAlert: vi.fn(),
  subscribeToMediaHubEvents: vi.fn(),
}));

import { listScenarioExportRecords, saveScenarioExportRecord } from './exports';

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(Date, 'now').mockReturnValue(1000);
  vi.stubGlobal('crypto', { randomUUID: randomUuidMock });
  randomUuidMock.mockReturnValue('export-1');
  listScenarioExportsMock.mockResolvedValue([]);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('scenario project export records', () => {
  it('saves export metadata and publishes a gallery catalog event', async () => {
    await expect(
      saveScenarioExportRecord({
        filename: 'scenario.html',
        format: 'html',
        projectId: 'project-1',
        size: 123,
      })
    ).resolves.toMatchObject({ id: 'export-1', projectId: 'project-1' });

    expect(saveScenarioExportMock).toHaveBeenCalledWith({
      createdAt: 1000,
      filename: 'scenario.html',
      format: 'html',
      id: 'export-1',
      projectId: 'project-1',
      size: 123,
    });
    expect(publishMediaHubLibraryChangedMock).toHaveBeenCalledWith('create', [
      'scenario-export:export-1',
    ]);
  });

  it('lists export metadata newest first', async () => {
    listScenarioExportsMock.mockResolvedValue([
      { createdAt: 1, filename: 'old.md', format: 'markdown', id: 'old', projectId: 'project-1' },
      { createdAt: 2, filename: 'new.html', format: 'html', id: 'new', projectId: 'project-1' },
    ]);

    await expect(listScenarioExportRecords('project-1')).resolves.toEqual([
      expect.objectContaining({ id: 'new' }),
      expect.objectContaining({ id: 'old' }),
    ]);
  });
});
