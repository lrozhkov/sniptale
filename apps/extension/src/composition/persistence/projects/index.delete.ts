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
    const {
      aggregatePresentationStore,
      assetOperationStore,
      assetOwnerStore,
      assetRefStore,
      mediaLibraryStore,
      projectAssetStore,
      projectStore,
      tx,
    } = createProjectDeletionStores(db);
    const existing = parseVideoProjectEntry(await projectStore.get(id));
    const projectAssetIds = collectProjectOwnedAssetIds(existing?.project);

    await projectStore.delete(id);
    await aggregatePresentationStore.delete(['video-project', id]);
    const deletedProjectAssetIds = await deleteProjectAssetsUnreferencedByOtherProjects({
      assetOwnerStore,
      assetRefStore,
      mediaLibraryStore,
      operation: physicalDelete,
      ownerProjectId: id,
      projectAssetIds,
      projectAssetStore,
      projectStore,
    });
    if (physicalDelete.assetIds.length > 0) await assetOperationStore.put(physicalDelete);
    await tx.done;
    return deletedProjectAssetIds;
  });
  if (physicalDelete.assetIds.length > 0) await completePhysicalDeleteOperation(physicalDelete);
  return deletedProjectAssetIds;
}
