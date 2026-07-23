import type { ScreenshotControllerParams } from '../mode';
import type { ScreenshotControllerRuntime } from '../types';
import type { ScreenshotControllerSession } from './state';

export type CreateScreenshotControllerActionsArgs = {
  params: ScreenshotControllerParams;
  runtime: ScreenshotControllerRuntime;
  session: ScreenshotControllerSession;
  setCountdown: (value: number | null) => void;
};
