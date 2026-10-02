import { beforeEach, expect, it, vi } from 'vitest';

const {
  dbDeleteMock,
  dbGetAllFromIndexMock,
  dbPutMock,
  initDBMock,
  recoverHtmlMock,
  physicalDeleteMock,
} = vi.hoisted(() => ({
  recoverHtmlMock: vi.fn(async () => 0),
  physicalDeleteMock: vi.fn(async () => undefined),
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

vi.mock('../export-artifacts', async (original) => ({
  ...(await original<typeof import('../export-artifacts')>()),
  recoverScenarioHtmlPublications: recoverHtmlMock,
}));

vi.mock('../../assets', async (original) => ({
  ...(await original<typeof import('../../assets')>()),
  completePhysicalDeleteOperation: physicalDeleteMock,
}));

import {
  deleteScenarioExport,
  listScenarioExports,
  renameScenarioHtmlExport,
  saveScenarioExport,
} from './exports';
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
    transaction: () => ({
      objectStore: (name: string) => ({
        get: async () => undefined,
        delete: name === 'scenario_exports' ? (id: string) => dbDeleteMock(name, id) : vi.fn(),
        put: vi.fn(),
        index: () => ({ count: async () => 0 }),
      }),
      done: Promise.resolve(),
    }),
  });
});

it('stores and deletes scenario export audit entries', async () => {
  const exportRecord = createExportRecord();
  dbGetAllFromIndexMock.mockResolvedValueOnce([
    exportRecord,
    { ...exportRecord, id: 'export-2', format: 'pdf' },
    { ...exportRecord, id: 'retired-svg', format: 'svg' },
    { ...exportRecord, id: 'export-3', size: Number.NaN },
  ]);

  await saveScenarioExport(exportRecord);

  expect(dbPutMock).toHaveBeenCalledTimes(1);
  await expect(listScenarioExports('project-1')).resolves.toEqual([
    exportRecord,
    { ...exportRecord, id: 'export-2', format: 'pdf' },
  ]);
  await deleteScenarioExport('export-1');
  expect(dbDeleteMock).toHaveBeenCalledWith('scenario_exports', 'export-1');
});

it('renames only the selected authoritative HTML row and retains siblings and lifecycle', async () => {
  const entry = { ...createExportRecord(), trashState: { updatedAt: 42 } };
  const sibling = { ...entry, id: 'export-2', filename: 'sibling.html' };
  const rows = new Map<string, ScenarioExportEntry>([
    [entry.id, entry],
    [sibling.id, sibling],
  ]);
  const put = vi.fn(async (value: ScenarioExportEntry) => {
    rows.set(value.id, value);
  });
  const transaction = vi.fn(() => ({
    store: { get: vi.fn(async (id: string) => rows.get(id)), put },
    done: Promise.resolve(),
    abort: vi.fn(),
  }));
  initDBMock.mockResolvedValue({ transaction });
  await renameScenarioHtmlExport(entry.id, ' Renamed ');
  expect(transaction).toHaveBeenCalledWith('scenario_exports', 'readwrite');
  expect(rows.get(entry.id)).toEqual({ ...entry, filename: 'Renamed.html' });
  expect(rows.get(sibling.id)).toEqual(sibling);
  expect(put).toHaveBeenCalledTimes(1);
});

it.each(['missing', 'pdf', 'trash'])(
  'rejects an unavailable %s row without writing',
  async (reason) => {
    const entry =
      reason === 'missing'
        ? undefined
        : {
            ...createExportRecord(),
            ...(reason === 'pdf'
              ? { format: 'pdf' }
              : { trashState: { updatedAt: 42, trashedAt: 42 } }),
          };
    const put = vi.fn();
    const abort = vi.fn();
    initDBMock.mockResolvedValue({
      transaction: () => ({
        store: { get: async () => entry, put },
        done: Promise.resolve(),
        abort,
      }),
    });
    await expect(renameScenarioHtmlExport('export-1', 'New')).rejects.toThrow('unavailable');
    expect(abort).toHaveBeenCalledOnce();
    expect(put).not.toHaveBeenCalled();
  }
);

it('propagates the authoritative write failure', async () => {
  initDBMock.mockResolvedValue({
    transaction: () => ({
      store: {
        get: async () => createExportRecord(),
        put: async () => {
          throw new Error('quota');
        },
      },
      done: Promise.reject(new Error('transaction aborted')),
      abort: vi.fn(),
    }),
  });
  await expect(renameScenarioHtmlExport('export-1', 'New')).rejects.toThrow('quota');
});

it('settles publication before selected deletion and journals only its unshared body', async () => {
  const rows = new Set(['selected', 'sibling']);
  const owner = {
    ownerKind: 'scenario-export',
    ownerId: 'selected',
    role: 'body',
    assetId: 'body',
  };
  const owners = {
    get: vi.fn(async () => owner),
    delete: vi.fn(),
    index: () => ({ count: async () => 0 }),
  };
  const refs = { delete: vi.fn() };
  const operations = { put: vi.fn() };
  const exports = {
    delete: vi.fn(async (id: string) => {
      rows.delete(id);
    }),
  };
  const transaction = vi.fn(() => ({
    objectStore: (store: string) => {
      if (store === 'asset_owners') return owners;
      if (store === 'asset_refs') return refs;
      if (store === 'asset_operations') return operations;
      if (store === 'scenario_exports') return exports;
      throw new Error('Unexpected source project access');
    },
    done: Promise.resolve(),
  }));
  let finish!: (value: number) => void;
  recoverHtmlMock.mockReturnValueOnce(
    new Promise<number>((resolve) => {
      finish = resolve;
    })
  );
  initDBMock.mockResolvedValue({ transaction });
  const pending = deleteScenarioExport('selected');
  expect(transaction).not.toHaveBeenCalled();
  finish(0);
  await pending;
  expect(owners.delete).toHaveBeenCalledWith(['scenario-export', 'selected', 'body']);
  expect(refs.delete).toHaveBeenCalledWith('body');
  expect([...rows]).toEqual(['sibling']);
  expect(operations.put).toHaveBeenCalledWith(
    expect.objectContaining({ assetIds: ['body'], kind: 'physical-delete' })
  );
  expect(physicalDeleteMock).toHaveBeenCalledWith(operations.put.mock.calls[0]![0]);
});
