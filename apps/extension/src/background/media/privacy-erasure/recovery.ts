import {
  clearProjectExportJobLedgerForPrivacyErasure,
  inspectActiveProjectExportJobLedgerEntry,
} from '../../../composition/persistence/export-ledger';
import {
  clearActiveVideoRecordingLease,
  ensureActiveVideoRecordingLeaseHydrated,
} from '../video/recording-control-lease';
import { waitForStopSideEffects } from '../video/runtime/manager/controls.stop/effects';
import { closeOffscreenDocumentForPrivacyErasure } from '../video/runtime/offscreen-manager';
import { inspectPersistedLease } from '../../storage/video/recording-control-lease';
import { resetRecordingRuntimeStateForPrivacyErasure } from './recording';
import {
  failed,
  failedExportParticipants,
  RECORDING_PARTICIPANT_ID,
  verified,
  verifiedExportParticipants,
} from './result';

export async function recoverInvalidDurableMediaState() {
  try {
    await closeOffscreenDocumentForPrivacyErasure();
    await waitForStopSideEffects();
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
