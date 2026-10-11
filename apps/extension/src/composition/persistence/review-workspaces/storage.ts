import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import {
  VIDEO_WORKSPACES_STORE,
  VIDEO_WORKSPACE_HISTORY_STORE,
} from '../infrastructure/indexed-db/core.stores';
import { withReviewWorkspaceUsage } from '../media-library/usage-index-keys';
import type { VideoWorkspace } from './contracts';
import { parseVideoWorkspace } from './parser';
import {
  materializeWorkspaceStorage,
  workspaceStorageHead,
  workspaceStorageRows,
} from './storage-format';

/** Physical reads participate in the caller's existing head/history snapshot. */
export interface WorkspaceStorageReadTransaction {
  objectStore(name: string): {
    get(key: string): Promise<unknown>;
    index(name: string): {
      getAll(key: IDBValidKey): Promise<unknown[]>;
    };
  };
}

/** Enumeration is reserved for existing full graph consumers, never the indexed inspector. */
export interface WorkspaceStorageEnumerationTransaction extends WorkspaceStorageReadTransaction {
  objectStore(
    name: string
  ): ReturnType<WorkspaceStorageReadTransaction['objectStore']> & { getAll(): Promise<unknown[]> };
}

/** The caller retains mutation admission, transaction completion, abort and byte ownership. */
interface WorkspaceStorageWriteTransaction extends WorkspaceStorageEnumerationTransaction {
  objectStore(name: string): Omit<
    ReturnType<WorkspaceStorageEnumerationTransaction['objectStore']>,
    'index'
  > & {
    put(value: unknown): Promise<unknown>;
    delete(key: IDBValidKey): Promise<unknown>;
    index(name: string): ReturnType<
      ReturnType<WorkspaceStorageReadTransaction['objectStore']>['index']
    > & {
      getAllKeys(key: IDBValidKey): Promise<IDBValidKey[]>;
    };
  };
}

/** Read evidence accompanies the already admitted logical document; no second history read. */
export interface WorkspaceStorageRead {
  head: unknown;
  rows: unknown[];
  logical: unknown;
}

/** Materializes an already selected indexed head in the same native readonly transaction. */
export async function materializeWorkspaceHead(
  tx: WorkspaceStorageReadTransaction,
  head: unknown
): Promise<unknown> {
  if (!isRecord(head) || typeof head['aggregateId'] !== 'string') return head;
  const rows = await tx
    .objectStore(VIDEO_WORKSPACE_HISTORY_STORE)
    .index('aggregateId')
    .getAll(head['aggregateId']);
  return materializeWorkspaceStorage(head, rows);
}

/** Missing heads with retained rows are invalid evidence, never empty new workspaces. */
export async function readWorkspaceStorage(
  tx: WorkspaceStorageReadTransaction,
  aggregateId: string
): Promise<WorkspaceStorageRead> {
  const [head, rows] = await Promise.all([
    tx.objectStore(VIDEO_WORKSPACES_STORE).get(aggregateId),
    tx.objectStore(VIDEO_WORKSPACE_HISTORY_STORE).index('aggregateId').getAll(aggregateId),
  ]);
  return { head, rows, logical: materializeWorkspaceStorage(head, rows) };
}

async function deleteWorkspaceRows(tx: WorkspaceStorageWriteTransaction, aggregateId: string) {
  const store = tx.objectStore(VIDEO_WORKSPACE_HISTORY_STORE);
  const keys = await store.index('aggregateId').getAllKeys(aggregateId);
  for (const key of keys) await store.delete(key);
}

/** Explicit full replacement, used for restore, detach, baseline changes and legacy admission. */
export async function replaceWorkspaceStorage(
  tx: WorkspaceStorageWriteTransaction,
  workspace: VideoWorkspace,
  usageReferenceKeys: string[]
): Promise<void> {
  await deleteWorkspaceRows(tx, workspace.aggregateId);
  const store = tx.objectStore(VIDEO_WORKSPACE_HISTORY_STORE);
  for (const row of workspaceStorageRows(workspace)) await store.put(row);
  await tx
    .objectStore(VIDEO_WORKSPACES_STORE)
    .put(workspaceStorageHead(workspace, usageReferenceKeys));
}

function storageValueEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right))
    return (
      left.length === right.length &&
      left.every((value, index) => storageValueEqual(value, right[index]))
    );
  if (!isRecord(left) || !isRecord(right) || Array.isArray(left) || Array.isArray(right))
    return false;
  const keys = Object.keys(left);
  return (
    keys.length === Object.keys(right).length &&
    keys.every((key) => Object.hasOwn(right, key) && storageValueEqual(left[key], right[key]))
  );
}

function unchangedStoredHistory(storage: WorkspaceStorageRead, previous: VideoWorkspace) {
  const { head, logical } = storage;
  return (
    isRecord(head) &&
    head['formatVersion'] === 2 &&
    head['historyLength'] === previous.history.length &&
    isRecord(logical) &&
    storageValueEqual(logical['history'], previous.history) &&
    storageValueEqual(logical['advanced'], previous.advanced) &&
    storageValueEqual(logical['effectSnapshots'], previous.effectSnapshots)
  );
}

/** Applies an owner-selected delta only after complete before/candidate/redo admission. */
export async function writeWorkspaceStorage(
  tx: WorkspaceStorageWriteTransaction,
  args: {
    storage: WorkspaceStorageRead;
    previous: VideoWorkspace;
    workspace: VideoWorkspace;
    usageReferenceKeys: string[];
    mode: 'append' | 'cursor' | 'replace';
  }
): Promise<void> {
  const { storage, previous, workspace, usageReferenceKeys, mode } = args;
  if (mode === 'cursor' && !storageValueEqual(previous.effectSnapshots, workspace.effectSnapshots))
    throw new Error('Invalid workspace cursor registry change.');
  if (mode === 'append') {
    const existing = new Map(
      (previous.effectSnapshots ?? []).map((snapshot) => [snapshot.id, snapshot])
    );
    for (const snapshot of workspace.effectSnapshots ?? []) {
      const retained = existing.get(snapshot.id);
      if (retained && !storageValueEqual(retained, snapshot))
        throw new Error('Immutable workspace effect snapshot changed.');
    }
  }
  const retained = mode === 'append' ? previous.cursor : previous.history.length;
  const unchanged =
    unchangedStoredHistory(storage, previous) &&
    storageValueEqual(previous.advanced, workspace.advanced) &&
    previous.history
      .slice(0, retained)
      .every((operation, index) => storageValueEqual(operation, workspace.history[index]));
  if (mode === 'replace' || !unchanged) {
    await replaceWorkspaceStorage(tx, workspace, usageReferenceKeys);
    return;
  }
  if (mode === 'append') {
    const operation = workspace.history[retained];
    if (!operation || workspace.history.length !== retained + 1)
      throw new Error('Invalid workspace append.');
    const store = tx.objectStore(VIDEO_WORKSPACE_HISTORY_STORE);
    for (let ordinal = retained + 1; ordinal <= previous.history.length; ordinal++)
      await store.delete([workspace.aggregateId, ordinal]);
    await store.put({ aggregateId: workspace.aggregateId, ordinal: retained + 1, operation });
  } else if (workspace.history.length !== previous.history.length) {
    throw new Error('Invalid workspace cursor update.');
  }
  if (!storageValueEqual(previous.effectSnapshots, workspace.effectSnapshots)) {
    if (mode !== 'append') throw new Error('Invalid workspace cursor registry change.');
    await tx.objectStore(VIDEO_WORKSPACE_HISTORY_STORE).put({
      aggregateId: workspace.aggregateId,
      ordinal: 0,
      advanced: workspace.advanced,
      ...(workspace.effectSnapshots ? { effectSnapshots: workspace.effectSnapshots } : {}),
    });
  }
  await tx
    .objectStore(VIDEO_WORKSPACES_STORE)
    .put(workspaceStorageHead(workspace, usageReferenceKeys));
}

/** Enumerates full logical history, including opaque orphan evidence for conservative cleanup. */
export async function readAllWorkspaceStorage(
  tx: WorkspaceStorageEnumerationTransaction
): Promise<unknown[]> {
  const [heads, rows] = await Promise.all([
    tx.objectStore(VIDEO_WORKSPACES_STORE).getAll(),
    tx.objectStore(VIDEO_WORKSPACE_HISTORY_STORE).getAll(),
  ]);
  const grouped = new Map<string, unknown[]>();
  const invalidRows: unknown[] = [];
  for (const row of rows) {
    if (!isRecord(row) || typeof row['aggregateId'] !== 'string') invalidRows.push(row);
    else {
      const own = grouped.get(row['aggregateId']) ?? [];
      own.push(row);
      grouped.set(row['aggregateId'], own);
    }
  }
  const logical = heads.map((head) => {
    const id = isRecord(head) ? head['aggregateId'] : undefined;
    const ownRows = typeof id === 'string' ? (grouped.get(id) ?? []) : [];
    if (typeof id === 'string') grouped.delete(id);
    return materializeWorkspaceStorage(head, ownRows);
  });
  for (const [aggregateId, ownRows] of grouped)
    logical.push({ aggregateId, formatVersion: 2, historyEvidence: ownRows });
  if (invalidRows.length) logical.push({ formatVersion: 2, historyEvidence: invalidRows });
  return logical;
}

/** Full logical values for existing lifecycle/publication owners in their original transaction. */
export function createVideoWorkspaceStore(tx: WorkspaceStorageWriteTransaction) {
  return {
    async get(aggregateId: string): Promise<unknown> {
      return (await readWorkspaceStorage(tx, aggregateId)).logical;
    },
    getAll: () => readAllWorkspaceStorage(tx),
    async put(value: unknown): Promise<void> {
      const workspace = parseVideoWorkspace(value);
      if (!workspace) throw new Error('Invalid workspace replacement.');
      const stored = await readWorkspaceStorage(tx, workspace.aggregateId);
      if (stored.logical !== undefined && !parseVideoWorkspace(stored.logical))
        throw new Error('Invalid existing workspace replacement.');
      const indexed = withReviewWorkspaceUsage(workspace);
      await replaceWorkspaceStorage(tx, workspace, indexed.usageReferenceKeys);
    },
    async delete(aggregateId: string): Promise<void> {
      await deleteWorkspaceRows(tx, aggregateId);
      await tx.objectStore(VIDEO_WORKSPACES_STORE).delete(aggregateId);
    },
  };
}
