import {
  type AppliedCaptureSurfaceBinding,
  type CaptureSurfaceLeaseIdentity,
} from '../../../capture-surface';
import { isViewportPresetAllowedForVideoCaptureMode } from '../../../../features/viewport-presets/video-recording-policy';
import {
  clearActiveVideoRecordingLease,
  type ensureActiveVideoRecordingLeaseHydrated,
} from '../recording-control-lease';
import { requestBoundOffscreenRecordingStop } from '../offscreen-recording-stop';
import { deleteVideoSurfaceSession, getVideoSurfaceSession } from './session-registry';
import {
  disableViewportCursorProjection,
  retireViewportCursorProjectionAuthority,
} from './cursor-projection';
import { releaseAppliedVideoCaptureSurface } from './release-applied';

export type VideoCaptureSurfacePageAccessVerifier = (
  tabId: number,
  failureMessage?: string
) => Promise<void>;

type RecoveredVideoRecordingLease = NonNullable<
  Awaited<ReturnType<typeof ensureActiveVideoRecordingLeaseHydrated>>
>;

async function requestOffscreenStopAcknowledgement(binding: {
  generation: number;
  recordingId: string;
  streamInstanceId: string;
}): Promise<void> {
  await requestBoundOffscreenRecordingStop(binding, true);
}

async function releaseRecoveredAppliedSurface(
  binding: AppliedCaptureSurfaceBinding,
  pageAccessVerifier: VideoCaptureSurfacePageAccessVerifier
): Promise<void> {
  if (binding.applied.target === 'viewport') {
    retireViewportCursorProjectionAuthority(binding.tabId, {
      generation: binding.applied.generation,
      recordingId: binding.applied.sessionId,
    });
    await pageAccessVerifier(
      binding.tabId,
      'Recording page access is required to remove a recovered viewport cursor projection.'
    );
  }
  await releaseAppliedVideoCaptureSurface(binding.applied, binding.tabId);
}

export async function prepareAbandonedVideoSurfaceRestore(
  surface: CaptureSurfaceLeaseIdentity,
  pageAccessVerifier: VideoCaptureSurfacePageAccessVerifier
): Promise<void> {
  if (surface.owner !== 'video' || surface.target !== 'viewport') return;
  retireViewportCursorProjectionAuthority(surface.tabId, {
    generation: surface.generation,
    recordingId: surface.sessionId,
  });
  await pageAccessVerifier(
    surface.tabId,
    'Recording page access is required to remove an abandoned viewport cursor projection.'
  );
  await disableViewportCursorProjection(surface.tabId, {
    generation: surface.generation,
    recordingId: surface.sessionId,
  });
}

export async function stopBoundRecordingBeforeAbandonedStackRestore(
  activeLease: RecoveredVideoRecordingLease | null,
  surfaces: readonly CaptureSurfaceLeaseIdentity[]
): Promise<boolean> {
  if (!activeLease) return false;
  const containsBoundRecording = surfaces.some(
    (surface) => surface.owner === 'video' && surface.sessionId === activeLease.recordingId
  );
  if (!containsBoundRecording) return false;
  if (!activeLease.surfaceBinding) {
    throw new Error('Recovered recording source binding is incomplete before surface cleanup');
  }
  await requestOffscreenStopAcknowledgement({
    recordingId: activeLease.recordingId,
    ...activeLease.surfaceBinding,
  });
  return true;
}

export function isRecoveredPresetBindingValid(
  activeLease: RecoveredVideoRecordingLease,
  appliedBinding: AppliedCaptureSurfaceBinding | null
): boolean {
  const sourceBinding = activeLease.surfaceBinding;
  return Boolean(
    sourceBinding &&
    appliedBinding &&
    activeLease.recordingTabId !== null &&
    activeLease.recordingTabId === appliedBinding.tabId &&
    activeLease.viewportPresetId === appliedBinding.applied.presetId &&
    sourceBinding.generation === appliedBinding.applied.generation &&
    isViewportPresetAllowedForVideoCaptureMode(activeLease.captureMode, appliedBinding.applied)
  );
}

export async function stopPreparedRecoveredRecording(
  activeLease: RecoveredVideoRecordingLease,
  appliedBinding: AppliedCaptureSurfaceBinding | null,
  pageAccessVerifier: VideoCaptureSurfacePageAccessVerifier
): Promise<void> {
  if (!activeLease.surfaceBinding) {
    throw new Error('Recovered prepared recording source binding is incomplete');
  }
  await requestOffscreenStopAcknowledgement({
    recordingId: activeLease.recordingId,
    ...activeLease.surfaceBinding,
  });
  if (appliedBinding) {
    await releaseRecoveredAppliedSurface(appliedBinding, pageAccessVerifier);
  }
  await clearActiveVideoRecordingLease(activeLease.recordingId);
}

export async function stopInvalidRecoveredRecording(
  recordingId: string,
  persistedBinding: { generation: number; streamInstanceId: string } | null,
  appliedBinding: AppliedCaptureSurfaceBinding | null,
  pageAccessVerifier: VideoCaptureSurfacePageAccessVerifier
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
  if (appliedBinding) {
    await releaseRecoveredAppliedSurface(appliedBinding, pageAccessVerifier);
  }
  await clearActiveVideoRecordingLease(recordingId);
  deleteVideoSurfaceSession(recordingId);
}
