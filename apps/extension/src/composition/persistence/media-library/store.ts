import { MEDIA_LIBRARY_STORE } from '../infrastructure/indexed-db/core';
import { runWithIndexedDbMutation } from '../infrastructure/indexed-db/mutation';
import type { MediaLibraryEntry } from './contracts';
import { parseMediaLibraryEntry } from './read-guards';
import { sameMediaSource } from './dependencies';

/** Legacy metadata compatibility: source creation and replacement belong to publication owners. */
export async function upsertMediaEntry(entry: MediaLibraryEntry): Promise<void> {
  await runWithIndexedDbMutation(async (db) => {
    const tx = db.transaction(MEDIA_LIBRARY_STORE, 'readwrite');
    const store = tx.objectStore(MEDIA_LIBRARY_STORE);
    const current = parseMediaLibraryEntry(await store.get(entry.id));
    if (!current || current.id !== entry.id || !sameMediaSource(current.source, entry.source))
      throw new Error('Media metadata update requires an unchanged published source.');
    await store.put({
      ...current,
      filename: entry.filename,
      tags: entry.tags,
      updatedAt: entry.updatedAt,
    });
    await tx.done;
  });
}
