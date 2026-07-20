import {
  VideoRecordingStatus,
  type VideoRecordingRuntimeState,
} from '@sniptale/runtime-contracts/video/types/types';

export function createCountdownBadgeTimer(
  getState: () => VideoRecordingRuntimeState,
  applyBadgeState: (state: VideoRecordingRuntimeState) => void
) {
  let intervalId: ReturnType<typeof setInterval> | null = null;

  const clear = () => {
    if (intervalId === null) {
      return;
    }

    clearInterval(intervalId);
    intervalId = null;
  };

  return {
    clear,
    sync() {
      const state = getState();
      if (state.status !== VideoRecordingStatus.COUNTDOWN || state.countdownEndsAt === null) {
        clear();
        return;
      }

      if (intervalId !== null) {
        return;
      }

      intervalId = setInterval(() => {
        const liveState = getState();
        if (liveState.status !== VideoRecordingStatus.COUNTDOWN) {
          clear();
          return;
        }

        applyBadgeState(liveState);
      }, 250);
    },
  };
}
