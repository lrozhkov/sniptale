import { SCENARIO_PROJECTS_STORE, VIDEO_PROJECTS_STORE } from '../infrastructure/indexed-db/core';
import { runWithIndexedDbMutation } from '../infrastructure/indexed-db/mutation';
import { isRecord } from '../infrastructure/indexed-db/read-primitives';
import { parseVideoProjectEntry } from '../projects/read-guards';
import { parseScenarioProjectEntry } from '../scenario/read-guards';
import { promoteLibraryLifecycle } from './contracts';

/** Repairs legacy draft project roots without changing their documents or revisions. */
export async function repairTemporaryProjectLifecycles(now = Date.now()): Promise<number> {
  return runWithIndexedDbMutation(async (db) => {
    const tx = db.transaction([VIDEO_PROJECTS_STORE, SCENARIO_PROJECTS_STORE], 'readwrite');
    let repaired = 0;
    try {
      for (const [storeName, parse] of [
        [VIDEO_PROJECTS_STORE, parseVideoProjectEntry],
        [SCENARIO_PROJECTS_STORE, parseScenarioProjectEntry],
      ] as const) {
        const store = tx.objectStore(storeName);
        for (const raw of await store.getAll()) {
          const entry = parse(raw);
          if (!isRecord(raw) || entry?.lifecycle?.storageClass !== 'temporary') continue;
          await store.put({
            ...raw,
            lifecycle: promoteLibraryLifecycle(entry.lifecycle, now),
          });
          repaired += 1;
        }
      }
      await tx.done;
      return repaired;
    } catch (error) {
      try {
        tx.abort();
      } catch {
        // The transaction may already have aborted.
      }
      await tx.done.catch(() => undefined);
      throw error;
    }
  });
}
