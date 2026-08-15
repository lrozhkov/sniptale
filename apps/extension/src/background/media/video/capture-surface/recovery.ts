// policyStateId: video-capture-surface-sessions - recovery serializes rehydration of active recording surfaces.
import { getCaptureSurfaceService, recoverCaptureSurfaces } from '../../../capture-surface';
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
import {
  isRecoveredPresetBindingValid,
  prepareAbandonedVideoSurfaceRestore,
  stopBoundRecordingBeforeAbandonedStackRestore,
  stopInvalidRecoveredRecording,
  stopPreparedRecoveredRecording,
  type VideoCaptureSurfacePageAccessVerifier,
} from './recovery-cleanup';

type PendingRecovery = { promise: Promise<void> };

let pendingRecovery: PendingRecovery | null = null;
let recoveryFailure: unknown = null;

const unavailablePageAccessVerifier: VideoCaptureSurfacePageAccessVerifier = async () => {
  throw new Error('Recording page access verifier is unavailable');
};

async function reconcileRecoveredTabOutput(session: VideoSurfaceSession): Promise<void> {
  const applied = session.applied;
  if (applied) {
    await getCaptureSurfaceService().reassert({
      sessionId: applied.sessionId,
      leaseId: applied.leaseId,
      generation: applied.generation,
    });
  }
}

async function recoverVideoCaptureSurfaceInternal(
  pageAccessVerifier: VideoCaptureSurfacePageAccessVerifier
): Promise<void> {
  const activeLeasePromise = ensureActiveVideoRecordingLeaseHydrated();
  let abandonedRecordingStopped = false;
  const recoveryPromise = recoverCaptureSurfaces({
    beforeAbandonedRestore: (surface) =>
      prepareAbandonedVideoSurfaceRestore(surface, pageAccessVerifier),
    beforeAbandonedStackRestore: async (surfaces) => {
      if (abandonedRecordingStopped) return;
      abandonedRecordingStopped = await stopBoundRecordingBeforeAbandonedStackRestore(
        await activeLeasePromise,
        surfaces
      );
    },
    liveSessionIds: activeLeasePromise.then((activeLease) =>
      activeLease?.viewportPresetId ? new Set<string>([activeLease.recordingId]) : new Set<string>()
    ),
  });
  const activeLease = await activeLeasePromise;
  await recoveryPromise;
  if (!activeLease) return;
  const captureSurfaceService = getCaptureSurfaceService();
  const appliedBinding = captureSurfaceService.getAppliedBindingForSession(activeLease.recordingId);

  if (abandonedRecordingStopped) {
    if (captureSurfaceService.hasSessionLease(activeLease.recordingId)) {
      throw new Error(
        'Stopped recovered recording retains capture-surface authority after cleanup failed'
      );
    }
    await clearActiveVideoRecordingLease(activeLease.recordingId);
    deleteVideoSurfaceSession(activeLease.recordingId);
    return;
  }

  if (activeLease.phase !== 'active') {
    await stopPreparedRecoveredRecording(activeLease, appliedBinding, pageAccessVerifier);
    return;
  }

  if (!activeLease.surfaceBinding && activeLease.viewportPresetId === null) {
    await clearActiveVideoRecordingLease(activeLease.recordingId);
    return;
  }
  if (
    !activeLease.surfaceBinding ||
    (activeLease.viewportPresetId !== null &&
      !isRecoveredPresetBindingValid(activeLease, appliedBinding))
  ) {
    await stopInvalidRecoveredRecording(
      activeLease.recordingId,
      activeLease.surfaceBinding,
      appliedBinding,
      pageAccessVerifier
    );
    return;
  }

  const recoveredSession: VideoSurfaceSession = {
    applied: activeLease.viewportPresetId === null ? null : appliedBinding!.applied,
    generation: activeLease.surfaceBinding.generation,
    recordingId: activeLease.recordingId,
    sourceReady: true,
    sourceVideoHeight: null,
    sourceVideoWidth: null,
    streamInstanceId: activeLease.surfaceBinding.streamInstanceId,
    tabId:
      activeLease.viewportPresetId === null ? activeLease.recordingTabId : appliedBinding!.tabId,
  };
  storeVideoSurfaceSession(recoveredSession);
  try {
    await reconcileRecoveredTabOutput(recoveredSession);
  } catch (error) {
    const currentSession = getVideoSurfaceSession(activeLease.recordingId);
    if (
      currentSession !== recoveredSession ||
      currentSession.generation !== activeLease.surfaceBinding.generation ||
      currentSession.streamInstanceId !== activeLease.surfaceBinding.streamInstanceId
    ) {
      throw error;
    }
    try {
      await stopInvalidRecoveredRecording(
        activeLease.recordingId,
        activeLease.surfaceBinding,
        appliedBinding,
        pageAccessVerifier
      );
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        'Recovered recording validation and fail-closed cleanup both failed',
        { cause: cleanupError }
      );
    }
  }
}

export async function recoverVideoCaptureSurfaceOnStartup(
  pageAccessVerifier: VideoCaptureSurfacePageAccessVerifier = unavailablePageAccessVerifier
): Promise<void> {
  if (pendingRecovery) return await pendingRecovery.promise;
  const recovery = { promise: recoverVideoCaptureSurfaceInternal(pageAccessVerifier) };
  pendingRecovery = recovery;
  try {
    await recovery.promise;
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
  void recovery.promise.then(run, onFailure);
  return true;
}

export async function waitForVideoCaptureSurfaceRecovery(): Promise<void> {
  await pendingRecovery?.promise;
  if (recoveryFailure) throw recoveryFailure;
}
