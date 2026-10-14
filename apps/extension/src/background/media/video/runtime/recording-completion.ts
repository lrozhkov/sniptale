import { VideoRecordingStatus } from '@sniptale/runtime-contracts/video/types/types';
import { releaseVideoCaptureSurface } from '../capture-surface';
import {
  clearActiveVideoRecordingLease,
  ensureActiveVideoRecordingLeaseHydrated,
  updateVideoRecordingTerminal,
} from '../recording-control-lease';
import {
  finishVideoRecordingStop,
  isCurrentVideoRecordingId,
  resetCompletedVideoRecordingSession,
} from '../session-state';
import { clearCameraRecorderControlGrant } from './camera-recorder-control';
import { resetVideoRecordingRuntimeState, setVideoRecordingRuntimeState } from './session-state';

const pendingCompletions = new Map<string, Promise<void>>();

/** Joins confirmed offscreen completion and retries only unfinished background cleanup. */
export function completeVideoRecording(recordingId: string): Promise<void> {
  const pending = pendingCompletions.get(recordingId);
  if (pending) return pending;
  const work = completeRecording(recordingId)
    .catch((error: unknown) => {
      if (isCurrentVideoRecordingId(recordingId)) {
        finishVideoRecordingStop();
        setVideoRecordingRuntimeState({
          status: VideoRecordingStatus.STOPPING,
          error: 'Recording cleanup is incomplete.',
        });
      }
      throw error;
    })
    .finally(() => {
      if (pendingCompletions.get(recordingId) === work) pendingCompletions.delete(recordingId);
    });
  pendingCompletions.set(recordingId, work);
  return work;
}

async function completeRecording(recordingId: string): Promise<void> {
  if (!isCurrentVideoRecordingId(recordingId)) return;
  const lease = await ensureActiveVideoRecordingLeaseHydrated();
  if (!isCurrentVideoRecordingId(recordingId)) return;
  if (lease?.recordingId !== recordingId || !lease.surfaceBinding) {
    throw new Error('Recording terminal source binding is unavailable.');
  }
  const binding = { recordingId, ...lease.surfaceBinding };
  const discard = lease.phase === 'terminal' ? lease.terminal.discard : false;
  const terminal =
    lease.phase === 'terminal' && lease.terminal.outcome === 'stopped'
      ? lease
      : await updateVideoRecordingTerminal(binding, {
          discard,
          outcome: 'stopped',
          cleanupStep: 'surface',
        });
  if (terminal.phase !== 'terminal' || terminal.terminal.outcome !== 'stopped') {
    throw new Error('Recording cleanup has no successful terminal outcome.');
  }
  let step = terminal.terminal.cleanupStep;
  if (!isCurrentVideoRecordingId(recordingId)) return;
  setVideoRecordingRuntimeState({ status: VideoRecordingStatus.STOPPING, error: null });
  if (step === 'surface') {
    await releaseVideoCaptureSurface(recordingId);
    if (!isCurrentVideoRecordingId(recordingId)) return;
    await updateVideoRecordingTerminal(binding, {
      discard,
      outcome: 'stopped',
      cleanupStep: 'camera-grant',
    });
    step = 'camera-grant';
  }
  if (step === 'camera-grant') {
    await clearCameraRecorderControlGrant(recordingId);
    if (!isCurrentVideoRecordingId(recordingId)) return;
    await updateVideoRecordingTerminal(binding, {
      discard,
      outcome: 'stopped',
      cleanupStep: 'lease',
    });
  }
  if (!isCurrentVideoRecordingId(recordingId)) return;
  await clearActiveVideoRecordingLease(recordingId);
  if (!isCurrentVideoRecordingId(recordingId)) return;
  finishVideoRecordingStop();
  resetCompletedVideoRecordingSession(recordingId);
  resetVideoRecordingRuntimeState();
}
