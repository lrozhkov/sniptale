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
import { waitForStopSideEffects } from '../video/runtime/manager/controls.stop/effects';
import { resetVideoRecordingRuntimeState } from '../video/runtime/session-state';
import { finishVideoRecordingStop, resetVideoRecordingStartSession } from '../video/session-state';
import { inspectPersistedLease } from '../../storage/video/recording-control-lease';
import { readCaptureSurfaceJournal } from '../../storage/capture-surface';
import { getCaptureSurfaceService } from '../../capture-surface';
import { forgetCameraRecorderControlGrant } from '../video/runtime/camera-recorder-control';
import { failed, RECORDING_PARTICIPANT_ID, verified } from './result';
import { releaseVideoRecordingSurface } from '../video/content-surface/surface-lease';

export function resetRecordingRuntimeStateForPrivacyErasure(): void {
  forgetCameraRecorderControlGrant();
  finishVideoRecordingStop();
  resetRecordingId();
  resetRecordingTabId();
  resetVideoRecordingStartSession();
  resetVideoRecordingRuntimeState();
}

async function verifyVideoCaptureSurfacesAbsent(): Promise<boolean> {
  try {
    const journal = await readCaptureSurfaceJournal();
    return (
      !journal.some((entry) => entry.owner === 'video') &&
      !getCaptureSurfaceService().hasOwnerLease('video')
    );
  } catch {
    return false;
  }
}

export async function cleanupVideoCaptureSurfacesForPrivacyErasure(): Promise<boolean> {
  try {
    await getCaptureSurfaceService().releaseOwners(['video']);
  } catch {
    return false;
  }
  return verifyVideoCaptureSurfacesAbsent();
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
  await releaseVideoRecordingSurface();
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

  if (!(await cleanupVideoCaptureSurfacesForPrivacyErasure())) {
    return failed(RECORDING_PARTICIPANT_ID, 'recording-surface-cleanup-failed');
  }

  const leaseFailure = await cleanupRecordingLease(recordingId);
  if (leaseFailure) {
    return leaseFailure;
  }

  resetRecordingRuntimeStateForPrivacyErasure();
  return verified(RECORDING_PARTICIPANT_ID);
}
