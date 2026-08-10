import { runWithIndexedDbMutation } from '../infrastructure/indexed-db/mutation';
import {
  collectProjectOwnedAssetIds,
  deleteProjectAssetsUnreferencedByOtherProjects,
} from './asset-references';
import { createProjectDeletionStores } from './mutation-stores';
import { parseVideoProjectEntry } from './read-guards';

export async function deleteVideoProject(id: string): Promise<string[]> {
  return runWithIndexedDbMutation(async (db) => {
    const { aggregatePresentationStore, mediaLibraryStore, projectAssetStore, projectStore, tx } =
      createProjectDeletionStores(db);
    const existing = parseVideoProjectEntry(await projectStore.get(id));
    const projectAssetIds = collectProjectOwnedAssetIds(existing?.project);

    await projectStore.delete(id);
    await aggregatePresentationStore.delete(['video-project', id]);
    const deletedProjectAssetIds = await deleteProjectAssetsUnreferencedByOtherProjects({
      mediaLibraryStore,
      ownerProjectId: id,
      projectAssetIds,
      projectAssetStore,
      projectStore,
    });
    await tx.done;
    return deletedProjectAssetIds;
  });
}
