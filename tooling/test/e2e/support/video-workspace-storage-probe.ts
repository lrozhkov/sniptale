import { openDB, type IDBPDatabase } from 'idb';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import {
  DB_NAME,
  DB_VERSION,
} from '../../../../apps/extension/src/composition/persistence/infrastructure/indexed-db/core.stores';
import { handleDatabaseUpgrade } from '../../../../apps/extension/src/composition/persistence/infrastructure/indexed-db/upgrade/core';
import { betaV1Fixture } from '../../../../apps/extension/src/composition/persistence/infrastructure/indexed-db/fixtures/beta-v1';
import { betaV17Fixture } from '../../../../apps/extension/src/composition/persistence/infrastructure/indexed-db/fixtures/beta-v17';
import { createQuickEditAdvancedState } from '../../../../apps/extension/src/features/video/review/advanced/defaults';
import { createQuickEditWebcam } from '../../../../apps/extension/src/features/video/review/advanced/webcam';
import { createVideoWorkspaceStore } from '../../../../apps/extension/src/composition/persistence/review-workspaces/storage';
import {
  commitVideoWorkspace,
  moveVideoWorkspaceHistory,
  openVideoWorkspace,
  readVideoWorkspace,
  saveVideoWorkspaceDraft,
  VideoWorkspaceError,
} from '../../../../apps/extension/src/composition/persistence/review-workspaces/store';
import type { VideoWorkspace } from '../../../../apps/extension/src/composition/persistence/review-workspaces/contracts';

const id = 'recording:beta-v1-recording';
const physicalStores = [
  'video_workspaces',
  'video_workspace_history',
  'video_workspace_drafts',
  'project_assets',
];
const source = { duration: 12, width: 640, height: 360, mimeType: 'video/webm', size: 15 };
const identity = (workspace: VideoWorkspace) => ({
  aggregateId: id,
  expectedRevision: workspace.revision,
  expectedSourceAssetId: workspace.sourceAssetId,
});
const annotation = (index: number) => ({
  id: `text-${index}`,
  text: 'Synthetic retained annotation. '.repeat(30),
  anchor: { kind: 'point' as const, time: 2 },
});

function observeNativeRequests() {
  const originalPut = IDBObjectStore.prototype.put;
  const originalDelete = IDBObjectStore.prototype.delete;
  const writes: { store: string; bytes: number }[] = [];
  const deleted: { store: string; key: IDBValidKey | IDBKeyRange }[] = [];
  let lateFailure = false;
  let succeeded = 0;
  IDBObjectStore.prototype.put = function (value: unknown, key?: IDBValidKey) {
    const request =
      key === undefined ? originalPut.call(this, value) : originalPut.call(this, value, key);
    writes.push({
      store: this.name,
      bytes: new TextEncoder().encode(JSON.stringify(value)).byteLength,
    });
    request.addEventListener('success', () => {
      succeeded++;
    });
    return request;
  };
  IDBObjectStore.prototype.delete = function (key) {
    if (lateFailure && this.name === 'video_workspace_drafts')
      throw new DOMException('Native late failure', 'QuotaExceededError');
    deleted.push({ store: this.name, key });
    return originalDelete.call(this, key);
  };
  return {
    writes,
    deleted,
    successCount: () => succeeded,
    reset() {
      writes.length = deleted.length = 0;
      succeeded = 0;
      lateFailure = false;
    },
    failDraft() {
      lateFailure = true;
    },
    restore() {
      IDBObjectStore.prototype.put = originalPut;
      IDBObjectStore.prototype.delete = originalDelete;
    },
  };
}
type Observation = ReturnType<typeof observeNativeRequests>;

async function snapshot(db: IDBPDatabase): Promise<unknown[][]> {
  const tx = db.transaction(physicalStores, 'readonly');
  const rows: unknown[][] = await Promise.all(
    physicalStores.map((store) => tx.objectStore(store).getAll())
  );
  await tx.done;
  return rows;
}

async function admitNativeHistoryStore() {
  const legacy = await openDB(DB_NAME, 17, {
    upgrade(db, old, next, tx) {
      handleDatabaseUpgrade(db, old, next, tx);
      db.deleteObjectStore('video_workspace_history');
      for (const [domainId, schemaVersion] of Object.entries(betaV17Fixture.domainVersions))
        tx.objectStore('schema_contracts').put({ domainId, schemaVersion });
    },
  });
  const workspace: VideoWorkspace = {
    aggregateId: id,
    formatVersion: 1,
    source,
    sourceAssetId: 'beta-v1-recording-asset',
    revision: 1,
    history: [],
    cursor: 0,
    advanced: createQuickEditAdvancedState(),
    createdAt: 1,
    updatedAt: 1,
  };
  const seed = legacy.transaction(['media_library', 'recordings', 'video_workspaces'], 'readwrite');
  await seed.objectStore('media_library').put(betaV1Fixture.records.media_library[0]);
  await seed.objectStore('recordings').put(betaV1Fixture.records.recordings[0]);
  await seed.objectStore('video_workspaces').put(workspace);
  await seed.done;
  const before = JSON.stringify(await legacy.get('video_workspaces', id));
  legacy.close();
  let aborted = false;
  try {
    await openDB(DB_NAME, DB_VERSION, {
      upgrade(db, old, next, tx) {
        handleDatabaseUpgrade(db, old, next, tx);
        tx.abort();
      },
    });
  } catch {
    aborted = true;
  }
  const prior = await openDB(DB_NAME);
  const rollback =
    prior.version === 17 &&
    !prior.objectStoreNames.contains('video_workspace_history') &&
    before === JSON.stringify(await prior.get('video_workspaces', id));
  prior.close();
  const db = await openDB(DB_NAME, DB_VERSION, { upgrade: handleDatabaseUpgrade });
  const retainedLegacy = before === JSON.stringify(await db.get('video_workspaces', id));
  const emptyHistory = await db.count('video_workspace_history');
  return { db, admission: { aborted, rollback, retainedLegacy, emptyHistory } };
}

async function retainedWorkspace(db: IDBPDatabase) {
  let { workspace } = await openVideoWorkspace(id, source);
  const tx = db.transaction(
    ['project_assets', 'video_workspaces', 'video_workspace_history'],
    'readwrite'
  );
  await tx.objectStore('project_assets').put({
    id: 'retained-camera',
    assetId: 'native-object',
    mimeType: 'video/webm',
    size: 15,
    createdAt: 1,
  });
  workspace = {
    ...workspace,
    advanced: {
      ...workspace.advanced,
      webcam: {
        ...createQuickEditWebcam('project-asset:retained-camera', source, source),
        enabled: false,
      },
    },
  };
  await createVideoWorkspaceStore(tx).put(workspace);
  await tx.done;
  for (let index = 0; index < 40; index++) {
    ({ workspace } = await commitVideoWorkspace({
      ...identity(workspace),
      operation: {
        id: `annotation-${index}`,
        at: index + 1,
        target: 'annotation',
        before: null,
        after: annotation(index),
      },
    }));
  }
  return workspace;
}

async function measureDelta(db: IDBPDatabase, previous: VideoWorkspace, observation: Observation) {
  const beforeAppend = await snapshot(db);
  let { workspace } = await commitVideoWorkspace({
    ...identity(previous),
    operation: {
      id: 'mute',
      at: 41,
      target: 'sourceAudio',
      before: { muted: false, volume: 1 },
      after: { muted: true, volume: 1 },
    },
  });
  const appendWrites = [...observation.writes];
  const afterAppend = await snapshot(db);
  const retainedPrefix =
    JSON.stringify(afterAppend[1]?.slice(0, 41)) === JSON.stringify(beforeAppend[1]);
  observation.reset();
  ({ workspace } = await moveVideoWorkspaceHistory({ ...identity(workspace), direction: 'undo' }));
  const cursorWrites = [...observation.writes];
  const afterUndo = await snapshot(db);
  const unchangedRows = JSON.stringify(afterUndo[1]) === JSON.stringify(afterAppend[1]);
  observation.reset();
  ({ workspace } = await commitVideoWorkspace({
    ...identity(workspace),
    operation: { id: 'branch', at: 42, target: 'annotation', before: null, after: annotation(40) },
  }));
  const branch = {
    writes: [...observation.writes],
    deleted: [...observation.deleted],
    historyLength: workspace.history.length,
  };
  return {
    workspace,
    delta: { appendWrites, retainedPrefix, cursorWrites, unchangedRows, branch },
  };
}

async function proveLateAbort(
  db: IDBPDatabase,
  workspace: VideoWorkspace,
  observation: Observation
) {
  const draft = await saveVideoWorkspaceDraft({
    ...identity(workspace),
    expectedDraftRevision: null,
    annotation: annotation(41),
    before: null,
  });
  const beforeFailure = await snapshot(db);
  observation.reset();
  observation.failDraft();
  let failure: string | null = null;
  try {
    await commitVideoWorkspace({
      ...identity(workspace),
      consumeDraftRevision: draft.draft!.revision,
      operation: {
        id: 'consume',
        at: 43,
        target: 'annotation',
        before: null,
        after: annotation(41),
      },
    });
  } catch (error) {
    failure = error instanceof DOMException ? error.name : 'unexpected';
  }
  const successfulRequestsBeforeFailure = observation.successCount();
  const afterFailure = await snapshot(db);
  const rollback = JSON.stringify(beforeFailure) === JSON.stringify(afterFailure);
  const recovered = await readVideoWorkspace(id);
  return {
    failure,
    successfulRequestsBeforeFailure,
    rollback,
    recoveredRevision: recovered?.workspace.revision,
    expectedRevision: workspace.revision,
    recoveredDraft: recovered?.draft?.annotation.id,
  };
}

async function proveCorruptRefusal(db: IDBPDatabase, observation: Observation) {
  observation.reset();
  const retained: unknown = await db.get('video_workspace_history', [id, 40]);
  if (!isRecord(retained)) throw new Error('Native fixture row is missing');
  await db.delete('video_workspace_history', [id, 40]);
  const gapBefore = await snapshot(db);
  observation.reset();
  let gap: string | null = null;
  try {
    await readVideoWorkspace(id);
  } catch (error) {
    gap = error instanceof VideoWorkspaceError ? error.code : 'unexpected';
  }
  const gapPreserved =
    JSON.stringify(gapBefore) === JSON.stringify(await snapshot(db)) &&
    observation.writes.length === 0;
  await db.put('video_workspace_history', retained);
  await db.delete('video_workspaces', id);
  const orphanBefore = await snapshot(db);
  observation.reset();
  let orphan: string | null = null;
  try {
    await openVideoWorkspace(id, source);
  } catch (error) {
    orphan = error instanceof VideoWorkspaceError ? error.code : 'unexpected';
  }
  const orphanPreserved =
    JSON.stringify(orphanBefore) === JSON.stringify(await snapshot(db)) &&
    observation.writes.length === 0;
  return { gap, gapPreserved, orphan, orphanPreserved };
}

/** Real production mutation owner and native IDB requests; faults stay in this test process. */
export async function probe() {
  const { db, admission } = await admitNativeHistoryStore();
  const previous = await retainedWorkspace(db);
  const observation = observeNativeRequests();
  try {
    const { workspace, delta } = await measureDelta(db, previous, observation);
    const abort = await proveLateAbort(db, workspace, observation);
    const corruption = await proveCorruptRefusal(db, observation);
    return { admission, ...delta, ...abort, corruption };
  } finally {
    observation.restore();
    db.close();
  }
}
