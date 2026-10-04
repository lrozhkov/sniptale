import { MEDIA_LIBRARY_STORE } from '../infrastructure/indexed-db/core';
import { runWithIndexedDbMutation } from '../infrastructure/indexed-db/mutation';
import {
  buildProjectAssetMediaEntry,
  buildProjectExportMediaEntry,
  buildRecordingMediaEntry,
  mergeMediaEntry,
} from './entry-mapping';
import { createProjectAssetMediaId } from '../../../features/media-hub/media-id';
import { listAllProjectExports, listProjectAssets } from '../projects/index';
import { listRecordings } from '../recordings/index';
import type { MediaLibraryEntry } from './contracts';
import { parseMediaLibraryEntry } from './read-guards';
import { createLibraryLifecycle } from '../library-lifecycle/contracts';
import { backfillScenarioLibraryAssets } from '../scenario/library-publication';

/** Compatibility metadata refresh cannot publish private project memberships or erase source evidence. */
export async function syncLegacyMediaLibrary(): Promise<void> {
  await backfillScenarioLibraryAssets();
  const [recordings, projectExports, projectAssets] = await Promise.all([
    listRecordings(),
    listAllProjectExports(),
    listProjectAssets(),
  ]);
  await runWithIndexedDbMutation(async (db) => {
    const tx = db.transaction(MEDIA_LIBRARY_STORE, 'readwrite');
    try {
      const store = tx.objectStore(MEDIA_LIBRARY_STORE);
      const currentEntries = (await store.getAll())
        .map(parseMediaLibraryEntry)
        .filter((entry): entry is MediaLibraryEntry => entry !== null);
      const current = new Map(currentEntries.map((entry) => [entry.id, entry]));
      for (const recording of recordings) {
        const entry = buildRecordingMediaEntry(recording);
        await store.put(mergeMediaEntry(current.get(entry.id), entry));
      }
      for (const exported of projectExports) {
        const entry = buildProjectExportMediaEntry(exported);
        await store.put(mergeMediaEntry(current.get(entry.id), entry));
      }
      for (const asset of projectAssets) {
        const existing = current.get(createProjectAssetMediaId(asset.id));
        if (!existing) continue;
        if (existing.source.kind !== 'project-asset' || existing.source.projectAssetId !== asset.id)
          throw new Error('Legacy material identity conflicts with its source.');
        await store.put(
          mergeMediaEntry(existing, {
            ...buildProjectAssetMediaEntry(asset),
            filename: asset.filename,
            originalFilename: asset.filename,
            lifecycle: existing.lifecycle ?? createLibraryLifecycle('library', asset.createdAt),
          })
        );
      }
      await tx.done;
    } catch (error) {
      try {
        tx.abort();
      } catch {
        /* The transaction may already have aborted. */
      }
      await tx.done.catch(() => undefined);
      throw error;
    }
  });
}
