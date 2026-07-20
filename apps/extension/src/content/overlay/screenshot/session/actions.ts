import { createHandleCancelCountdown } from './cancel';
import { createHandleTakeScreenshot } from './capture';
import type { CreateScreenshotControllerActionsArgs } from './action-types';

export function createScreenshotControllerActions(args: CreateScreenshotControllerActionsArgs) {
  return {
    handleCancelCountdown: createHandleCancelCountdown(args),
    handleTakeScreenshot: createHandleTakeScreenshot(args),
  };
}
