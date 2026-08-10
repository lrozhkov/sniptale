import {
  listMediaThumbnailIds,
  listMediaLibrary,
} from '../../composition/persistence/media-library/index.library.ts';
import { listVideoProjects } from '../../composition/persistence/projects/index';
import { listScenarioExportRecords } from '../../composition/persistence/scenario/store/project-records/exports';
import { listScenarioProjectSummaries } from '../../composition/persistence/scenario/store/project-records/index';
import {
  getStorageEstimateInfo,
  type StorageEstimateInfo,
} from '../../features/media-hub/storage-capacity';
import { createGalleryItems, type GalleryItem } from '../library/items';
import { isGalleryMediaItem } from '../library/items';
import { isGalleryVideoProjectItem } from '../library/items';
import { loadSettings } from '../../composition/persistence/settings';
import {
  DEFAULT_LOCAL_STORAGE_POLICY,
  getDraftRetentionMs,
} from '../../composition/persistence/library-lifecycle';
import { listAggregatePresentations } from '../../composition/persistence/aggregate-presentations';

async function loadScenarioExports(projectId: string) {
  return [projectId, await listScenarioExportRecords(projectId)] as const;
}

async function loadScenarioExportsByProject(projectIds: string[]) {
  return Promise.all(projectIds.map((projectId) => loadScenarioExports(projectId)));
}

export async function loadGalleryLibrarySnapshot(): Promise<{
  estimate: StorageEstimateInfo;
  nextItems: GalleryItem[];
}> {
  const [
    mediaItems,
    scenarioProjects,
    thumbnailIds,
    estimate,
    videoProjects,
    settings,
    presentations,
  ] = await Promise.all([
    listMediaLibrary(),
    listScenarioProjectSummaries(),
    listMediaThumbnailIds(),
    getStorageEstimateInfo(),
    listVideoProjects(),
    loadSettings().catch(() => ({ localStoragePolicy: DEFAULT_LOCAL_STORAGE_POLICY })),
    listAggregatePresentations(),
  ]);
  const scenarioExportsByProject = await loadScenarioExportsByProject(
    scenarioProjects.map((project) => project.id)
  );

  return {
    estimate,
    nextItems: createGalleryItems({
      mediaItems,
      presentations,
      scenarioExportsByProjectId: new Map(scenarioExportsByProject),
      scenarioProjects,
      thumbnailIds: new Set(thumbnailIds),
      videoProjects,
    }).map((item) => {
      if (item.lifecycle?.storageClass !== 'temporary') return item;
      const retention = getDraftRetentionMs(
        settings.localStoragePolicy,
        (isGalleryMediaItem(item) && item.source.kind === 'recording') ||
          (isGalleryVideoProjectItem(item) && item.project.retentionKind === 'video')
          ? 'video'
          : 'ordinary'
      );
      return {
        ...item,
        expiresAt: retention === null ? null : item.lifecycle.updatedAt + retention,
      };
    }),
  };
}
