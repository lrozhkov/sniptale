import { attachOffscreenCommandCapability } from '@sniptale/platform/security/offscreen-command-capability';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { getCaptureSurfaceService } from '../../../../../capture-surface';
import { getBackgroundRuntimeMessaging } from '../../../../../routing-contracts/runtime-messaging/services';
import { getVideoSurfaceSession } from '../../../capture-surface';
import { CaptureMode, type ViewportInfo } from '@sniptale/runtime-contracts/video/types/types';
import { readTabCaptureViewport } from '../../../capture-viewport';
import { verifyExactViewportOutput } from '../../../capture-surface/exact-output-verification';

type TabSourceValidationBinding = {
  generation: number;
  recordingId: string;
  streamInstanceId: string;
  tabId: number;
  captureMode?: CaptureMode.TAB | CaptureMode.TAB_CROP;
};

export async function reassertViewportSurface(binding: TabSourceValidationBinding): Promise<void> {
  const applied = getVideoSurfaceSession(binding.recordingId)?.applied;
  if (applied?.target !== 'viewport') return;
  await getCaptureSurfaceService().reassert({
    sessionId: binding.recordingId,
    leaseId: applied.leaseId,
    generation: binding.generation,
  });
}

export async function revalidateTabSource(
  binding: TabSourceValidationBinding,
  liveViewport: ViewportInfo | null,
  transitionId?: string,
  documentId?: string | null
): Promise<void> {
  const session = getVideoSurfaceSession(binding.recordingId);
  if (!session) throw new Error('Video surface session is unavailable after navigation');
  const verifiedViewport = liveViewport ?? (await readTabCaptureViewport(binding.tabId));
  if (
    binding.captureMode === CaptureMode.TAB &&
    session.applied?.target === 'viewport' &&
    transitionId
  ) {
    const result = await verifyExactViewportOutput({
      binding,
      ...(documentId === undefined ? {} : { documentId }),
      transitionId,
      viewport: verifiedViewport,
    });
    if (getVideoSurfaceSession(binding.recordingId) !== session) {
      throw new Error('Video surface session changed during source revalidation');
    }
    session.sourceVideoWidth = result.width;
    session.sourceVideoHeight = result.height;
    return;
  }
  const response = await getBackgroundRuntimeMessaging().sendRuntimeMessage(
    attachOffscreenCommandCapability({
      type: VideoMessageType.OFFSCREEN_REVALIDATE_SOURCE,
      recordingId: binding.recordingId,
      generation: binding.generation,
      streamInstanceId: binding.streamInstanceId,
      ...(transitionId ? { transitionId } : {}),
      viewport: verifiedViewport,
    })
  );
  if (response?.success !== true || response.result !== 'ALLOW') {
    throw new Error(response?.error ?? 'Tab source mapping revalidation failed');
  }
  if (
    !Number.isFinite(response.videoWidth) ||
    !Number.isFinite(response.videoHeight) ||
    (response.videoWidth ?? 0) <= 0 ||
    (response.videoHeight ?? 0) <= 0
  ) {
    throw new Error('Raw recording source dimensions are unavailable after navigation');
  }
  if (getVideoSurfaceSession(binding.recordingId) !== session) {
    throw new Error('Video surface session changed during source revalidation');
  }
  session.sourceVideoWidth = response.videoWidth ?? null;
  session.sourceVideoHeight = response.videoHeight ?? null;
}
