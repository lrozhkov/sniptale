import { getVideoProject, getProjectAsset } from '../../../composition/persistence/projects';
import { getMediaAssetBlob } from '../../../composition/persistence/media-library';
import { getRecording } from '../../../composition/persistence/recordings';
import {
  getScenarioAsset,
  getScenarioProjectEntry,
} from '../../../composition/persistence/scenario/projects';
import { getScenarioAssetBlob } from '../../../composition/persistence/scenario/store/public';
import { createProjectCoverService } from '../../../workflows/project-covers';
import type { GalleryItem } from './types';

const covers = createProjectCoverService({
  getVideoProject,
  getProjectAsset,
  getMediaAssetBlob,
  getRecording,
  getScenarioAsset,
  getScenarioProjectEntry,
  getScenarioAssetBlob,
});

/** Maps Gallery availability and revision to a disposable project cover request. */
export function getGalleryProjectCover(
  item: GalleryItem,
  signal?: AbortSignal
): Promise<Blob | undefined> {
  if (
    (item.type !== 'scenario' && item.type !== 'video-project') ||
    (item.type === 'scenario' && item.project.availability !== 'available') ||
    (item.type === 'video-project' && item.unavailableReason !== null)
  )
    return Promise.resolve(undefined);
  return covers.getCover(
    {
      kind: item.type,
      id: item.entityId,
      workspaceRevision: item.workspaceRevision ?? 0,
      ...(item.lifecycle?.trashedAt === undefined ? {} : { trashedAt: item.lifecycle.trashedAt }),
    },
    signal
  );
}
