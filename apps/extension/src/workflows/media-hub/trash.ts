import type { LocalStoragePolicy } from '../../contracts/settings';
import type { LibraryLifecycle } from '../../composition/persistence/library-lifecycle/contracts';
import type { LibraryTrashTarget } from '../../composition/persistence/library-lifecycle/trash';
import {
  moveStoredItemsToTrash,
  restoreStoredItemsFromTrash,
  runWithTrashedStoredItem,
  runWithStoredItemLifecycle,
  StaleTrashItemError,
} from '../../composition/persistence/library-lifecycle/trash';
import { listMediaLibrary } from '../../composition/persistence/media-library';
import { listVideoProjectEntries } from '../../composition/persistence/projects';
import {
  listScenarioProjectEntries,
  listScenarioExports,
  deleteScenarioExport,
} from '../../composition/persistence/scenario/projects';
import { deleteMediaThumbnail } from '../../composition/persistence/media-library/index.library.ts';
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
  target: LibraryTrashTarget;
  trashedAt: number;
}

export async function moveLibraryItemsToTrash(targets: LibraryTrashTarget[]): Promise<void> {
  await moveStoredItemsToTrash(targets);
  publishMediaHubLibraryChanged(
    'update',
    targets.map((target) => target.id)
  );
}

export async function restoreLibraryTrashItems(targets: LibraryTrashTarget[]): Promise<void> {
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
    await deleteLibraryTarget(entry.target, expectedUsage);
  });
  publishMediaHubLibraryChanged('delete', [entry.target.id]);
}

/** Release only the confirmed root through its existing aggregate/resource owner. */
async function deleteLibraryTarget(
  target: LibraryTrashTarget,
  expectedUsage?: readonly MediaAssetProjectUsage[]
): Promise<void> {
  if (target.kind === 'media') {
    await deleteMediaLibraryAssetsBatchSafely(
      [target.id],
      new Map([[target.id, expectedUsage ?? []]])
    );
  } else if (target.kind === 'scenario-project') {
    await deleteScenarioProjectRecord(target.id);
  } else if (target.kind === 'video-project') {
    await deletePersistedVideoProject(target.id, { preserveExports: true });
  } else {
    await deleteScenarioExport(target.id);
    await deleteMediaThumbnail(`scenario-export:${target.id}`);
  }
}

/** Explicitly confirmed manual deletion accepts both active and retained Trash roots. */
export async function permanentlyDeleteLibraryItem(
  entry: {
    target: LibraryTrashTarget;
    lifecycle: Pick<LibraryLifecycle, 'updatedAt' | 'trashedAt'>;
  },
  expectedUsage?: readonly MediaAssetProjectUsage[]
): Promise<void> {
  await runWithStoredItemLifecycle(entry.target, entry.lifecycle, () =>
    deleteLibraryTarget(entry.target, expectedUsage)
  );
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
  const append = (target: LibraryTrashTarget, trashedAt: number | undefined) => {
    if (trashedAt !== undefined && trashedAt <= cutoff) candidates.push({ target, trashedAt });
  };
  scenarios.forEach((item) =>
    append({ kind: 'scenario-project', id: item.id }, item.lifecycle?.trashedAt)
  );
  const exports = (await Promise.all(scenarios.map((item) => listScenarioExports(item.id)))).flat();
  exports.forEach((item) =>
    append({ kind: 'scenario-export', id: item.id }, item.trashState?.trashedAt)
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
