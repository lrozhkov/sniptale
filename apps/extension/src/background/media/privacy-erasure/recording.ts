import type { ErasureParticipantResult } from '@sniptale/runtime-contracts/privacy-erasure/types';

import {
  clearActiveVideoRecordingLease,
  ensureActiveVideoRecordingLeaseHydrated,
} from '../video/recording-control-lease';
import {
  getCurrentRecordingId,
  resetRecordingId,
  resetRecordingTabId,
  stopRecordingForPrivacyErasure,
} from '../video/runtime/manager';
import {
  quiesceViewportEmulationForPrivacyErasure,
  waitForStopSideEffects,
} from '../video/runtime/manager/controls.stop/effects';
import { resetVideoRecordingRuntimeState } from '../video/runtime/session-state';
import { finishVideoRecordingStop, resetVideoRecordingStartSession } from '../video/session-state';
import { inspectPersistedLease } from '../../storage/video/recording-control-lease';
import { failed, RECORDING_PARTICIPANT_ID, verified } from './result';

export function resetRecordingRuntimeStateForPrivacyErasure(): void {
  finishVideoRecordingStop();
  resetRecordingId();
  resetRecordingTabId();
  resetVideoRecordingStartSession();
  resetVideoRecordingRuntimeState();
}

async function cleanupRecordingDebugger(): Promise<boolean> {
  try {
    await quiesceViewportEmulationForPrivacyErasure();
    return true;
  } catch {
    return false;
  }
}

async function cleanupRecordingLease(
  recordingId: string | null
): Promise<ErasureParticipantResult | null> {
  try {
    if (recordingId) {
      await clearActiveVideoRecordingLease(recordingId);
    }
    const verifiedLease = await inspectPersistedLease();
    if (verifiedLease.status !== 'absent' || (await ensureActiveVideoRecordingLeaseHydrated())) {
      return failed(RECORDING_PARTICIPANT_ID, 'recording-lease-verification-failed');
    }
    return null;
  } catch {
    return failed(RECORDING_PARTICIPANT_ID, 'recording-lease-cleanup-failed');
  }
}

export async function cleanupRecording(): Promise<ErasureParticipantResult> {
  let lease;
  try {
    lease = await ensureActiveVideoRecordingLeaseHydrated();
  } catch {
    return failed(RECORDING_PARTICIPANT_ID, 'recording-lease-hydration-failed');
  }

  const recordingId = lease?.recordingId ?? getCurrentRecordingId();
  if (recordingId) {
    let stopResult: Awaited<ReturnType<typeof stopRecordingForPrivacyErasure>>;
    try {
      stopResult = await stopRecordingForPrivacyErasure();
      await waitForStopSideEffects();
    } catch {
      return failed(RECORDING_PARTICIPANT_ID, 'recording-stop-failed');
    }

    if (stopResult.result === 'failed') {
      return failed(RECORDING_PARTICIPANT_ID, 'recording-stop-failed');
    }
    if (stopResult.result === 'already-stopping') {
      return failed(RECORDING_PARTICIPANT_ID, 'recording-stop-in-progress');
    }
    if (stopResult.result === 'no-active-recording') {
      return failed(RECORDING_PARTICIPANT_ID, 'recording-runtime-state-unavailable');
    }
  } else {
    await waitForStopSideEffects();
  }

  if (!(await cleanupRecordingDebugger())) {
    return failed(RECORDING_PARTICIPANT_ID, 'recording-debugger-cleanup-failed');
  }

  const leaseFailure = await cleanupRecordingLease(recordingId);
  if (leaseFailure) {
    return leaseFailure;
  }

  resetRecordingRuntimeStateForPrivacyErasure();
  return verified(RECORDING_PARTICIPANT_ID);
}
