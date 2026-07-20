import { beforeEach, expect, it, vi } from 'vitest';

const { dbDeleteMock, dbGetAllFromIndexMock, dbPutMock, initDBMock } = vi.hoisted(() => ({
  dbDeleteMock: vi.fn(),
  dbGetAllFromIndexMock: vi.fn(),
  dbPutMock: vi.fn(),
  initDBMock: vi.fn(),
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

import { deleteScenarioExport, listScenarioExports, saveScenarioExport } from './exports';
import { type ScenarioExportEntry } from '@sniptale/runtime-contracts/scenario/types/session';

function createExportRecord(): ScenarioExportEntry {
  return {
    id: 'export-1',
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
    delete: dbDeleteMock,
    getAllFromIndex: dbGetAllFromIndexMock,
    put: dbPutMock,
  });
});

it('stores and deletes scenario export audit entries', async () => {
  const exportRecord = createExportRecord();
  dbGetAllFromIndexMock.mockResolvedValueOnce([
    exportRecord,
    { ...exportRecord, id: 'export-2', format: 'pdf' },
    { ...exportRecord, id: 'export-3', size: Number.NaN },
  ]);

  await saveScenarioExport(exportRecord);

  expect(dbPutMock).toHaveBeenCalledTimes(1);
  await expect(listScenarioExports('project-1')).resolves.toEqual([exportRecord]);
  await deleteScenarioExport('export-1');
  expect(dbDeleteMock).toHaveBeenCalledWith('scenario_exports', 'export-1');
});
