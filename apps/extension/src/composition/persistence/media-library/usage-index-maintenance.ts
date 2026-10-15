import { readWorkspaceStorage } from '../review-workspaces/storage';
import { parseVideoWorkspace } from '../review-workspaces/parser';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import {
  initDB,
  VIDEO_PROJECTS_STORE,
  VIDEO_WORKSPACES_STORE,
  VIDEO_WORKSPACE_HISTORY_STORE,
} from '../infrastructure/indexed-db/core';
import { runWithIndexedDbMutation } from '../infrastructure/indexed-db/mutation';
import { isProjectUsageIndexReady } from './usage-index';
import {
  USAGE_INDEX_MARKER,
  USAGE_REFERENCE_INDEX,
  withReviewWorkspaceUsage,
  withVideoProjectUsage,
} from './usage-index-keys';

/** Rebuild only absent derived keys; current-row reads protect edits and deletes during a yield. */
export async function maintainProjectUsageIndex(signal: AbortSignal): Promise<boolean> {
  if (signal.aborted) return false;
  const db = await initDB();
  if (await isProjectUsageIndexReady(db)) return false;
  let changed = false;
  for (const name of [VIDEO_PROJECTS_STORE, VIDEO_WORKSPACES_STORE]) {
    let after: IDBValidKey | undefined;
    while (!signal.aborted) {
      const keys = await db.getAllKeys(
        name,
        after === undefined ? undefined : IDBKeyRange.lowerBound(after, true),
        32
      );
      if (!keys.length) break;
      for (const key of keys) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        if (signal.aborted) return false;
        await runWithIndexedDbMutation(async (currentDb) => {
          if (signal.aborted) return;
          const tx = currentDb.transaction(
            name === VIDEO_WORKSPACES_STORE ? [name, VIDEO_WORKSPACE_HISTORY_STORE] : [name],
            'readwrite'
          );
          const store = tx.objectStore(name);
          try {
            const raw: unknown = await store.get(key);
            const existingKeys = isRecord(raw) ? raw[USAGE_REFERENCE_INDEX] : undefined;
            if (
              isRecord(raw) &&
              !(Array.isArray(existingKeys) && existingKeys.includes(USAGE_INDEX_MARKER))
            ) {
              const workspace =
                name === VIDEO_WORKSPACES_STORE && typeof key === 'string'
                  ? parseVideoWorkspace((await readWorkspaceStorage(tx, key)).logical)
                  : null;
              if (name === VIDEO_PROJECTS_STORE || workspace) {
                const indexed =
                  name === VIDEO_PROJECTS_STORE
                    ? withVideoProjectUsage(raw)
                    : withReviewWorkspaceUsage(workspace!);
                await store.put({ ...raw, usageReferenceKeys: indexed.usageReferenceKeys });
                changed = true;
              }
            }
            await tx.done;
          } catch (error) {
            try {
              tx.abort();
            } catch {
              /* Transaction already settled. */
            }
            await tx.done.catch(() => undefined);
            throw error;
          }
        });
      }
      after = keys.at(-1);
    }
  }
  return !signal.aborted && changed;
}
