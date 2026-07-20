import {
  deleteScenarioAsset,
  deleteScenarioExport,
  deleteScenarioProject,
  listScenarioAssets,
  listScenarioExports,
} from '../../projects';
import { deleteMediaThumbnail } from '../../../media-library/index.library.ts';
import {
  deleteScenarioStepEditorDocumentRecord,
  listScenarioStepEditorDocumentRecords,
} from '../step-editor-documents/index';
import { publishMediaHubLibraryChanged } from '../../../../../features/media-hub/events';

/**
 * Deletes a scenario project and all project-local artifacts.
 */
export async function deleteScenarioProjectRecord(projectId: string): Promise<void> {
  const [assets, exports, stepDocuments] = await Promise.all([
    listScenarioAssets(projectId),
    listScenarioExports(projectId),
    listScenarioStepEditorDocumentRecords(projectId),
  ]);

  await Promise.all([
    ...assets.map((asset) => deleteScenarioAsset(asset.id)),
    ...exports.map((entry) => deleteScenarioExport(entry.id)),
    deleteMediaThumbnail(`scenario:${projectId}`),
    ...exports.map((entry) => deleteMediaThumbnail(`scenario-export:${entry.id}`)),
    ...stepDocuments.map((entry) => deleteScenarioStepEditorDocumentRecord(entry.stepId)),
  ]);
  await deleteScenarioProject(projectId);
  publishMediaHubLibraryChanged('delete', [
    `scenario:${projectId}`,
    ...exports.map((entry) => `scenario-export:${entry.id}`),
  ]);
}
