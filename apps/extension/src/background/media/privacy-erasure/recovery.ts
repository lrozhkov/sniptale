import {
  clearProjectExportJobLedgerForPrivacyErasure,
  inspectActiveProjectExportJobLedgerEntry,
} from '../../../composition/persistence/export-ledger';
import {
  clearActiveVideoRecordingLease,
  ensureActiveVideoRecordingLeaseHydrated,
} from '../video/recording-control-lease';
import { waitForStopSideEffects } from '../video/runtime/manager/controls.stop/effects';
import { closeOffscreenDocumentForPrivacyErasure } from '../../offscreen-document/service';
import { inspectPersistedLease } from '../../storage/video/recording-control-lease';
import {
  cleanupVideoCaptureSurfacesForPrivacyErasure,
  resetRecordingRuntimeStateForPrivacyErasure,
} from './recording';
import {
  failed,
  failedExportParticipants,
  RECORDING_PARTICIPANT_ID,
  verified,
  verifiedExportParticipants,
} from './result';
import { releaseVideoRecordingSurface } from '../video/content-surface/surface-lease';

export async function recoverInvalidDurableMediaState() {
  let containmentFailed = false;
  try {
    await releaseVideoRecordingSurface();
  } catch {
    containmentFailed = true;
  }
  try {
    await closeOffscreenDocumentForPrivacyErasure();
  } catch {
    containmentFailed = true;
  }
  if (containmentFailed) {
    return [
      failed(RECORDING_PARTICIPANT_ID, 'invalid-media-state-recovery-failed'),
      ...failedExportParticipants('invalid-media-state-recovery-failed'),
    ];
  }
  try {
    await waitForStopSideEffects();
    if (!(await cleanupVideoCaptureSurfacesForPrivacyErasure())) {
      throw new Error('invalid-media-state-surface-recovery-unverified');
    }
    await clearActiveVideoRecordingLease();
    await clearProjectExportJobLedgerForPrivacyErasure();

    const [recordingVerification, exportVerification] = await Promise.all([
      inspectPersistedLease(),
      inspectActiveProjectExportJobLedgerEntry(),
    ]);
    if (recordingVerification.status !== 'absent' || exportVerification.status !== 'absent') {
      return [
        failed(RECORDING_PARTICIPANT_ID, 'invalid-media-state-recovery-unverified'),
        ...failedExportParticipants('invalid-media-state-recovery-unverified'),
      ];
    }
    if (await ensureActiveVideoRecordingLeaseHydrated()) {
      return [
        failed(RECORDING_PARTICIPANT_ID, 'invalid-media-state-recovery-unverified'),
        ...failedExportParticipants('invalid-media-state-recovery-unverified'),
      ];
    }
  } catch {
    return [
      failed(RECORDING_PARTICIPANT_ID, 'invalid-media-state-recovery-failed'),
      ...failedExportParticipants('invalid-media-state-recovery-failed'),
    ];
  }

  resetRecordingRuntimeStateForPrivacyErasure();
  return [verified(RECORDING_PARTICIPANT_ID), ...verifiedExportParticipants()];
}
