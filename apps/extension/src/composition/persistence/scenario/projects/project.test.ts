import { beforeEach, expect, it, vi } from 'vitest';

vi.mock('../../assets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../assets')>()),
  recoverStandaloneAssetPublications: vi.fn(async () => 0),
}));

const {
  dbGetAllFromIndexMock,
  dbGetAllMock,
  dbGetMock,
  dbPutMock,
  initDBMock,
  txDeleteMock,
  txGetMock,
  txIndexGetAllMock,
  txPutMock,
} = vi.hoisted(() => ({
  dbGetAllFromIndexMock: vi.fn(),
  dbGetAllMock: vi.fn(),
  dbGetMock: vi.fn(),
  dbPutMock: vi.fn(),
  initDBMock: vi.fn(),
  txDeleteMock: vi.fn(),
  txGetMock: vi.fn(),
  txIndexGetAllMock: vi.fn(),
  txPutMock: vi.fn(),
}));

vi.mock('../../infrastructure/indexed-db/core', async () => {
  const actual = await vi.importActual<typeof import('../../infrastructure/indexed-db/core')>(
    '../../infrastructure/indexed-db/core'
  );
  return {
    ...actual,
    initDB: initDBMock,
  };
});

import {
  deleteScenarioProject,
  getScenarioProject,
  getScenarioProjectEntry,
  listScenarioProjects,
  saveScenarioProject,
} from './project';

function createProjectRecord(id: string, name: string, createdAt: number, updatedAt: number) {
  return {
    id,
    project: {
      version: 2 as const,
      id,
      name,
      createdAt,
      updatedAt,
      steps: [],
      trash: [],
      suggestedEvents: [],
      tags: [],
    },
    createdAt,
    updatedAt,
  };
}

function createScenarioAssetRecord(id: string) {
  const blob = new Blob(['asset'], { type: 'image/png' });
  return {
    id,
    projectId: 'project-1',
    galleryAssetId: null,
    blob,
    mimeType: 'image/png',
    width: 100,
    height: 50,
    createdAt: 10,
    size: blob.size,
  };
}

function createScenarioExportRecord(id: string) {
  return {
    id,
    projectId: 'project-1',
    format: 'html',
    filename: 'scenario.html',
    createdAt: 20,
    size: 1000,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  initDBMock.mockResolvedValue({
    get: dbGetMock,
    getAll: dbGetAllMock,
    getAllFromIndex: dbGetAllFromIndexMock,
    put: dbPutMock,
    transaction: vi.fn(() => ({
      done: Promise.resolve(),
      objectStore: vi.fn(() => ({
        delete: txDeleteMock,
        get: txGetMock,
        index: vi.fn(() => ({ getAll: txIndexGetAllMock })),
        put: txPutMock,
      })),
    })),
  });
  vi.spyOn(Date, 'now').mockReturnValue(12345);
});

it('stores scenario projects with refreshed timestamps and parses reads', async () => {
  txGetMock.mockResolvedValueOnce({
    id: 'project-1',
    project: { id: 'project-1', name: 'Existing', createdAt: 10, updatedAt: 10 },
    createdAt: 10,
    updatedAt: 10,
  });
  dbGetMock.mockResolvedValueOnce(createProjectRecord('project-1', 'Existing', 10, 12345));

  await expect(
    saveScenarioProject({
      version: 2,
      id: 'project-1',
      name: 'Existing',
      createdAt: 10,
      updatedAt: 10,
      steps: [],
      trash: [],
      suggestedEvents: [],
      tags: [],
    })
  ).resolves.toEqual(
    expect.objectContaining({
      id: 'project-1',
      updatedAt: 12345,
    })
  );

  expect(txPutMock).toHaveBeenCalledWith(
    expect.objectContaining({
      id: 'project-1',
      createdAt: 10,
      updatedAt: 12345,
      project: expect.objectContaining({
        updatedAt: 12345,
      }),
    })
  );
  await expect(getScenarioProject('project-1')).resolves.toEqual(
    createProjectRecord('project-1', 'Existing', 10, 12345).project
  );
});

it('lists and cascade-deletes stored scenario projects', async () => {
  dbGetAllMock.mockResolvedValue([
    createProjectRecord('project-1', 'Existing', 10, 12345),
    createProjectRecord('project-2', 'Older', 5, 20),
  ]);
  txIndexGetAllMock
    .mockResolvedValueOnce([
      createScenarioAssetRecord('asset-1'),
      { ...createScenarioAssetRecord('asset-2'), blob: 'not-a-blob' },
    ])
    .mockResolvedValueOnce([
      createScenarioExportRecord('export-1'),
      { ...createScenarioExportRecord('export-2'), format: 'pdf' },
    ])
    .mockResolvedValueOnce([{ projectId: 'project-1', stepId: 'step-1' }]);

  await expect(listScenarioProjects()).resolves.toEqual([
    {
      id: 'project-1',
      name: 'Existing',
      createdAt: 10,
      updatedAt: 12345,
      tags: [],
      lifecycle: { savedAt: 12345, storageClass: 'library', updatedAt: 12345 },
      workspaceRevision: 0,
    },
    {
      id: 'project-2',
      name: 'Older',
      createdAt: 5,
      updatedAt: 20,
      tags: [],
      lifecycle: { savedAt: 20, storageClass: 'library', updatedAt: 20 },
      workspaceRevision: 0,
    },
  ]);
  await deleteScenarioProject('project-1');

  expect(txDeleteMock).toHaveBeenNthCalledWith(1, 'project-1');
  expect(txDeleteMock).toHaveBeenNthCalledWith(2, 'asset-1');
  expect(txDeleteMock).toHaveBeenNthCalledWith(3, 'asset-2');
  expect(txDeleteMock).toHaveBeenNthCalledWith(4, 'export-1');
  expect(txDeleteMock).toHaveBeenNthCalledWith(5, 'export-2');
  expect(txDeleteMock).toHaveBeenNthCalledWith(6, 'step-1');
  expect(txDeleteMock).toHaveBeenNthCalledWith(7, ['scenario', 'project-1']);
});

it('handles missing project records and guarded fresh project timestamps', async () => {
  txGetMock.mockResolvedValueOnce(undefined);
  dbGetMock.mockResolvedValueOnce(undefined);

  await saveScenarioProject(
    {
      version: 2,
      id: 'project-new',
      name: 'Fresh',
      createdAt: 77,
      updatedAt: 77,
      steps: [],
      trash: [],
      suggestedEvents: [],
      tags: [],
    },
    { baseUpdatedAt: null }
  );

  expect(txPutMock).toHaveBeenCalledWith(
    expect.objectContaining({
      id: 'project-new',
      createdAt: 77,
      updatedAt: 12345,
    })
  );
  await expect(getScenarioProject('missing')).resolves.toBeUndefined();
});

it('returns raw scenario project entries for restore ownership checks', async () => {
  const record = createProjectRecord('project-raw', 'Raw', 10, 20);
  dbGetMock.mockResolvedValueOnce(record);

  await expect(getScenarioProjectEntry('project-raw')).resolves.toEqual({
    ...record,
    lifecycle: { savedAt: record.updatedAt, storageClass: 'library', updatedAt: record.updatedAt },
    workspaceRevision: 0,
  });
  expect(dbGetMock).toHaveBeenCalledWith('scenario_projects', 'project-raw');
});

it('uses now as createdAt fallback for fresh projects', async () => {
  txGetMock.mockResolvedValueOnce(undefined);
  const projectWithoutCreatedAt = createProjectRecord('project-now', 'Fresh now', 123, 0).project;
  Reflect.deleteProperty(projectWithoutCreatedAt, 'createdAt');

  await saveScenarioProject(projectWithoutCreatedAt);

  expect(txPutMock).toHaveBeenCalledWith(
    expect.objectContaining({
      id: 'project-now',
      createdAt: 12345,
      updatedAt: 12345,
    })
  );
  expect(txPutMock).toHaveBeenCalledTimes(1);
});

it('rejects stale scenario project saves inside the write transaction before writing', async () => {
  dbGetMock.mockResolvedValueOnce(createProjectRecord('project-1', 'Existing', 10, 100));
  txGetMock.mockResolvedValueOnce(createProjectRecord('project-1', 'Existing', 10, 500));

  await expect(
    saveScenarioProject(
      {
        version: 2,
        id: 'project-1',
        name: 'Stale',
        createdAt: 10,
        updatedAt: 100,
        steps: [],
        trash: [],
        suggestedEvents: [],
        tags: [],
      },
      { baseUpdatedAt: 100 }
    )
  ).rejects.toThrow('Scenario project project-1 was changed before this save completed');

  expect(dbGetMock).not.toHaveBeenCalledWith('scenario_projects', 'project-1');
  expect(txGetMock).toHaveBeenCalledWith('project-1');
  expect(txPutMock).not.toHaveBeenCalled();
});

it('uses the persisted workspace revision as the canonical CAS token', async () => {
  const existing = {
    ...createProjectRecord('project-1', 'Existing', 10, 100),
    workspaceRevision: 4,
  };
  txGetMock.mockResolvedValueOnce(existing);

  await expect(
    saveScenarioProject(
      {
        ...existing.project,
        name: 'Revision guarded',
      },
      { expectedRevision: 4 }
    )
  ).resolves.toEqual(expect.objectContaining({ name: 'Revision guarded' }));

  expect(txPutMock).toHaveBeenCalledWith(expect.objectContaining({ workspaceRevision: 5 }));

  txGetMock.mockResolvedValueOnce({ ...existing, workspaceRevision: 5 });
  txPutMock.mockClear();
  await expect(
    saveScenarioProject({ ...existing.project, name: 'Actually stale' }, { expectedRevision: 4 })
  ).rejects.toMatchObject({ name: 'StaleScenarioAggregateRevisionError' });
  expect(txPutMock).not.toHaveBeenCalled();
});

it('accepts an exact autosave replay without advancing the workspace revision', async () => {
  const existing = {
    ...createProjectRecord('project-1', 'Existing', 10, 100),
    workspaceRevision: 5,
  };
  txGetMock.mockResolvedValueOnce(existing);

  await expect(
    saveScenarioProject(existing.project, { expectedRevision: 4, baseUpdatedAt: 50 })
  ).resolves.toEqual(existing.project);

  expect(txPutMock).not.toHaveBeenCalled();
});

it('advances same-millisecond writes before rejecting a stale writer', async () => {
  vi.spyOn(Date, 'now').mockReturnValue(500);
  let storedEntry = createProjectRecord('project-1', 'Existing', 10, 500);
  txGetMock.mockImplementation(async () => storedEntry);
  txPutMock.mockImplementation(async (entry) => {
    storedEntry = entry;
  });

  await expect(
    saveScenarioProject(
      {
        ...storedEntry.project,
        name: 'First write',
      },
      { baseUpdatedAt: 500 }
    )
  ).resolves.toEqual(expect.objectContaining({ name: 'First write', updatedAt: 501 }));

  expect(storedEntry).toEqual(
    expect.objectContaining({
      project: expect.objectContaining({ name: 'First write', updatedAt: 501 }),
      updatedAt: 501,
    })
  );
  txPutMock.mockClear();

  await expect(
    saveScenarioProject(
      {
        ...storedEntry.project,
        name: 'Stale second write',
        updatedAt: 500,
      },
      { baseUpdatedAt: 500 }
    )
  ).rejects.toThrow('Scenario project project-1 was changed before this save completed');

  expect(txPutMock).not.toHaveBeenCalled();
});
