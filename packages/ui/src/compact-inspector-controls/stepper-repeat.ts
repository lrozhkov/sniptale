import { useEffect, useRef } from 'react';

const STEPPER_REPEAT_DELAY_MS = 220;
const STEPPER_REPEAT_INTERVAL_MS = 70;

export function useStepperRepeat(onStep: (direction: 1 | -1) => void) {
  const currentStep = useRef(onStep);
  currentStep.current = onStep;
  const repeatRef = useRef<number | null>(null);
  const timeoutRef = useRef<number | null>(null);

  const stop = () => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (repeatRef.current !== null) {
      window.clearInterval(repeatRef.current);
      repeatRef.current = null;
    }
  };

  const start = (direction: 1 | -1) => {
    stop();
    currentStep.current(direction);
    timeoutRef.current = window.setTimeout(() => {
      repeatRef.current = window.setInterval(
        () => currentStep.current(direction),
        STEPPER_REPEAT_INTERVAL_MS
      );
    }, STEPPER_REPEAT_DELAY_MS);
  };

  useEffect(() => stop, []);

  return { start, stop };
}
