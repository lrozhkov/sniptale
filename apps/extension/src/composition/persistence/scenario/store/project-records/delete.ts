import { deleteScenarioProject, listScenarioExports } from '../../projects';
import { deleteMediaThumbnail } from '../../../media-library/index.library.ts';
import { publishMediaHubLibraryChanged } from '../../../../../features/media-hub/events';

/**
 * Deletes a scenario project and all project-local artifacts.
 */
export async function deleteScenarioProjectRecord(projectId: string): Promise<void> {
  const exports = await listScenarioExports(projectId);

  await deleteScenarioProject(projectId);
  await Promise.all([
    deleteMediaThumbnail(`scenario:${projectId}`),
    ...exports.map((entry) => deleteMediaThumbnail(`scenario-export:${entry.id}`)),
  ]);
  publishMediaHubLibraryChanged('delete', [
    `scenario:${projectId}`,
    ...exports.map((entry) => `scenario-export:${entry.id}`),
  ]);
}
