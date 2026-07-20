type MutableRef<T> = {
  current: T;
};

type StepBadgeRecalculationRef = MutableRef<(excludeFrameId?: string) => void>;
const frameClearTimeouts = new WeakMap<MutableRef<boolean>, ReturnType<typeof setTimeout>>();

export function scheduleFrameClearCompletion(
  isClearingRef: MutableRef<boolean>,
  delayMs = 100
): void {
  const existingTimeoutId = frameClearTimeouts.get(isClearingRef);
  if (existingTimeoutId !== undefined) {
    clearTimeout(existingTimeoutId);
  }

  const timeoutId = setTimeout(() => {
    if (frameClearTimeouts.get(isClearingRef) !== timeoutId) {
      return;
    }

    frameClearTimeouts.delete(isClearingRef);
    isClearingRef.current = false;
  }, delayMs);
  frameClearTimeouts.set(isClearingRef, timeoutId);
}

export function scheduleStepBadgeRecalculation(
  recalculateStepBadgesRef: StepBadgeRecalculationRef,
  excludeFrameId?: string
): void {
  setTimeout(() => {
    if (excludeFrameId === undefined) {
      recalculateStepBadgesRef.current();
      return;
    }

    recalculateStepBadgesRef.current(excludeFrameId);
  }, 0);
}
