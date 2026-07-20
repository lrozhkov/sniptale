import { listMediaLibrary } from '../../../composition/persistence/media-library/index';
import { listVideoProjects } from '../../../composition/persistence/projects/index';
import { listScenarioProjectSummaries } from '../../../composition/persistence/scenario/store/project-records';
import { loadBackupParts } from '../manifest';
import type { MediaHubBackupSummary } from '../contracts/types';

export async function inspectMediaHubBackup(file: Blob): Promise<MediaHubBackupSummary> {
  const { manifest, metadata } = await loadBackupParts(file);
  const [mediaItems, videoProjects, scenarioProjects] = await Promise.all([
    listMediaLibrary(),
    listVideoProjects(),
    listScenarioProjectSummaries(),
  ]);
  const existingIds = new Set(mediaItems.map((item) => item.id));
  const existingProjectIds = new Set([
    ...videoProjects.map((project) => `video-project:${project.id}`),
    ...scenarioProjects.map((project) => `scenario:${project.id}`),
  ]);
  const mediaConflicts = metadata.assets
    .map((asset) => asset.entry.id)
    .filter((assetId) => existingIds.has(assetId));
  const projectConflicts = [
    ...(metadata.videoProjects ?? []).map((project) => `video-project:${project.entry.id}`),
    ...(metadata.scenarioProjects ?? []).map((project) => `scenario:${project.entry.id}`),
  ].filter((projectId) => existingProjectIds.has(projectId));

  return {
    assetCount: metadata.assets.length,
    conflicts: [...mediaConflicts, ...projectConflicts],
    manifest,
    thumbnailCount: metadata.assets.filter((asset) => asset.thumbnailPath !== null).length,
  };
}
