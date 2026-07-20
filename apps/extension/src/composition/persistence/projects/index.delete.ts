import { runWithIndexedDbMutation } from '../infrastructure/indexed-db/mutation';
import {
  collectProjectOwnedAssetIds,
  deleteProjectAssetsUnreferencedByOtherProjects,
} from './asset-references';
import { createProjectMutationStores } from './mutation-stores';
import { parseVideoProjectEntry } from './read-guards';

export async function deleteVideoProject(id: string): Promise<string[]> {
  return runWithIndexedDbMutation(async (db) => {
    const { mediaLibraryStore, projectAssetStore, projectStore, tx } =
      createProjectMutationStores(db);
    const existing = parseVideoProjectEntry(await projectStore.get(id));
    const projectAssetIds = collectProjectOwnedAssetIds(existing?.project);

    await projectStore.delete(id);
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
