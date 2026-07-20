import { beforeEach, expect, it, vi } from 'vitest';

const { dbGetAllMock, dbGetMock, dbPutMock, initDBMock, txGetMock, txPutMock } = vi.hoisted(() => ({
  dbGetAllMock: vi.fn(),
  dbGetMock: vi.fn(),
  dbPutMock: vi.fn(),
  initDBMock: vi.fn(),
  txGetMock: vi.fn(),
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

import { createScenarioProjectV3 } from '../../../../features/scenario/project/v3';
import type { ScenarioProjectV3 } from '@sniptale/runtime-contracts/scenario/types/v3';
import { getScenarioProjectV3, listScenarioProjectsV3, saveScenarioProjectV3 } from './project-v3';

function createProjectRecord(name: string, updatedAt: number) {
  const project = {
    ...createScenarioProjectV3(name),
    createdAt: 10,
    id: name.toLowerCase(),
    updatedAt,
  };

  return {
    createdAt: 10,
    id: project.id,
    project,
    updatedAt,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  initDBMock.mockResolvedValue({
    get: dbGetMock,
    getAll: dbGetAllMock,
    put: dbPutMock,
    transaction: vi.fn(() => ({
      done: Promise.resolve(),
      objectStore: vi.fn(() => ({
        get: txGetMock,
        put: txPutMock,
      })),
    })),
  });
  vi.spyOn(Date, 'now').mockReturnValue(12345);
});

it('stores and reads v3 scenario projects without accepting v2 records', async () => {
  const record = createProjectRecord('Demo', 12345);
  txGetMock.mockResolvedValueOnce(createProjectRecord('Demo', 10));
  dbGetMock.mockResolvedValueOnce(record).mockResolvedValueOnce({
    id: 'legacy',
    project: { version: 2, id: 'legacy', name: 'Legacy' },
  });

  await expect(saveScenarioProjectV3(record.project)).resolves.toEqual(
    expect.objectContaining({ id: 'demo', updatedAt: 12345, version: 3 })
  );

  expect(txPutMock).toHaveBeenCalledWith(
    expect.objectContaining({
      createdAt: 10,
      id: 'demo',
      project: expect.objectContaining({ updatedAt: 12345, version: 3 }),
      updatedAt: 12345,
    })
  );
  await expect(getScenarioProjectV3('demo')).resolves.toEqual(record.project);
  await expect(getScenarioProjectV3('legacy')).resolves.toBeUndefined();
});

it('creates a fresh v3 scenario project entry when no existing entry is present', async () => {
  const { createdAt: _createdAt, ...project } = createProjectRecord('Fresh', 12345).project;
  txGetMock.mockResolvedValue(undefined);

  await saveScenarioProjectV3(project as ScenarioProjectV3, { baseUpdatedAt: null });

  expect(txPutMock).toHaveBeenCalledWith(
    expect.objectContaining({
      createdAt: 12345,
      id: 'fresh',
      updatedAt: 12345,
    })
  );
  expect(txPutMock).toHaveBeenCalledTimes(1);
});

it('lists v3 scenario project summaries only', async () => {
  dbGetAllMock.mockResolvedValue([
    createProjectRecord('Demo', 120),
    {
      id: 'legacy',
      project: { version: 2, id: 'legacy', name: 'Legacy' },
      updatedAt: 200,
    },
    createProjectRecord('Newest', 300),
  ]);

  await expect(listScenarioProjectsV3()).resolves.toEqual([
    { createdAt: 10, id: 'newest', name: 'Newest', tags: [], updatedAt: 300 },
    { createdAt: 10, id: 'demo', name: 'Demo', tags: [], updatedAt: 120 },
  ]);
});

it('rejects stale v3 scenario project saves before writing', async () => {
  const record = createProjectRecord('Demo', 500);
  dbGetMock.mockResolvedValueOnce(createProjectRecord('Demo', 100));
  txGetMock.mockResolvedValueOnce(record);

  await expect(
    saveScenarioProjectV3(
      {
        ...record.project,
        name: 'Stale',
        updatedAt: 100,
      },
      { baseUpdatedAt: 100 }
    )
  ).rejects.toThrow('Scenario project demo was changed before this save completed');

  expect(dbGetMock).not.toHaveBeenCalledWith('scenario_projects', 'demo');
  expect(txGetMock).toHaveBeenCalledWith('demo');
  expect(txPutMock).not.toHaveBeenCalled();
});

it('guards v3 saves and lists against malformed stored entries', async () => {
  const project = createProjectRecord('Guarded', 12345).project;
  txGetMock.mockResolvedValueOnce({
    id: 'guarded',
    project: { id: 'guarded', version: 3 },
    createdAt: 999,
    updatedAt: 500,
  });
  dbGetAllMock.mockResolvedValue([
    { id: 'broken', project: { id: 'broken', version: 3 }, createdAt: 10, updatedAt: 200 },
    createProjectRecord('Listed', 300),
  ]);

  await expect(saveScenarioProjectV3(project, { baseUpdatedAt: null })).resolves.toEqual(
    expect.objectContaining({ id: 'guarded', version: 3 })
  );
  await expect(listScenarioProjectsV3()).resolves.toEqual([
    { createdAt: 10, id: 'listed', name: 'Listed', tags: [], updatedAt: 300 },
  ]);

  expect(txPutMock).toHaveBeenCalledWith(
    expect.objectContaining({
      createdAt: 10,
      id: 'guarded',
    })
  );
});

it('advances same-millisecond v3 writes before rejecting a stale writer', async () => {
  vi.spyOn(Date, 'now').mockReturnValue(500);
  let storedEntry = createProjectRecord('Demo', 500);
  txGetMock.mockImplementation(async () => storedEntry);
  txPutMock.mockImplementation(async (entry) => {
    storedEntry = entry;
  });

  await expect(
    saveScenarioProjectV3(
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
    saveScenarioProjectV3(
      {
        ...storedEntry.project,
        name: 'Stale second write',
        updatedAt: 500,
      },
      { baseUpdatedAt: 500 }
    )
  ).rejects.toThrow('Scenario project demo was changed before this save completed');

  expect(txPutMock).not.toHaveBeenCalled();
});
