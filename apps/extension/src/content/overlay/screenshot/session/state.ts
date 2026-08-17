import type { ScreenshotControllerRuntimeSession, ScreenshotType } from '../types';

type CountdownLockSession = {
  navigationLockEnabledBeforeCountdown: boolean;
};

type CountdownTimeoutHandle = number | ReturnType<typeof globalThis.setTimeout>;

export interface ScreenshotControllerSession extends ScreenshotControllerRuntimeSession {
  countdownLock: CountdownLockSession | null;
  countdownRunToken: number | null;
  countdownTimeout: CountdownTimeoutHandle | null;
  pendingType: ScreenshotType | null;
}

export function createScreenshotControllerSession(
  navigationLockBaseline: boolean
): ScreenshotControllerSession {
  return {
    countdownLock: null,
    countdownRunToken: null,
    countdownTimeout: null,
    editingModeBaseline: null,
    navigationLockBaseline,
    pendingType: null,
    runActive: false,
    runGeneration: 0,
  };
}
