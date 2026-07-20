import { deleteMediaThumbnail } from '../../composition/persistence/media-library/index';
import {
  deleteProjectExport,
  deleteVideoProject,
  listProjectExports,
  listVideoProjects,
} from '../../composition/persistence/projects/index';
import { deleteRecording } from '../../composition/persistence/recordings/index';
import { deleteVideoPreviewCacheProjectRecords } from '../../composition/persistence/video-preview-cache';
import type { VideoProjectListItem } from '../../features/media-hub/video-project-list-items';
import { translate } from '../../platform/i18n';
import { withMediaHubWriteGuard } from '../../features/media-hub/storage-errors';
import { publishMediaHubLibraryChanged } from '../../features/media-hub/events';

async function deleteProjectExportArtifacts(projectId: string): Promise<string[]> {
  const exports = await listProjectExports(projectId);

  await Promise.all(
    exports.map(async (entry) => {
      await deleteProjectExport(entry.id);
      await deleteRecording(entry.recordingId);
      await deleteMediaThumbnail(`export:${entry.id}`);
    })
  );

  return exports.map((entry) => `export:${entry.id}`);
}

async function deleteProjectAssetThumbnails(assetIds: string[]): Promise<void> {
  await Promise.all(assetIds.map((assetId) => deleteMediaThumbnail(`project-asset:${assetId}`)));
}

export async function deletePersistedVideoProject(
  projectId: string
): Promise<VideoProjectListItem[]> {
  let changedIds: string[] = [];

  await withMediaHubWriteGuard(translate('shared.mediaHub.deleteVideoProjectAction'), async () => {
    await deleteVideoPreviewCacheProjectRecords(projectId);
    const exportIds = await deleteProjectExportArtifacts(projectId);
    await deleteMediaThumbnail(`video-project:${projectId}`);
    const deletedProjectAssetIds = await deleteVideoProject(projectId);
    await deleteProjectAssetThumbnails(deletedProjectAssetIds);
    changedIds = [
      `video-project:${projectId}`,
      ...exportIds,
      ...deletedProjectAssetIds.map((assetId) => `project-asset:${assetId}`),
    ];
  });

  publishMediaHubLibraryChanged('delete', changedIds);
  return listVideoProjects();
}
