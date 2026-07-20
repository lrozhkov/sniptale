import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { sendRuntimeMessage } from '../../../../platform/runtime-messaging';
import { attachOffscreenCommandCapability } from '@sniptale/platform/security/offscreen-command-capability';

type ViewportDrawStateArgs = {
  frozen: boolean;
  navigationEpoch: number;
};

export async function setViewportRecordingDrawState(args: ViewportDrawStateArgs): Promise<void> {
  await sendRuntimeMessage(
    attachOffscreenCommandCapability({
      type: VideoMessageType.OFFSCREEN_SET_VIEWPORT_DRAW_STATE,
      frozen: args.frozen,
      navigationEpoch: args.navigationEpoch,
    })
  );
}
