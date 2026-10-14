import {
  type AppliedCaptureSurfaceBinding,
  type CaptureSurfaceLeaseIdentity,
} from '../../../capture-surface';
import { isViewportPresetAllowedForVideoCaptureMode } from '../../../../features/viewport-presets/video-recording-policy';
import {
  clearActiveVideoRecordingLease,
  type ensureVideoRecordingLeaseCache,
} from '../recording-control-lease';
import { confirmRecordingSourceStoppedForRecovery } from '../runtime/recording-completion';
import { deleteVideoSurfaceSession, getVideoSurfaceSession } from './session-registry';
import { releaseAppliedVideoCaptureSurface } from './release-applied';

export type VideoCaptureSurfacePageAccessVerifier = (
  tabId: number,
  failureMessage?: string
) => Promise<void>;

type RecoveredVideoRecordingLease = NonNullable<
  Awaited<ReturnType<typeof ensureVideoRecordingLeaseCache>>
>;

async function releaseRecoveredAppliedSurface(
  binding: AppliedCaptureSurfaceBinding,
  _pageAccessVerifier: VideoCaptureSurfacePageAccessVerifier
): Promise<void> {
  await releaseAppliedVideoCaptureSurface(binding.applied, binding.tabId);
}

export async function prepareAbandonedVideoSurfaceRestore(
  _surface: CaptureSurfaceLeaseIdentity,
  _pageAccessVerifier: VideoCaptureSurfacePageAccessVerifier
): Promise<void> {}

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
  await confirmRecordingSourceStoppedForRecovery({
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
  await confirmRecordingSourceStoppedForRecovery({
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
  await confirmRecordingSourceStoppedForRecovery(binding);
  if (appliedBinding) {
    await releaseRecoveredAppliedSurface(appliedBinding, pageAccessVerifier);
  }
  await clearActiveVideoRecordingLease(recordingId);
  deleteVideoSurfaceSession(recordingId);
}
