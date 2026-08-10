import { ensurePersistentStorage } from '../../../../composition/persistence/infrastructure/indexed-db/core';
import { cleanupDrafts } from '../../../../composition/persistence/library-lifecycle';
import { loadSettings } from '../../../../composition/persistence/settings';
import { initializeAiStorageAccess } from '../../../../composition/persistence/ai-settings/init';
import { migrateHighlighterSystemPresetCatalog } from '../../../../composition/persistence/highlighter';
import { migrateCalloutSystemPresetCatalog } from '../../../../composition/persistence/callout-presets';
import { migrateStepBadgeSystemPresetCatalog } from '../../../../composition/persistence/step-badge-presets';
import { cleanupExpiredProjectExportInputs } from '../../../../composition/persistence/project-export-inputs';
import {
  cleanupCapture,
  reconcileCaptureJobDownloadOnStartup,
  reconcileCaptureJobsOnStartup,
} from '../../../capture/lifecycle';
import { recoverInterruptedSessions } from '../../../diagnostics/lifecycle';
import { reconcileBackgroundRuntimeStartupState } from '../../../application/runtime-state';
import {
  recoverVideoCaptureSurfaceOnStartup,
  resetVideoRecordingRuntimeState,
} from '../../../media/lifecycle';
import { type BackgroundModeState, type RuntimeWiringLogger } from './shared';
import { ensureActivePageAccessRuntime } from '../../page-access/service';

export function runStartupMaintenance(
  state: BackgroundModeState,
  logger: RuntimeWiringLogger
): void {
  reconcileBackgroundRuntimeStartupState(state);

  ensurePersistentStorage().catch((error) => {
    logger.warn('Failed to request persistent storage', error);
  });

  loadSettings()
    .then((settings) =>
      settings.localStoragePolicy.cleanupEnabled
        ? cleanupDrafts({ policy: settings.localStoragePolicy })
        : undefined
    )
    .catch((error) => {
      logger.warn('Draft cleanup failed (non-critical)', error);
    });

  cleanupExpiredProjectExportInputs().catch((error) => {
    logger.warn('Project export input cleanup failed (non-critical)', error);
  });

  recoverInterruptedSessions().catch((error) => {
    logger.warn('Diagnostics recovery failed (non-critical)', error);
  });

  reconcileCaptureJobsOnStartup({
    cleanupInterruptedCapture: cleanupCapture,
    reconcileExportingDownload: reconcileCaptureJobDownloadOnStartup,
  }).catch((error) => {
    logger.warn('Capture job reconciliation failed (non-critical)', error);
  });

  initializeAiStorageAccess().catch((error) => {
    logger.warn('AI storage initialization failed (non-critical)', error);
  });

  migrateHighlighterSystemPresetCatalog().catch((error) => {
    logger.warn('Highlighter preset catalog migration failed (non-critical)', error);
  });

  migrateCalloutSystemPresetCatalog().catch((error) => {
    logger.warn('Callout preset catalog migration failed (non-critical)', error);
  });

  migrateStepBadgeSystemPresetCatalog().catch((error) => {
    logger.warn('Step badge preset catalog migration failed (non-critical)', error);
  });

  resetVideoRecordingRuntimeState();
  recoverVideoCaptureSurfaceOnStartup(ensureActivePageAccessRuntime).catch((error) => {
    logger.warn('Capture surface recovery failed; new preset mutations remain blocked', error);
  });
}
