import type { MutableRefObject } from 'react';

import type { CountdownLockSession, ScreenshotType } from '../countdown/controller';
import type { ScreenshotControllerParams } from '../mode';
import type { ScreenshotControllerRuntime } from '../types';

type ScreenshotControllerRefs = {
  countdownLockSessionRef: MutableRefObject<CountdownLockSession | null>;
  countdownRunTokenRef: MutableRefObject<number | null>;
  countdownTimeoutRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
  navigationLockStateBeforeScreenshot: MutableRefObject<boolean>;
  pendingScreenshotType: MutableRefObject<ScreenshotType | null>;
};

export type CreateScreenshotControllerActionsArgs = {
  params: ScreenshotControllerParams;
  refs: ScreenshotControllerRefs;
  runtime: ScreenshotControllerRuntime;
  setCountdown: (value: number | null) => void;
};
