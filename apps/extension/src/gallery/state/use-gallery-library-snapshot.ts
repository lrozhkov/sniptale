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
  const [mediaItems, scenarioProjects, thumbnailIds, estimate, videoProjects] = await Promise.all([
    listMediaLibrary(),
    listScenarioProjectSummaries(),
    listMediaThumbnailIds(),
    getStorageEstimateInfo(),
    listVideoProjects(),
  ]);
  const scenarioExportsByProject = await loadScenarioExportsByProject(
    scenarioProjects.map((project) => project.id)
  );

  return {
    estimate,
    nextItems: createGalleryItems({
      mediaItems,
      scenarioExportsByProjectId: new Map(scenarioExportsByProject),
      scenarioProjects,
      thumbnailIds: new Set(thumbnailIds),
      videoProjects,
    }),
  };
}
