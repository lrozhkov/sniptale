import { MEDIA_LIBRARY_STORE } from '../infrastructure/indexed-db/core';
import { runWithIndexedDbMutation } from '../infrastructure/indexed-db/mutation';
import type { MediaLibraryEntry } from './contracts';

export async function upsertMediaEntry(entry: MediaLibraryEntry): Promise<void> {
  await runWithIndexedDbMutation((db) => db.put(MEDIA_LIBRARY_STORE, entry));
}
