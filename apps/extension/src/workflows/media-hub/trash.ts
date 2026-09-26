import type { LocalStoragePolicy } from '../../contracts/settings';
import type { LibraryLifecycleTarget } from '../../composition/persistence/library-lifecycle';
import {
  moveStoredItemsToTrash,
  restoreStoredItemsFromTrash,
  runWithTrashedStoredItem,
  StaleTrashItemError,
} from '../../composition/persistence/library-lifecycle/trash';
import { listMediaLibrary } from '../../composition/persistence/media-library';
import { listVideoProjectEntries } from '../../composition/persistence/projects';
import { listScenarioProjectEntries } from '../../composition/persistence/scenario/projects';
import { deleteScenarioProjectRecord } from '../../composition/persistence/scenario/store/public';
import {
  listMediaAssetProjectUsage,
  type MediaAssetProjectUsage,
} from '../../composition/persistence/media-library/usage';
import { deleteMediaLibraryAssetsBatchSafely } from './store';
import { deletePersistedVideoProject } from './video-projects';
import { publishMediaHubLibraryChanged } from '../../features/media-hub/events';

/** A deletion preview is bound to the exact trash admission seen by the user. */
interface TrashDeletionTarget {
  target: LibraryLifecycleTarget;
  trashedAt: number;
}

export async function moveLibraryItemsToTrash(targets: LibraryLifecycleTarget[]): Promise<void> {
  await moveStoredItemsToTrash(targets);
  publishMediaHubLibraryChanged(
    'update',
    targets.map((target) => target.id)
  );
}

export async function restoreLibraryTrashItems(targets: LibraryLifecycleTarget[]): Promise<void> {
  await restoreStoredItemsFromTrash(targets);
  publishMediaHubLibraryChanged(
    'update',
    targets.map((target) => target.id)
  );
}

/** Confirmed manual purge retains the media owner's project usage revalidation. */
export async function permanentlyDeleteTrashItem(
  entry: TrashDeletionTarget,
  expectedUsage?: readonly MediaAssetProjectUsage[]
): Promise<void> {
  await runWithTrashedStoredItem(entry.target, entry.trashedAt, async () => {
    if (entry.target.kind === 'media') {
      await deleteMediaLibraryAssetsBatchSafely(
        [entry.target.id],
        new Map([[entry.target.id, expectedUsage ?? []]])
      );
    } else if (entry.target.kind === 'scenario-project') {
      await deleteScenarioProjectRecord(entry.target.id);
    } else {
      await deletePersistedVideoProject(entry.target.id, { preserveExports: true });
    }
  });
  publishMediaHubLibraryChanged('delete', [entry.target.id]);
}

/** Explicit Gallery maintenance; never run from a persistence read API. */
export async function cleanupLibraryTrash(
  policy: LocalStoragePolicy,
  now = Date.now()
): Promise<{ failedCount: number }> {
  if (!policy.trashCleanupEnabled) return { failedCount: 0 };
  const cutoff = now - (policy.trashRetentionDays ?? 30) * 86_400_000;
  const [media, videos, scenarios] = await Promise.all([
    listMediaLibrary(),
    listVideoProjectEntries(),
    listScenarioProjectEntries(),
  ]);
  const candidates: TrashDeletionTarget[] = [];
  const append = (target: LibraryLifecycleTarget, trashedAt: number | undefined) => {
    if (trashedAt !== undefined && trashedAt <= cutoff) candidates.push({ target, trashedAt });
  };
  scenarios.forEach((item) =>
    append({ kind: 'scenario-project', id: item.id }, item.lifecycle?.trashedAt)
  );
  videos.forEach((item) =>
    append({ kind: 'video-project', id: item.id }, item.lifecycle?.trashedAt)
  );
  media.forEach((item) => append({ kind: 'media', id: item.id }, item.lifecycle?.trashedAt));
  let failedCount = 0;
  for (const entry of candidates) {
    try {
      // Unattended cleanup cannot detach media from projects, including trashed projects.
      if (
        entry.target.kind === 'media' &&
        (await listMediaAssetProjectUsage(entry.target.id)).length > 0
      )
        continue;
      await permanentlyDeleteTrashItem(entry, []);
    } catch (error) {
      if (!(error instanceof StaleTrashItemError)) failedCount += 1;
    }
  }
  return { failedCount };
}
