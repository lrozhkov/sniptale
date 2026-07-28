// policyStateId: video-capture-surface-sessions - recovery serializes rehydration of active recording surfaces.
import { attachOffscreenCommandCapability } from '@sniptale/platform/security/offscreen-command-capability';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { getCaptureSurfaceService, recoverCaptureSurfaces } from '../../../capture-surface';
import { getBackgroundRuntimeMessaging } from '../../../routing-contracts/runtime-messaging/services';
import { requestBoundOffscreenRecordingStop } from '../offscreen-recording-stop';
import {
  clearActiveVideoRecordingLease,
  ensureActiveVideoRecordingLeaseHydrated,
} from '../recording-control-lease';
import {
  deleteVideoSurfaceSession,
  getVideoSurfaceSession,
  storeVideoSurfaceSession,
  type VideoSurfaceSession,
} from './session-registry';

let pendingRecovery: Promise<void> | null = null;
let recoveryFailure: unknown = null;

function isPositiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

async function requestOffscreenStopAcknowledgement(binding: {
  generation: number;
  recordingId: string;
  streamInstanceId: string;
}): Promise<void> {
  await requestBoundOffscreenRecordingStop(binding, true);
}

async function revalidateRecoveredVideoSource(session: VideoSurfaceSession): Promise<void> {
  if (!session.streamInstanceId) {
    throw new Error('Recovered recording source binding is incomplete');
  }
  const response = await getBackgroundRuntimeMessaging().sendRuntimeMessage(
    attachOffscreenCommandCapability({
      type: VideoMessageType.OFFSCREEN_REVALIDATE_SOURCE,
      recordingId: session.recordingId,
      generation: session.generation,
      streamInstanceId: session.streamInstanceId,
    })
  );
  if (
    response?.success !== true ||
    response.result !== 'ALLOW' ||
    !isPositiveFinite(response.videoWidth ?? 0) ||
    !isPositiveFinite(response.videoHeight ?? 0)
  ) {
    throw new Error(response?.error ?? 'Recovered recording source validation failed');
  }
  session.sourceVideoHeight = response.videoHeight ?? null;
  session.sourceVideoWidth = response.videoWidth ?? null;
}

async function stopInvalidRecoveredRecording(
  recordingId: string,
  persistedBinding: { generation: number; streamInstanceId: string } | null
): Promise<void> {
  const session = getVideoSurfaceSession(recordingId);
  const binding = session?.streamInstanceId
    ? {
        generation: session.generation,
        recordingId,
        streamInstanceId: session.streamInstanceId,
      }
    : persistedBinding
      ? { recordingId, ...persistedBinding }
      : null;
  if (!binding) throw new Error('Recovered recording source binding is incomplete');
  await requestOffscreenStopAcknowledgement(binding);
  const applied = getCaptureSurfaceService().getAppliedForSession(recordingId);
  if (applied) await getCaptureSurfaceService().release(applied);
  await clearActiveVideoRecordingLease(recordingId);
  deleteVideoSurfaceSession(recordingId);
}

async function recoverVideoCaptureSurfaceInternal(): Promise<void> {
  const activeLeasePromise = ensureActiveVideoRecordingLeaseHydrated();
  const recoveryPromise = recoverCaptureSurfaces(
    activeLeasePromise.then((activeLease) =>
      activeLease?.viewportPresetId ? new Set<string>([activeLease.recordingId]) : new Set<string>()
    )
  );
  const activeLease = await activeLeasePromise;
  await recoveryPromise;
  if (!activeLease) return;

  if (activeLease.phase !== 'active') {
    if (!activeLease.surfaceBinding) {
      throw new Error('Recovered prepared recording source binding is incomplete');
    }
    await requestOffscreenStopAcknowledgement({
      recordingId: activeLease.recordingId,
      ...activeLease.surfaceBinding,
    });
    const applied = getCaptureSurfaceService().getAppliedForSession(activeLease.recordingId);
    if (applied) await getCaptureSurfaceService().release(applied);
    await clearActiveVideoRecordingLease(activeLease.recordingId);
    return;
  }

  const applied = getCaptureSurfaceService().getAppliedForSession(activeLease.recordingId);
  if (!activeLease.surfaceBinding && activeLease.viewportPresetId === null) {
    await clearActiveVideoRecordingLease(activeLease.recordingId);
    return;
  }
  if (
    !activeLease.surfaceBinding ||
    (activeLease.viewportPresetId !== null &&
      (!applied || applied.generation !== activeLease.surfaceBinding.generation))
  ) {
    await stopInvalidRecoveredRecording(activeLease.recordingId, activeLease.surfaceBinding);
    return;
  }

  const recoveredSession: VideoSurfaceSession = {
    applied: activeLease.viewportPresetId === null ? null : applied,
    generation: activeLease.surfaceBinding.generation,
    recordingId: activeLease.recordingId,
    sourceReady: true,
    sourceVideoHeight: null,
    sourceVideoWidth: null,
    streamInstanceId: activeLease.surfaceBinding.streamInstanceId,
    tabId: activeLease.recordingTabId,
  };
  storeVideoSurfaceSession(recoveredSession);
  try {
    if (recoveredSession.applied) {
      await getCaptureSurfaceService().reassert({
        sessionId: recoveredSession.applied.sessionId,
        leaseId: recoveredSession.applied.leaseId,
        generation: recoveredSession.applied.generation,
      });
    }
    await revalidateRecoveredVideoSource(recoveredSession);
  } catch (error) {
    try {
      await stopInvalidRecoveredRecording(activeLease.recordingId, activeLease.surfaceBinding);
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        'Recovered recording validation and fail-closed cleanup both failed'
      );
    }
  }
}

export async function recoverVideoCaptureSurfaceOnStartup(): Promise<void> {
  if (pendingRecovery) return pendingRecovery;
  const recovery = recoverVideoCaptureSurfaceInternal();
  pendingRecovery = recovery;
  try {
    await recovery;
    recoveryFailure = null;
  } catch (error) {
    recoveryFailure = error;
    throw error;
  } finally {
    if (pendingRecovery === recovery) pendingRecovery = null;
  }
}

export function deferVideoCaptureSurfaceWorkUntilRecovery(
  run: () => void,
  onFailure: (error: unknown) => void
): boolean {
  const recovery = pendingRecovery;
  if (!recovery) return false;
  void recovery.then(run, onFailure);
  return true;
}

export async function waitForVideoCaptureSurfaceRecovery(): Promise<void> {
  await pendingRecovery;
  if (recoveryFailure) throw recoveryFailure;
}
