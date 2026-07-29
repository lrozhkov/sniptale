import { attachOffscreenCommandCapability } from '@sniptale/platform/security/offscreen-command-capability';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { getBackgroundRuntimeMessaging } from '../../../routing-contracts/runtime-messaging/services';

type ViewportOutputBinding = {
  generation: number;
  recordingId: string;
  streamInstanceId: string;
};

export type ViewportOutputStateResult = 'applied' | 'stale';

export async function setViewportOutputFrozen(
  binding: ViewportOutputBinding,
  frozen: boolean,
  transitionId: string
): Promise<ViewportOutputStateResult> {
  const response = await getBackgroundRuntimeMessaging().sendRuntimeMessage(
    attachOffscreenCommandCapability({
      type: VideoMessageType.OFFSCREEN_SET_VIEWPORT_DRAW_STATE,
      recordingId: binding.recordingId,
      generation: binding.generation,
      streamInstanceId: binding.streamInstanceId,
      transitionId,
      frozen,
    })
  );
  if (
    response?.success !== true ||
    (response.result !== 'applied' && response.result !== 'stale')
  ) {
    throw new Error(response?.error ?? 'Viewport output frame state could not be updated');
  }
  return response.result;
}
