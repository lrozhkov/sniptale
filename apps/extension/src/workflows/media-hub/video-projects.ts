import { deleteMediaThumbnail } from '../../composition/persistence/media-library/index';
import {
  deleteProjectExport,
  deleteVideoProject,
  listProjectExports,
  listVideoProjects,
} from '../../composition/persistence/projects/index';
import { deleteVideoPreviewCacheProjectRecords } from '../../composition/persistence/video-preview-cache';
import type { VideoProjectListItem } from '../../features/media-hub/video-project-list-items';
import { translate } from '../../platform/i18n';
import { withMediaHubWriteGuard } from '../../features/media-hub/storage-errors';
import { publishMediaHubLibraryChanged } from '../../features/media-hub/events';
import { tryCollectProjectOriginal } from './project-original-cleanup';

async function deleteProjectExportArtifacts(projectId: string): Promise<string[]> {
  const exports = await listProjectExports(projectId);

  await Promise.all(
    exports.map(async (entry) => {
      await deleteProjectExport(entry.id);
      await deleteMediaThumbnail(`export:${entry.id}`);
    })
  );

  return exports.map((entry) => `export:${entry.id}`);
}

async function deleteProjectAssetThumbnails(assetIds: string[]): Promise<void> {
  await Promise.all(assetIds.map((assetId) => deleteMediaThumbnail(`project-asset:${assetId}`)));
}

export async function purgePersistedVideoProject(
  projectId: string,
  options: { preserveExports?: boolean; releaseUnclaimedOriginal?: boolean } = {}
): Promise<void> {
  let changedIds: string[] = [];

  await withMediaHubWriteGuard(translate('shared.mediaHub.deleteVideoProjectAction'), async () => {
    await deleteVideoPreviewCacheProjectRecords(projectId);
    // Trash purges only the confirmed root; published exports have independent lifecycles.
    const exportIds = options.preserveExports ? [] : await deleteProjectExportArtifacts(projectId);
    await deleteMediaThumbnail(`video-project:${projectId}`);
    const { deletedProjectAssetIds, originalMediaIds } = await deleteVideoProject(projectId);
    await deleteProjectAssetThumbnails(deletedProjectAssetIds);
    if (options.releaseUnclaimedOriginal !== false)
      for (const id of originalMediaIds) await tryCollectProjectOriginal(id);
    changedIds = [
      `video-project:${projectId}`,
      ...exportIds,
      ...deletedProjectAssetIds.map((assetId) => `project-asset:${assetId}`),
    ];
  });

  publishMediaHubLibraryChanged('delete', changedIds);
}

export async function deletePersistedVideoProject(
  projectId: string,
  options: { preserveExports?: boolean } = {}
): Promise<VideoProjectListItem[]> {
  await purgePersistedVideoProject(projectId, options);
  return listVideoProjects();
}
