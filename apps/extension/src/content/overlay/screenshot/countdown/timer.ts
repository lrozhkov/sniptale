import type { ScreenshotControllerSession } from '../session/state';
import type { ScreenshotType } from '../types';

type CountdownRuntimeState = {
  session: Pick<ScreenshotControllerSession, 'countdownTimeout' | 'pendingType'>;
  setCountdown: (value: number | null) => void;
};

export function resetScreenshotCountdownRuntimeState(args: CountdownRuntimeState): void {
  args.setCountdown(null);
  if (args.session.countdownTimeout) {
    clearTimeout(args.session.countdownTimeout);
  }
  args.session.countdownTimeout = null;
  args.session.pendingType = null;
}

export function startScreenshotCountdownTimer(
  args: CountdownRuntimeState & {
    onElapsed: () => void;
    timerDelay: number;
    type: ScreenshotType;
  }
): void {
  args.setCountdown(args.timerDelay);
  args.session.pendingType = args.type;

  let currentCount = args.timerDelay;
  const tick = () => {
    currentCount -= 1;

    if (currentCount > 0) {
      args.setCountdown(currentCount);
      args.session.countdownTimeout = setTimeout(tick, 1000);
      return;
    }

    resetScreenshotCountdownRuntimeState(args);
    args.onElapsed();
  };

  args.session.countdownTimeout = setTimeout(tick, 1000);
}
