import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import {
  UNKNOWN_HISTORY_REFERENCES,
  ROW_REFERENCE_FIELD,
  rowReferenceKey,
  stripRowReferenceMetadata,
  withRowReferenceMetadata,
} from '../infrastructure/indexed-db/row-index-contract';
import { collectReviewAssetReferences } from './asset-refs';
import { parseVideoWorkspace } from './parser';
import { materializeWorkspaceStorage } from './storage-format';

export const WORKSPACE_HEAD_STORE = 'video_workspaces';
export const WORKSPACE_HISTORY_STORE = 'video_workspace_history';
interface WorkspaceIndexCursor {
  readonly value: unknown;
  update?: ((value: unknown) => Promise<unknown>) | undefined;
  continue(): Promise<WorkspaceIndexCursor | null>;
}

/** The existing native transaction supplies only these scoped source capabilities. */
export interface WorkspaceIndexTransaction {
  objectStore(name: string): {
    get(key: IDBValidKey): Promise<unknown>;
    index(name: string): { getAll(key: IDBValidKey): Promise<unknown[]> };
    put?: ((value: unknown, key?: IDBValidKey) => Promise<IDBValidKey>) | undefined;
    add?: ((value: unknown, key?: IDBValidKey) => Promise<IDBValidKey>) | undefined;
    delete?: ((key: IDBValidKey | IDBKeyRange) => Promise<void>) | undefined;
    clear?: (() => Promise<void>) | undefined;
    openCursor(): Promise<WorkspaceIndexCursor | null>;
  };
}

/** Scoped history admission uses the caller's native transaction, never an imported summary. */
export function projectWorkspaceReferenceKeys(head: unknown, rows: readonly unknown[]): string[] {
  const logical = materializeWorkspaceStorage(
    stripRowReferenceMetadata(head),
    rows.map(stripRowReferenceMetadata)
  );
  const workspace = parseVideoWorkspace(logical);
  if (!workspace) return [UNKNOWN_HISTORY_REFERENCES];
  const keys = new Set([
    rowReferenceKey('media', workspace.aggregateId),
    rowReferenceKey('media', workspace.sourceMediaId ?? workspace.aggregateId),
  ]);
  for (const ref of collectReviewAssetReferences(workspace)) {
    if (ref.startsWith('project-asset:'))
      keys.add(rowReferenceKey('project-asset', ref.slice('project-asset:'.length)));
  }
  return [...keys];
}

/** Head admission clears changed history and previously unadmitted rows from earlier transactions. */
export function createWorkspaceIndexMutation(tx: WorkspaceIndexTransaction) {
  const pending = new Map<string, Set<number>>();
  const invalidated = new Set<string>();
  const history = () => tx.objectStore(WORKSPACE_HISTORY_STORE);
  const heads = () => tx.objectStore(WORKSPACE_HEAD_STORE);
  const write = (
    name: string,
    value: unknown,
    method: 'put' | 'add' = 'put',
    key?: IDBValidKey
  ): Promise<IDBValidKey> => {
    const store = tx.objectStore(name);
    const request = store[method];
    if (!request) throw new Error('Workspace index requires a writable transaction.');
    return request.call(store, value, key);
  };
  const remove = (name: string, key: IDBValidKey | IDBKeyRange) => {
    const store = tx.objectStore(name);
    if (!store.delete) throw new Error('Workspace index requires a writable transaction.');
    return store.delete(key);
  };
  const remember = (raw: unknown) => {
    if (
      !isRecord(raw) ||
      typeof raw['aggregateId'] !== 'string' ||
      typeof raw['ordinal'] !== 'number'
    )
      return;
    const ordinals = pending.get(raw['aggregateId']) ?? new Set<number>();
    ordinals.add(raw['ordinal']);
    pending.set(raw['aggregateId'], ordinals);
  };
  const invalidateHead = async (aggregateId: string) => {
    if (invalidated.has(aggregateId)) return;
    const head: unknown = await heads().get(aggregateId);
    if (head !== undefined)
      await write(
        WORKSPACE_HEAD_STORE,
        withRowReferenceMetadata(head, [UNKNOWN_HISTORY_REFERENCES])
      );
    invalidated.add(aggregateId);
  };
  return {
    async put(
      store: string,
      raw: unknown,
      method: 'put' | 'add',
      key?: IDBValidKey
    ): Promise<IDBValidKey> {
      if (store === WORKSPACE_HISTORY_STORE) {
        remember(raw);
        return write(
          WORKSPACE_HISTORY_STORE,
          withRowReferenceMetadata(raw, [UNKNOWN_HISTORY_REFERENCES]),
          method,
          key
        );
      }
      const id = isRecord(raw) ? raw['aggregateId'] : undefined;
      const rows: unknown[] =
        typeof id === 'string' ? await history().index('aggregateId').getAll(id) : [];
      const keys = projectWorkspaceReferenceKeys(raw, rows);
      const result = await write(
        WORKSPACE_HEAD_STORE,
        withRowReferenceMetadata(raw, keys),
        method,
        key
      );
      if (typeof id === 'string') {
        if (keys.includes(UNKNOWN_HISTORY_REFERENCES)) invalidated.add(id);
        else invalidated.delete(id);
      }
      if (!keys.includes(UNKNOWN_HISTORY_REFERENCES) && typeof id === 'string') {
        const changed = pending.get(id);
        for (const row of rows) {
          if (!isRecord(row) || typeof row['ordinal'] !== 'number') continue;
          const previousKeys = row[ROW_REFERENCE_FIELD];
          const unadmitted =
            Array.isArray(previousKeys) && previousKeys.includes(UNKNOWN_HISTORY_REFERENCES);
          if (changed?.has(row['ordinal']) || unadmitted) {
            await write(WORKSPACE_HISTORY_STORE, withRowReferenceMetadata(row, []));
          }
        }
        pending.delete(id);
      }
      return result;
    },
    async delete(store: string, key: IDBValidKey | IDBKeyRange): Promise<void> {
      // Range deletes are not used by this owner. Refuse rather than bypass history admission.
      if (store === WORKSPACE_HISTORY_STORE) {
        if (!Array.isArray(key) || typeof key[0] !== 'string')
          throw new Error('Workspace history deletion requires its aggregate identity.');
        await invalidateHead(key[0]);
        await remove(WORKSPACE_HISTORY_STORE, key);
      } else {
        if (typeof key !== 'string')
          throw new Error('Workspace deletion requires its aggregate identity.');
        const rows: unknown[] = await history().index('aggregateId').getAll(key);
        for (const row of rows)
          await write(
            WORKSPACE_HISTORY_STORE,
            withRowReferenceMetadata(row, [UNKNOWN_HISTORY_REFERENCES])
          );
        await remove(WORKSPACE_HEAD_STORE, key);
      }
    },
    async clear(store: string): Promise<void> {
      // Full erasure is an explicit global operation, not candidate deletion admission.
      const other = store === WORKSPACE_HISTORY_STORE ? heads() : history();
      let cursor = await other.openCursor();
      while (cursor) {
        if (!cursor.update) throw new Error('Workspace index requires a writable transaction.');
        await cursor.update(withRowReferenceMetadata(cursor.value, [UNKNOWN_HISTORY_REFERENCES]));
        cursor = await cursor.continue();
      }
      const source = tx.objectStore(store);
      if (!source.clear) throw new Error('Workspace index requires a writable transaction.');
      await source.clear();
    },
  };
}
