import {
  deleteMediaLibraryAsset,
  deleteMediaThumbnail,
} from '../../composition/persistence/media-library/index';
import { deleteDiagnostics } from '../../composition/persistence/diagnostics/index';
import { deleteEditorSessionDraft } from '../../composition/persistence/editor-sessions/index';
import { deleteRecording } from '../../composition/persistence/recordings/index';
import { deleteScenarioStepEditorDocument } from '../../composition/persistence/scenario/editor-documents/index';
import {
  deletePendingScenarioAsset,
  deleteScenarioAsset,
  deleteScenarioExport,
} from '../../composition/persistence/scenario/projects';
import { deleteProjectAsset } from '../../composition/persistence/projects/index';
import { publishMediaHubLibraryChanged } from '../../features/media-hub/events';
import { withMediaHubWriteGuard } from '../../features/media-hub/storage-errors';
import type { StorageCleanupCandidate, StorageCleanupReport } from '../../features/media-hub/types';
import { translate } from '../../platform/i18n';
import { collectStorageCleanupReport } from './assembly';

async function deleteStorageCleanupCandidate(candidate: StorageCleanupCandidate): Promise<void> {
  switch (candidate.target) {
    case 'asset':
      await deleteMediaLibraryAsset(candidate.id);
      return;
    case 'recording':
      await deleteRecording(candidate.id);
      return;
    case 'project-asset':
      await deleteProjectAsset(candidate.id);
      return;
    case 'thumbnail':
      await deleteMediaThumbnail(candidate.id);
      return;
    case 'editor-session':
      await deleteEditorSessionDraft(candidate.id);
      return;
    case 'scenario-pending-asset':
      await deletePendingScenarioAsset(candidate.id);
      return;
    case 'scenario-asset':
      await deleteScenarioAsset(candidate.id);
      return;
    case 'scenario-export':
      await deleteScenarioExport(candidate.id);
      return;
    case 'scenario-step-document':
      await deleteScenarioStepEditorDocument(candidate.id);
      return;
    case 'diagnostics':
      await deleteDiagnostics(candidate.id);
  }
}

export async function deleteStorageCleanupCandidatesSafely(
  candidates: StorageCleanupCandidate[]
): Promise<void> {
  await withMediaHubWriteGuard(
    translate('shared.mediaHub.deleteStorageCleanupAction'),
    async () => {
      for (const candidate of candidates) {
        await deleteStorageCleanupCandidate(candidate);
      }
    }
  );
  publishMediaHubLibraryChanged(
    'cleanup',
    candidates.map((candidate) => candidate.id)
  );
}

export function getStorageCleanupReport(topN = 10): Promise<StorageCleanupReport> {
  return collectStorageCleanupReport(topN);
}
