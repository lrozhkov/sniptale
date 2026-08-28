import { ensurePersistentStorage } from '../../../../composition/persistence/infrastructure/indexed-db/core';
import { cleanupDrafts } from '../../../../composition/persistence/library-lifecycle';
import {
  loadSettings,
  removeRetiredSynchronizedSettings,
} from '../../../../composition/persistence/settings';
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
import { clearRetiredFullPageCaptureLease } from '../../../storage/full-page-capture';
import { clearRetiredDiagnosticSnapshots } from '../../../storage/diagnostics/active-sessions';
import { recoverInterruptedPagePackageJob } from '../../../capture/page-package/job/recovery';
import { reconcileBackgroundRuntimeStartupState } from '../../../application/runtime-state';
import {
  recoverVideoCaptureSurfaceOnStartup,
  resetVideoRecordingRuntimeState,
} from '../../../media/lifecycle';
import { type BackgroundModeState, type RuntimeWiringLogger } from './shared';
import { ensureActivePageAccessRuntime } from '../../../page-access/service';
import { recoverPendingVideoRecordingCameraPeerCleanup } from '../../../media/video/content-surface/camera-peer';

export function runStartupMaintenance(
  state: BackgroundModeState,
  logger: RuntimeWiringLogger
): void {
  reconcileBackgroundRuntimeStartupState(state);

  Promise.all([clearRetiredFullPageCaptureLease(), clearRetiredDiagnosticSnapshots()]).catch(
    (error) => {
      logger.warn('Retired diagnostics state cleanup failed (non-critical)', error);
    }
  );
  removeRetiredSynchronizedSettings().catch((error) => {
    logger.warn('Retired synchronized settings cleanup failed (non-critical)', error);
  });
  recoverInterruptedPagePackageJob().catch((error) => {
    logger.warn('Page Package restart reconciliation failed (non-critical)', error);
  });

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
  recoverPendingVideoRecordingCameraPeerCleanup().catch((error) => {
    logger.warn('Embedded camera peer retirement recovery failed', error);
  });
  recoverVideoCaptureSurfaceOnStartup(ensureActivePageAccessRuntime).catch((error) => {
    logger.warn('Capture surface recovery failed; new preset mutations remain blocked', error);
  });
}
