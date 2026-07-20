import { ensurePersistentStorage } from '../../../../composition/persistence/infrastructure/indexed-db/core';
import { cleanupOldRecordings } from '../../../../composition/persistence/recordings/index';
import { initializeAiStorageAccess } from '../../../../composition/persistence/ai-settings/init';
import { cleanupExpiredProjectExportInputs } from '../../../../composition/persistence/project-export-inputs';
import {
  cleanupCapture,
  reconcileCaptureJobDownloadOnStartup,
  reconcileCaptureJobsOnStartup,
} from '../../../capture/lifecycle';
import { recoverInterruptedSessions } from '../../../diagnostics/lifecycle';
import { reconcileBackgroundRuntimeStartupState } from '../../../application/runtime-state';
import {
  reconcileVideoRecordingLeaseOnStartup,
  resetVideoRecordingRuntimeState,
} from '../../../media/lifecycle';
import {
  STARTUP_RECORDINGS_RETENTION_DAYS,
  type BackgroundModeState,
  type RuntimeWiringLogger,
} from './shared';

export function runStartupMaintenance(
  state: BackgroundModeState,
  logger: RuntimeWiringLogger
): void {
  reconcileBackgroundRuntimeStartupState(state);

  ensurePersistentStorage().catch((error) => {
    logger.warn('Failed to request persistent storage', error);
  });

  cleanupOldRecordings(STARTUP_RECORDINGS_RETENTION_DAYS).catch((error) => {
    logger.warn('IDB cleanup failed (non-critical)', error);
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

  resetVideoRecordingRuntimeState();
  reconcileVideoRecordingLeaseOnStartup();
}
