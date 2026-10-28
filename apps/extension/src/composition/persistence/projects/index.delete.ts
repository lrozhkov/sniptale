import type { IDBPTransaction } from 'idb';
import type { PhysicalDeleteAssetOperation } from '../assets';
import {
  AGGREGATE_PRESENTATIONS_STORE,
  VIDEO_PROJECTS_STORE,
} from '../infrastructure/indexed-db/core.stores';
import { retainVideoProjectRevisionInTransaction } from './revisions';
import { captureDeletionInTransaction } from '../sync-capture/capture';
import { runWithIndexedDbMutation } from '../infrastructure/indexed-db/mutation';
import {
  collectProjectOwnedAssetIds,
  deleteProjectAssetsUnreferencedByOtherProjects,
} from './asset-references';
import { createProjectDeletionStores } from './mutation-stores';
import { parseVideoProjectEntry } from './read-guards';
import { buildPhysicalDeleteOperation, completePhysicalDeleteOperation } from '../assets';
import { recoverProjectMediaPublications } from './asset-publication';

/** Delete an admitted project in the caller transaction without capture or transaction completion. */
export async function deleteVideoProjectInTransaction(
  tx: IDBPTransaction<unknown, string[], 'readwrite'>,
  id: string,
  operation: PhysicalDeleteAssetOperation
): Promise<string[]> {
  const projects = tx.objectStore(VIDEO_PROJECTS_STORE);
  const existing = parseVideoProjectEntry(await projects.get(id));
  const projectAssetIds = collectProjectOwnedAssetIds(existing?.project);
  if (existing)
    await retainVideoProjectRevisionInTransaction(tx, id, existing.workspaceRevision ?? 0);
  await projects.delete(id);
  await tx.objectStore(AGGREGATE_PRESENTATIONS_STORE).delete(['video-project', id]);
  return deleteProjectAssetsUnreferencedByOtherProjects({ tx, operation, projectAssetIds });
}

export async function deleteVideoProject(id: string): Promise<string[]> {
  await recoverProjectMediaPublications();
  const physicalDelete = buildPhysicalDeleteOperation([]);
  const deletedProjectAssetIds = await runWithIndexedDbMutation(async (db) => {
    const { assetOperationStore, projectStore, tx } = createProjectDeletionStores(db);
    try {
      const existing = parseVideoProjectEntry(await projectStore.get(id));
      const deletedProjectAssetIds = await deleteVideoProjectInTransaction(tx, id, physicalDelete);
      if (physicalDelete.assetIds.length > 0) await assetOperationStore.put(physicalDelete);
      if (existing) await captureDeletionInTransaction(tx, 'video-project', id);
      await tx.done;
      return deletedProjectAssetIds;
    } catch (error) {
      try {
        tx.abort();
      } catch {
        /* Transaction may already be closed. */
      }
      await tx.done.catch(() => undefined);
      throw error;
    }
  });
  if (physicalDelete.assetIds.length > 0) await completePhysicalDeleteOperation(physicalDelete);
  return deletedProjectAssetIds;
}
