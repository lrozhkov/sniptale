// policyStateId: video-capture-surface-sessions - recovery serializes rehydration of active recording surfaces.
import { attachOffscreenCommandCapability } from '@sniptale/platform/security/offscreen-command-capability';
import { createLogger } from '@sniptale/platform/observability/logger';
import { createSecureRandomUuid } from '@sniptale/platform/security/secure-random-id';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { CaptureMode, type ViewportInfo } from '@sniptale/runtime-contracts/video/types/types';
import { getCaptureSurfaceService, recoverCaptureSurfaces } from '../../../capture-surface';
import { getBackgroundRuntimeMessaging } from '../../../routing-contracts/runtime-messaging/services';
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
import { setViewportOutputFrozen } from './output-state';
import { enableViewportCursorProjection } from './cursor-projection';
import { readTabCaptureViewport } from '../capture-viewport';
import {
  isRecoveredPresetBindingValid,
  prepareAbandonedVideoSurfaceRestore,
  stopBoundRecordingBeforeAbandonedStackRestore,
  stopInvalidRecoveredRecording,
  stopPreparedRecoveredRecording,
  type VideoCaptureSurfacePageAccessVerifier,
} from './recovery-cleanup';

const logger = createLogger({ namespace: 'BackgroundVideoCaptureSurfaceRecovery' });

let pendingRecovery: Promise<void> | null = null;
let recoveryFailure: unknown = null;

const unavailablePageAccessVerifier: VideoCaptureSurfacePageAccessVerifier = async () => {
  throw new Error('Recording page access verifier is unavailable');
};

function isPositiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

async function revalidateRecoveredVideoSource(
  session: VideoSurfaceSession,
  args: { transitionId?: string; viewport?: ViewportInfo } = {}
): Promise<void> {
  if (!session.streamInstanceId) {
    throw new Error('Recovered recording source binding is incomplete');
  }
  const expectedGeneration = session.generation;
  const expectedStreamInstanceId = session.streamInstanceId;
  const response = await getBackgroundRuntimeMessaging().sendRuntimeMessage(
    attachOffscreenCommandCapability({
      type: VideoMessageType.OFFSCREEN_REVALIDATE_SOURCE,
      recordingId: session.recordingId,
      generation: session.generation,
      streamInstanceId: session.streamInstanceId,
      ...(args.transitionId ? { transitionId: args.transitionId } : {}),
      ...(args.viewport ? { viewport: args.viewport } : {}),
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
  const currentSession = getVideoSurfaceSession(session.recordingId);
  if (
    currentSession !== session ||
    session.generation !== expectedGeneration ||
    session.streamInstanceId !== expectedStreamInstanceId
  ) {
    throw new Error('Recovered recording binding changed during source validation');
  }
  session.sourceVideoHeight = response.videoHeight ?? null;
  session.sourceVideoWidth = response.videoWidth ?? null;
}

async function updateRecoveredViewportOutput(
  session: VideoSurfaceSession,
  frozen: boolean,
  transitionId: string
): Promise<void> {
  if (!session.streamInstanceId) {
    throw new Error('Recovered recording source binding is incomplete');
  }
  const binding = {
    generation: session.generation,
    recordingId: session.recordingId,
    streamInstanceId: session.streamInstanceId,
  };
  let initialError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const result = await setViewportOutputFrozen(binding, frozen, transitionId);
      if (result === 'applied') return;
      throw new Error(`Recovered viewport output ${frozen ? 'freeze' : 'resume'} was superseded`);
    } catch (error) {
      if (attempt === 0) {
        initialError = error;
        continue;
      }
      throw new AggregateError(
        [initialError, error],
        `Recovered viewport output ${frozen ? 'freeze' : 'resume'} could not be confirmed`,
        { cause: error }
      );
    }
  }
}

async function reconcileRecoveredTabOutput(
  session: VideoSurfaceSession,
  captureMode: CaptureMode,
  pageAccessVerifier: VideoCaptureSurfacePageAccessVerifier
): Promise<void> {
  const applied = session.applied;
  const reassertViewport = applied?.target === 'viewport';
  const requiresExactOutputRecovery = captureMode === CaptureMode.TAB_CROP || reassertViewport;
  if (!requiresExactOutputRecovery) {
    if (applied) {
      await getCaptureSurfaceService().reassert({
        sessionId: applied.sessionId,
        leaseId: applied.leaseId,
        generation: applied.generation,
      });
    }
    await revalidateRecoveredVideoSource(session);
    return;
  }

  const transitionId = createSecureRandomUuid(
    'Secure recovery transition generation is unavailable'
  );
  await updateRecoveredViewportOutput(session, true, transitionId);
  if (applied) {
    await getCaptureSurfaceService().reassert({
      sessionId: applied.sessionId,
      leaseId: applied.leaseId,
      generation: applied.generation,
    });
  }
  if (session.tabId === null) {
    throw new Error('Recovered exact tab output is missing its recording tab');
  }
  const expectedGeneration = session.generation;
  const expectedStreamInstanceId = session.streamInstanceId;
  await pageAccessVerifier(
    session.tabId,
    'Recording page access is required to recover exact tab output.'
  );
  const viewport = await readTabCaptureViewport(session.tabId);
  const currentSession = getVideoSurfaceSession(session.recordingId);
  if (
    currentSession !== session ||
    session.generation !== expectedGeneration ||
    session.streamInstanceId !== expectedStreamInstanceId
  ) {
    throw new Error('Recovered recording binding changed while page geometry was refreshed');
  }
  await revalidateRecoveredVideoSource(session, { transitionId, viewport });
  if (reassertViewport) {
    try {
      await enableViewportCursorProjection(session.tabId, {
        generation: session.generation,
        recordingId: session.recordingId,
      });
    } catch (error) {
      logger.warn('Recovered viewport cursor projection could not be restored', error);
    }
  }
  await updateRecoveredViewportOutput(session, false, transitionId);
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
    await reconcileRecoveredTabOutput(
      recoveredSession,
      activeLease.captureMode,
      pageAccessVerifier
    );
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
  if (pendingRecovery) return pendingRecovery;
  const recovery = recoverVideoCaptureSurfaceInternal(pageAccessVerifier);
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
