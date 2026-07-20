type RepeatTimer = number | null;

const STEPPER_REPEAT_INITIAL_DELAY_MS = 280;
const STEPPER_REPEAT_INTERVAL_MS = 72;

export function startContentSizeTooltipStepperRepeat(action: () => void): () => void {
  let intervalTimer: RepeatTimer = null;
  const startTimer = window.setTimeout(() => {
    intervalTimer = window.setInterval(action, STEPPER_REPEAT_INTERVAL_MS);
  }, STEPPER_REPEAT_INITIAL_DELAY_MS);

  return () => {
    window.clearTimeout(startTimer);
    if (intervalTimer !== null) {
      window.clearInterval(intervalTimer);
    }
  };
}
