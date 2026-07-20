export type ScreenshotType = 'visible' | 'full' | 'selection';

type CountdownRuntimeState = {
  countdownTimeoutRef: { current: ReturnType<typeof setTimeout> | null };
  pendingScreenshotType: { current: ScreenshotType | null };
  setCountdown: (value: number | null) => void;
};

export function resetScreenshotCountdownRuntimeState(args: CountdownRuntimeState): void {
  args.setCountdown(null);
  if (args.countdownTimeoutRef.current) {
    clearTimeout(args.countdownTimeoutRef.current);
  }
  args.countdownTimeoutRef.current = null;
  args.pendingScreenshotType.current = null;
}

export function startScreenshotCountdownTimer(
  args: CountdownRuntimeState & {
    onElapsed: () => void;
    timerDelay: number;
    type: ScreenshotType;
  }
): void {
  args.setCountdown(args.timerDelay);
  args.pendingScreenshotType.current = args.type;

  let currentCount = args.timerDelay;
  const tick = () => {
    currentCount -= 1;

    if (currentCount > 0) {
      args.setCountdown(currentCount);
      args.countdownTimeoutRef.current = setTimeout(tick, 1000);
      return;
    }

    resetScreenshotCountdownRuntimeState(args);
    args.onElapsed();
  };

  args.countdownTimeoutRef.current = setTimeout(tick, 1000);
}
