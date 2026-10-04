import { promoteProjectSourceLifecycles } from '../projects/new-reference-admission';
import { promoteScenarioSourceLifecycles } from '../scenario/library-publication';
import {
  SCENARIO_PROJECTS_STORE,
  VIDEO_PROJECTS_STORE,
  MEDIA_LIBRARY_STORE,
  PROJECT_ASSETS_STORE,
  SCENARIO_ASSETS_STORE,
  STORE_NAME,
} from '../infrastructure/indexed-db/core';
import { runWithIndexedDbMutation } from '../infrastructure/indexed-db/mutation';
import { isRecord } from '../infrastructure/indexed-db/read-primitives';
import { parseVideoProjectEntry } from '../projects/read-guards';
import { parseScenarioProjectEntry } from '../scenario/read-guards';
import { promoteLibraryLifecycle } from './contracts';

/** Repairs legacy draft project roots without changing their documents or revisions. */
export async function repairTemporaryProjectLifecycles(now = Date.now()): Promise<number> {
  return runWithIndexedDbMutation(async (db) => {
    const tx = db.transaction(
      [
        VIDEO_PROJECTS_STORE,
        SCENARIO_PROJECTS_STORE,
        MEDIA_LIBRARY_STORE,
        PROJECT_ASSETS_STORE,
        SCENARIO_ASSETS_STORE,
        STORE_NAME,
      ],
      'readwrite'
    );
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
      const stores = {
        mediaLibraryStore: tx.objectStore(MEDIA_LIBRARY_STORE),
        projectAssetStore: tx.objectStore(PROJECT_ASSETS_STORE),
        recordingStore: tx.objectStore(STORE_NAME),
        scenarioAssetStore: tx.objectStore(SCENARIO_ASSETS_STORE),
        scenarioProjectStore: tx.objectStore(SCENARIO_PROJECTS_STORE),
      };
      for (const raw of await tx.objectStore(VIDEO_PROJECTS_STORE).getAll()) {
        const entry = parseVideoProjectEntry(raw);
        if (entry) await promoteProjectSourceLifecycles(entry.project, stores, now);
      }
      for (const raw of await stores.scenarioProjectStore.getAll()) {
        const entry = parseScenarioProjectEntry(raw);
        if (entry) await promoteScenarioSourceLifecycles(tx, entry, now);
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
