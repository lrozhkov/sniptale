import { attachOffscreenCommandCapability } from '@sniptale/platform/security/offscreen-command-capability';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { getCaptureSurfaceService } from '../../../../../capture-surface';
import { getBackgroundRuntimeMessaging } from '../../../../../routing-contracts/runtime-messaging/services';
import { getVideoSurfaceSession } from '../../../capture-surface';
import type { ViewportInfo } from '@sniptale/runtime-contracts/video/types/types';
import { readTabCaptureViewport } from '../../../capture-viewport';
import type { TabNavigationPageAccessVerifier } from './page-effects';

type TabSourceValidationBinding = {
  generation: number;
  recordingId: string;
  streamInstanceId: string;
  tabId: number;
};

export async function setViewportOutputFrozen(
  binding: TabSourceValidationBinding,
  frozen: boolean
): Promise<void> {
  const response = await getBackgroundRuntimeMessaging().sendRuntimeMessage(
    attachOffscreenCommandCapability({
      type: VideoMessageType.OFFSCREEN_SET_VIEWPORT_DRAW_STATE,
      recordingId: binding.recordingId,
      generation: binding.generation,
      streamInstanceId: binding.streamInstanceId,
      frozen,
    })
  );
  if (response?.success !== true) {
    throw new Error(response?.error ?? 'Viewport output frame state could not be updated');
  }
}

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
  ensurePageAccess: TabNavigationPageAccessVerifier
): Promise<void> {
  const session = getVideoSurfaceSession(binding.recordingId);
  if (!session) throw new Error('Video surface session is unavailable after navigation');
  if (liveViewport === null) {
    await ensurePageAccess(
      binding.tabId,
      'Recording source cannot be verified on the navigated page.'
    );
  }
  const verifiedViewport = liveViewport ?? (await readTabCaptureViewport(binding.tabId));
  const response = await getBackgroundRuntimeMessaging().sendRuntimeMessage(
    attachOffscreenCommandCapability({
      type: VideoMessageType.OFFSCREEN_REVALIDATE_SOURCE,
      recordingId: binding.recordingId,
      generation: binding.generation,
      streamInstanceId: binding.streamInstanceId,
      viewport: verifiedViewport,
    })
  );
  if (response?.success !== true || response.result !== 'ALLOW') {
    throw new Error(response?.error ?? 'Tab source mapping revalidation failed');
  }
  if (
    typeof session.sourceVideoWidth === 'number' &&
    typeof session.sourceVideoHeight === 'number' &&
    (response.videoWidth !== session.sourceVideoWidth ||
      response.videoHeight !== session.sourceVideoHeight)
  ) {
    throw new Error('Raw recording source dimensions changed after navigation');
  }
}
