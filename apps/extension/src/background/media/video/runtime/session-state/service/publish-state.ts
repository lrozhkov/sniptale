import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import type { VideoRecordingRuntimeState } from '@sniptale/runtime-contracts/video/types/types';

type RuntimeMessageSender = (message: {
  state: VideoRecordingRuntimeState;
  type: VideoMessageType.RECORDING_STATE_SYNC;
}) => Promise<unknown>;

type CountdownBadgeTimer = {
  sync(): void;
};

export function createVideoRecordingRuntimeStatePublisher(deps: {
  applyBadgeState: (state: VideoRecordingRuntimeState) => void;
  countdownBadgeTimer: CountdownBadgeTimer;
  sendRuntimeMessage: RuntimeMessageSender;
}) {
  return {
    publishState(runtimeState: VideoRecordingRuntimeState): void {
      deps.applyBadgeState(runtimeState);
      deps.countdownBadgeTimer.sync();

      void deps
        .sendRuntimeMessage({
          type: VideoMessageType.RECORDING_STATE_SYNC,
          state: runtimeState,
        })
        .catch(() => {
          // Popup may already be closed.
        });
    },
  };
}
