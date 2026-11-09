import { initDB, VIDEO_PROJECTS_STORE } from '../infrastructure/indexed-db/core';
import { visitIndexedDbStoreRows } from '../infrastructure/indexed-db/read-primitives';
import { parseVideoProjectEntry } from './read-guards';
import type { VideoProjectEntry } from './contracts';

/** Read valid project entries in descending update order without mutation dependencies. */
export async function listVideoProjectEntries(): Promise<VideoProjectEntry[]> {
  const db = await initDB();
  const tx = db.transaction([VIDEO_PROJECTS_STORE], 'readonly');
  void tx.done.catch(() => undefined);
  try {
    const entries: VideoProjectEntry[] = [];
    await visitIndexedDbStoreRows(tx.objectStore(VIDEO_PROJECTS_STORE), (raw) => {
      const entry = parseVideoProjectEntry(raw);
      if (entry) entries.push(entry);
      return true;
    });
    await tx.done;
    return entries.sort((left, right) => right.updatedAt - left.updatedAt);
  } catch (error) {
    try {
      tx.abort();
    } catch {
      // A completed transaction needs no abort.
    }
    await tx.done.catch(() => undefined);
    throw error;
  }
}
