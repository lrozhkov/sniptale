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
  sendContentSurfaceState?: (state: VideoRecordingRuntimeState) => Promise<void>;
}) {
  let contentSurfaceDelivery = Promise.resolve();
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
      if (deps.sendContentSurfaceState) {
        contentSurfaceDelivery = contentSurfaceDelivery
          .then(() => deps.sendContentSurfaceState?.(runtimeState))
          .catch(() => {
            // The tab surface is optional and may disappear during navigation.
          });
      }
    },
  };
}
