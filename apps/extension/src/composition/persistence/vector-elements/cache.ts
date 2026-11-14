import { initDB } from '../infrastructure/indexed-db/core';
import type { EditorVectorSourceToken } from '../../../features/editor/vector-catalog';
import { EDITOR_VECTOR_LIBRARY_STORE } from '../infrastructure/indexed-db/core.stores';
import { runWithIndexedDbMutation } from '../infrastructure/indexed-db/mutation';
import { abortIndexedDbMutation } from '../infrastructure/indexed-db/transaction';
import { isEditorVectorCacheRow, type EditorVectorCacheRow } from './contracts';
import {
  EDITOR_VECTOR_CACHE_MAX_BYTES,
  editorVectorCacheKey,
  prepareEditorVectorCacheRow,
  planEditorVectorCacheEviction,
} from './cache-policy';
import { admitsEditorVectorSource } from './publication-admission';

export interface EditorVectorCacheKey {
  sourceId: string;
  kind: EditorVectorCacheRow['cacheKind'];
  id: string;
}
export interface EditorVectorCacheUsage {
  bytes: number;
  entries: number;
  budgetBytes: number;
}

/** Advisory JSON has no asset identities or ownership. Expiry and eviction never change the library. */
export function createEditorVectorCache(
  dependencies: { now?: () => number; maxBytes?: number } = {}
) {
  const now = dependencies.now ?? Date.now;
  const budget = Math.min(
    EDITOR_VECTOR_CACHE_MAX_BYTES,
    Math.max(1, dependencies.maxBytes ?? EDITOR_VECTOR_CACHE_MAX_BYTES)
  );
  /** Returned JSON is untrusted data. Run full SVG profile admission before any preview or rendering. */
  async function read(key: EditorVectorCacheKey): Promise<unknown | null> {
    try {
      const value: unknown = await (
        await initDB()
      ).get(EDITOR_VECTOR_LIBRARY_STORE, editorVectorCacheKey(key));
      return isEditorVectorCacheRow(value) && value.expiresAt > now() ? value.payload : null;
    } catch {
      return null;
    }
  }
  async function put(
    key: EditorVectorCacheKey,
    payload: unknown,
    source?: EditorVectorSourceToken
  ): Promise<boolean> {
    try {
      const timestamp = now();
      const row = prepareEditorVectorCacheRow(key, payload, timestamp, budget);
      if (!row) return false;
      return await runWithIndexedDbMutation(async (db) => {
        const tx = db.transaction([EDITOR_VECTOR_LIBRARY_STORE], 'readwrite');
        try {
          const store = tx.objectStore(EDITOR_VECTOR_LIBRARY_STORE);
          if (source && !admitsEditorVectorSource(await store.get('settings'), source)) {
            await tx.done;
            return false;
          }
          const cached: unknown[] = await store.index('kind').getAll('cache');
          for (const removed of planEditorVectorCacheEviction(cached, row, timestamp, budget))
            await store.delete(removed);
          await store.put(row);
          await tx.done;
          return true;
        } catch (error) {
          return abortIndexedDbMutation(tx, error);
        }
      });
    } catch {
      return false;
    }
  }
  async function touch(key: EditorVectorCacheKey): Promise<void> {
    try {
      await runWithIndexedDbMutation(async (db) => {
        const tx = db.transaction([EDITOR_VECTOR_LIBRARY_STORE], 'readwrite');
        try {
          const value: unknown = await tx
            .objectStore(EDITOR_VECTOR_LIBRARY_STORE)
            .get(editorVectorCacheKey(key));
          if (isEditorVectorCacheRow(value) && value.expiresAt > now())
            await tx.objectStore(EDITOR_VECTOR_LIBRARY_STORE).put({ ...value, touchedAt: now() });
          await tx.done;
        } catch (error) {
          return abortIndexedDbMutation(tx, error);
        }
      });
    } catch {
      /* Advisory access order can be rebuilt or discarded. */
    }
  }
  /** Count stored payload sizes, including expired rows, without changing the cache. */
  async function stats(): Promise<EditorVectorCacheUsage> {
    const db = await initDB();
    const rows: unknown[] = await db.getAllFromIndex(EDITOR_VECTOR_LIBRARY_STORE, 'kind', 'cache');
    let bytes = 0,
      entries = 0;
    for (const row of rows) {
      if (!isEditorVectorCacheRow(row)) continue;
      bytes += row.size;
      entries++;
    }
    return { bytes, entries, budgetBytes: budget };
  }
  async function clear(sourceId?: string): Promise<void> {
    try {
      await runWithIndexedDbMutation(async (db) => {
        const tx = db.transaction([EDITOR_VECTOR_LIBRARY_STORE], 'readwrite');
        try {
          for (const row of await tx
            .objectStore(EDITOR_VECTOR_LIBRARY_STORE)
            .index('kind')
            .getAll('cache')) {
            if (
              isEditorVectorCacheRow(row) &&
              (sourceId === undefined || row.sourceId === sourceId)
            )
              await tx.objectStore(EDITOR_VECTOR_LIBRARY_STORE).delete(row.key);
          }
          await tx.done;
        } catch (error) {
          return abortIndexedDbMutation(tx, error);
        }
      });
    } catch {
      /* Cache removal cannot remove or block authoritative library data. */
    }
  }
  return { read, put, touch, clear, stats };
}
