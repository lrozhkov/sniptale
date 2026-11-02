import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { createLibraryLifecycle } from '../../library-lifecycle/contracts';
import { createReviewWorkspaceStoreFixture } from '../../review-workspaces/store.test-support';
import { parseSyncCaptureRecord } from '../../sync-capture/guards';
import { createGuideProject } from '../../../../features/scenario/project/factories';
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
    project: { ...createGuideProject(name, id, createdAt), updatedAt },
    createdAt,
    updatedAt,
    workspaceRevision: 1,
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

let storedHistory: unknown[];
beforeEach(() => {
  storedHistory = [];
  vi.clearAllMocks();
  dbGetMock.mockReset();
  txGetMock.mockReset();
  initDBMock.mockResolvedValue({
    get: dbGetMock,
    getAll: dbGetAllMock,
    getAllFromIndex: dbGetAllFromIndexMock,
    put: dbPutMock,
    transaction: vi.fn((_stores: string[], mode: string) => ({
      done: Promise.resolve(),
      objectStore: vi.fn((name: string) => ({
        delete: txDeleteMock,
        get:
          name === 'scenario_projects' && mode === 'readonly'
            ? (id: string) => dbGetMock(name, id)
            : name === 'scenario_projects'
              ? txGetMock
              : async () => undefined,
        getAll: name === 'scenario_projects' ? () => dbGetAllMock(name) : vi.fn(async () => []),
        index: vi.fn(() => ({
          getAll:
            name === 'scenario_project_history'
              ? async () => storedHistory
              : name === 'scenario_project_units'
                ? async () => []
                : txIndexGetAllMock,
          getAllKeys: async () => [],
        })),
        put: txPutMock,
      })),
    })),
  });
  vi.spyOn(Date, 'now').mockReturnValue(12345);
});

it('stores scenario projects with refreshed timestamps and parses reads', async () => {
  txGetMock.mockResolvedValueOnce(createProjectRecord('project-1', 'Existing', 10, 10));
  dbGetMock.mockResolvedValueOnce(createProjectRecord('project-1', 'Existing', 10, 12345));

  await expect(
    saveScenarioProject({
      ...createGuideProject('', 'fixture', 0),
      version: 4,
      id: 'project-1',
      name: 'Updated',
      createdAt: 10,
      updatedAt: 10,
      tags: [],
    })
  ).resolves.toEqual({
    project: expect.objectContaining({ id: 'project-1', updatedAt: 12345 }),
    workspaceRevision: 2,
  });

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

it('lists projects and preserves malformed children during parent deletion', async () => {
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
      availability: 'available' as const,
      id: 'project-1',
      name: 'Existing',
      createdAt: 10,
      updatedAt: 12345,
      tags: [],
      lifecycle: { savedAt: 12345, storageClass: 'library', updatedAt: 12345 },
      workspaceRevision: 1,
    },
    {
      availability: 'available' as const,
      id: 'project-2',
      name: 'Older',
      createdAt: 5,
      updatedAt: 20,
      tags: [],
      lifecycle: { savedAt: 20, storageClass: 'library', updatedAt: 20 },
      workspaceRevision: 1,
    },
  ]);
  await expect(deleteScenarioProject('project-1')).rejects.toThrow('Invalid scenario resource');
  expect(txDeleteMock).not.toHaveBeenCalled();
});

it('handles missing project records and guarded fresh project timestamps', async () => {
  txGetMock.mockResolvedValueOnce(undefined);
  dbGetMock.mockResolvedValueOnce(undefined);

  await saveScenarioProject(
    {
      ...createGuideProject('', 'fixture', 0),
      version: 4,
      id: 'project-new',
      name: 'Fresh',
      createdAt: 77,
      updatedAt: 77,
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
    workspaceRevision: 1,
  });
  expect(dbGetMock).toHaveBeenCalledWith('scenario_projects', 'project-raw');
});

it('rejects malformed project data before writing instead of inventing timestamps', async () => {
  const invalid = createProjectRecord('project-now', 'Invalid', 123, 0).project;
  Reflect.deleteProperty(invalid, 'createdAt');
  await expect(saveScenarioProject(invalid)).rejects.toThrow('Invalid guide project');
  expect(txPutMock).not.toHaveBeenCalled();
});

it('rejects stale scenario project saves inside the write transaction before writing', async () => {
  dbGetMock.mockResolvedValueOnce(createProjectRecord('project-1', 'Existing', 10, 100));
  txGetMock.mockResolvedValueOnce(createProjectRecord('project-1', 'Existing', 10, 500));

  await expect(
    saveScenarioProject(
      {
        ...createGuideProject('', 'fixture', 0),
        version: 4,
        id: 'project-1',
        name: 'Stale',
        createdAt: 10,
        updatedAt: 100,
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
  ).resolves.toEqual({
    project: expect.objectContaining({ name: 'Revision guarded' }),
    workspaceRevision: 5,
  });

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
  ).resolves.toEqual({ project: existing.project, workspaceRevision: 5 });

  expect(txPutMock).not.toHaveBeenCalled();
});

it('advances same-millisecond writes before rejecting a stale writer', async () => {
  vi.spyOn(Date, 'now').mockReturnValue(500);
  let storedEntry = createProjectRecord('project-1', 'Existing', 10, 500);
  txGetMock.mockImplementation(async () => storedEntry);
  txPutMock.mockImplementation(async (entry) => {
    if (entry.id === storedEntry.id) storedEntry = entry;
    else if (entry.projectId === storedEntry.id && typeof entry.revision === 'number')
      storedHistory.push(entry);
  });

  await expect(
    saveScenarioProject(
      {
        ...storedEntry.project,
        name: 'First write',
      },
      { baseUpdatedAt: 500 }
    )
  ).resolves.toEqual({
    project: expect.objectContaining({ name: 'First write', updatedAt: 501 }),
    workspaceRevision: 2,
  });

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

function nativeReceiptFixture(configured = true) {
  let refuseCapture = false;
  const fixture = createReviewWorkspaceStoreFixture(
    (name) => name === 'sync_capture' && refuseCapture
  );
  fixture.rows.set('scenario_exports', new Map());
  fixture.rows.set('scenario_step_editor_documents', new Map());
  initDBMock.mockResolvedValue(fixture.database);
  if (configured)
    fixture.rows.get('sync_capture')!.set('profile', {
      version: 1,
      kind: 'profile',
      key: 'profile',
      createdAt: 1,
      enabled: true,
      spaceId: 'scenario-receipt-space',
      connectionGeneration: 1,
      checkpointIntervalMs: 60000,
    });
  return {
    ...fixture,
    refuse: (value: boolean) => {
      refuseCapture = value;
    },
  };
}
function pendingScenarioReceipt(fixture: ReturnType<typeof nativeReceiptFixture>, rootId: string) {
  const pending = [...fixture.rows.get('sync_capture')!.values()]
    .map(parseSyncCaptureRecord)
    .find(
      (row) =>
        row?.kind === 'pending-checkpoint' &&
        row.rootKind === 'scenario-project' &&
        row.rootId === rootId
    );
  if (pending?.kind !== 'pending-checkpoint')
    throw new Error('Expected pending Scenario checkpoint.');
  return pending;
}

it('returns exact distinct native pending receipts without storing acknowledgement metadata', async () => {
  const fixture = nativeReceiptFixture();
  const first = await saveScenarioProject(createGuideProject('First', 'receipt-scenario', 1), {
    expectedRevision: null,
  });
  const firstPending = pendingScenarioReceipt(fixture, first.project.id);
  const firstReceipt = structuredClone(first.checkpointReceipt);
  expect(firstReceipt).toEqual({
    rootKind: 'scenario-project',
    rootId: first.project.id,
    revision: firstPending.revision,
  });
  const second = await saveScenarioProject(
    { ...first.project, name: 'Second' },
    { expectedRevision: first.workspaceRevision }
  );
  const secondPending = pendingScenarioReceipt(fixture, first.project.id);
  expect(second.checkpointReceipt).toEqual({
    rootKind: 'scenario-project',
    rootId: first.project.id,
    revision: secondPending.revision,
  });
  expect(second.checkpointReceipt?.revision).not.toBe(firstReceipt?.revision);
  expect(first.checkpointReceipt).toEqual(firstReceipt);
  expect(secondPending.dueAt).toBe(firstPending.dueAt);
  expect(second.project).not.toHaveProperty('checkpointReceipt');
  for (const name of ['scenario_projects', 'scenario_project_history', 'scenario_project_units']) {
    for (const row of fixture.rows.get(name)!.values())
      expect(row).not.toHaveProperty('checkpointReceipt');
  }
});

it('receipts the equal-content promotion branch without changing the document revision', async () => {
  const fixture = nativeReceiptFixture();
  const temporary = await saveScenarioProject(
    createGuideProject('Temporary', 'receipt-scenario', 1),
    { expectedRevision: null, storageClass: 'temporary' }
  );
  const stored = fixture.rows.get('scenario_projects')!.get(temporary.project.id);
  if (!isRecord(stored)) throw new Error('Expected physical Scenario root.');
  fixture.rows
    .get('scenario_projects')!
    .set(temporary.project.id, { ...stored, lifecycle: createLibraryLifecycle('temporary', 1) });
  const promoted = await saveScenarioProject(temporary.project, {
    expectedRevision: temporary.workspaceRevision,
  });
  expect(promoted.workspaceRevision).toBe(temporary.workspaceRevision);
  expect(promoted.checkpointReceipt?.revision).toBe(
    pendingScenarioReceipt(fixture, promoted.project.id).revision
  );
  expect(fixture.rows.get('scenario_projects')!.get(promoted.project.id)).toMatchObject({
    lifecycle: { storageClass: 'library' },
  });
  const replay = await saveScenarioProject(promoted.project, {
    expectedRevision: promoted.workspaceRevision,
  });
  expect(replay.workspaceRevision).toBe(promoted.workspaceRevision);
  expect(replay.checkpointReceipt?.revision).not.toBe(promoted.checkpointReceipt?.revision);
});

it('preserves native rows on stale CAS or capture abort and issues a new receipt on retry', async () => {
  const fixture = nativeReceiptFixture();
  const first = await saveScenarioProject(createGuideProject('First', 'receipt-scenario', 1), {
    expectedRevision: null,
  });
  const before = structuredClone(fixture.rows);
  await expect(
    saveScenarioProject({ ...first.project, name: 'Stale' }, { expectedRevision: 0 })
  ).rejects.toMatchObject({ name: 'StaleScenarioAggregateRevisionError' });
  expect(fixture.rows).toEqual(before);
  fixture.refuse(true);
  await expect(
    saveScenarioProject(
      { ...first.project, name: 'Retry' },
      { expectedRevision: first.workspaceRevision }
    )
  ).rejects.toMatchObject({ name: 'QuotaExceededError' });
  expect(fixture.rows).toEqual(before);
  fixture.refuse(false);
  const retried = await saveScenarioProject(
    { ...first.project, name: 'Retry' },
    { expectedRevision: first.workspaceRevision }
  );
  expect(retried.checkpointReceipt).toBeDefined();
  expect(retried.checkpointReceipt?.revision).not.toBe(first.checkpointReceipt?.revision);
});

it.each(['unconfigured', 'disabled', 'immediate'] as const)(
  'issues a due receipt only for admitted immediate native work: %s',
  async (mode) => {
    const fixture = nativeReceiptFixture(mode !== 'unconfigured');
    if (mode !== 'unconfigured')
      fixture.rows.get('sync_capture')!.set('profile', {
        version: 1,
        kind: 'profile',
        key: 'profile',
        createdAt: 1,
        enabled: mode !== 'disabled',
        spaceId: 'scenario-receipt-space',
        connectionGeneration: 1,
        checkpointIntervalMs: 0,
      });
    const saved = await saveScenarioProject(createGuideProject('Local', 'receipt-scenario', 1), {
      expectedRevision: null,
    });
    const pending = [...fixture.rows.get('sync_capture')!.values()]
      .map(parseSyncCaptureRecord)
      .filter((row) => row?.kind === 'pending-checkpoint');
    if (mode === 'immediate') {
      expect(saved.checkpointReceipt).toBeDefined();
      expect(pending).toHaveLength(1);
      expect(pending[0]?.revision).toBe(saved.checkpointReceipt?.revision);
      expect(pending[0]?.dueAt).toBe(pending[0]?.createdAt);
    } else {
      expect(saved).not.toHaveProperty('checkpointReceipt');
      expect(pending).toHaveLength(0);
    }
  }
);

it('returns the transient receipt only after the native transaction commits', async () => {
  const fixture = nativeReceiptFixture();
  let commit!: () => void;
  const commitAllowed = new Promise<void>((resolve) => {
    commit = resolve;
  });
  let reachedDone!: () => void;
  const waitingForCommit = new Promise<void>((resolve) => {
    reachedDone = resolve;
  });
  initDBMock.mockResolvedValue({
    ...fixture.database,
    transaction(names: string[], mode: string) {
      const tx = fixture.database.transaction(names, mode);
      return {
        abort: () => tx.abort(),
        objectStore: (name: string) => tx.objectStore(name),
        get done() {
          reachedDone();
          return commitAllowed.then(() => tx.done);
        },
      };
    },
  });
  let acknowledgement: Awaited<ReturnType<typeof saveScenarioProject>> | undefined;
  const saving = saveScenarioProject(createGuideProject('Commit ordered', 'receipt-scenario', 1), {
    expectedRevision: null,
  }).then((result) => {
    acknowledgement = result;
    return result;
  });
  await waitingForCommit;
  expect(acknowledgement).toBeUndefined();
  expect(fixture.rows.get('scenario_projects')!.size).toBe(0);
  commit();
  const result = await saving;
  expect(result.checkpointReceipt?.revision).toBe(
    pendingScenarioReceipt(fixture, result.project.id).revision
  );
});

it('withholds the receipt and native rows when transaction completion aborts after capture', async () => {
  const fixture = nativeReceiptFixture();
  const first = await saveScenarioProject(createGuideProject('First', 'receipt-scenario', 1), {
    expectedRevision: null,
  });
  const before = structuredClone(fixture.rows);
  initDBMock.mockResolvedValue({
    ...fixture.database,
    transaction(names: string[], mode: string) {
      const tx = fixture.database.transaction(names, mode);
      return {
        abort: () => tx.abort(),
        objectStore: (name: string) => tx.objectStore(name),
        get done() {
          tx.abort();
          return tx.done;
        },
      };
    },
  });
  await expect(
    saveScenarioProject(
      { ...first.project, name: 'Aborted after capture' },
      { expectedRevision: first.workspaceRevision }
    )
  ).rejects.toMatchObject({ name: 'AbortError' });
  expect(fixture.rows).toEqual(before);
  expect(first.checkpointReceipt?.revision).toBe(
    pendingScenarioReceipt(fixture, first.project.id).revision
  );
});
