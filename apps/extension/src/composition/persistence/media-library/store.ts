import {
  MEDIA_LIBRARY_STORE,
  SYNC_CAPTURE_STORE,
  ASSET_REFS_STORE,
  ASSET_OWNERS_STORE,
  IMAGE_WORKSPACES_STORE,
  AGGREGATE_PRESENTATIONS_STORE,
  PROJECT_ASSETS_STORE,
  PROJECT_EXPORTS_STORE,
  WEB_SNAPSHOTS_STORE,
  STORE_NAME,
  RECORDING_TELEMETRY_STORE,
  VIDEO_WORKSPACES_STORE,
  VIDEO_WORKSPACE_DRAFTS_STORE,
  VIDEO_WORKSPACE_HISTORY_STORE,
  THUMBNAILS_STORE,
} from '../infrastructure/indexed-db/core';
import { captureMediaInTransaction } from '../sync-capture/capture';
import { abortIndexedDbMutation } from '../infrastructure/indexed-db/transaction';
import { runWithIndexedDbMutation } from '../infrastructure/indexed-db/mutation';
import type { MediaLibraryEntry } from './contracts';
import { parseMediaLibraryEntry } from './read-guards';
import { sameMediaSource } from './dependencies';

/** Legacy metadata compatibility: source creation and replacement belong to publication owners. */
export async function upsertMediaEntry(entry: MediaLibraryEntry): Promise<void> {
  await runWithIndexedDbMutation(async (db) => {
    const tx = db.transaction(
      [
        MEDIA_LIBRARY_STORE,
        SYNC_CAPTURE_STORE,
        ASSET_REFS_STORE,
        ASSET_OWNERS_STORE,
        IMAGE_WORKSPACES_STORE,
        AGGREGATE_PRESENTATIONS_STORE,
        PROJECT_ASSETS_STORE,
        PROJECT_EXPORTS_STORE,
        WEB_SNAPSHOTS_STORE,
        STORE_NAME,
        RECORDING_TELEMETRY_STORE,
        VIDEO_WORKSPACES_STORE,
        VIDEO_WORKSPACE_DRAFTS_STORE,
        VIDEO_WORKSPACE_HISTORY_STORE,
        THUMBNAILS_STORE,
      ],
      'readwrite'
    );
    try {
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
      await captureMediaInTransaction(tx, entry.id);
      await tx.done;
    } catch (error) {
      return abortIndexedDbMutation(tx, error);
    }
  });
}
