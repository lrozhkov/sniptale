import { runWithIndexedDbMutation } from '../infrastructure/indexed-db/mutation';
import {
  collectProjectOwnedAssetIds,
  deleteProjectAssetsUnreferencedByOtherProjects,
} from './asset-references';
import { createProjectDeletionStores } from './mutation-stores';
import { parseVideoProjectEntry } from './read-guards';
import { buildPhysicalDeleteOperation, completePhysicalDeleteOperation } from '../assets';
import { recoverProjectMediaPublications } from './asset-publication';

export async function deleteVideoProject(id: string): Promise<string[]> {
  await recoverProjectMediaPublications();
  const physicalDelete = buildPhysicalDeleteOperation([]);
  const deletedProjectAssetIds = await runWithIndexedDbMutation(async (db) => {
    const { aggregatePresentationStore, assetOperationStore, projectStore, tx } =
      createProjectDeletionStores(db);
    try {
      const existing = parseVideoProjectEntry(await projectStore.get(id));
      const projectAssetIds = collectProjectOwnedAssetIds(existing?.project);

      await projectStore.delete(id);
      await aggregatePresentationStore.delete(['video-project', id]);
      const deletedProjectAssetIds = await deleteProjectAssetsUnreferencedByOtherProjects({
        tx,
        operation: physicalDelete,
        projectAssetIds: projectAssetIds,
      });
      if (physicalDelete.assetIds.length > 0) await assetOperationStore.put(physicalDelete);
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
