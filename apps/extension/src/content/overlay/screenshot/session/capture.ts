import { startCountdown } from '../countdown/controller';
import { executeCountdownScreenshot } from './elapsed';
import { runImmediateScreenshot } from './immediate';
import { beginScreenshotRun, prepareScreenshotMode, syncCaptureAction } from '../mode';
import type { CreateScreenshotControllerActionsArgs } from './action-types';
import type { ContentPrivilegedActionIntentSource } from '../../../application/privileged-action-intent';
import type { ScreenshotStartContext, ScreenshotType } from '../types';

export function createHandleTakeScreenshot(args: CreateScreenshotControllerActionsArgs) {
  return async (
    type: ScreenshotType,
    contentIntentSource?: ContentPrivilegedActionIntentSource,
    startContext?: ScreenshotStartContext
  ) => {
    await syncCaptureAction(args.params);
    prepareScreenshotMode(args.params, args.session, startContext);
    const runToken = beginScreenshotRun(args.runtime);

    if (args.params.timerDelay > 0) {
      startScreenshotCountdown(type, args, runToken, contentIntentSource);
      return;
    }

    if (contentIntentSource) {
      await runImmediateScreenshot(type, args, runToken, contentIntentSource);
      return;
    }

    await runImmediateScreenshot(type, args, runToken);
  };
}

function startScreenshotCountdown(
  type: ScreenshotType,
  args: CreateScreenshotControllerActionsArgs,
  runToken: number,
  contentIntentSource: ContentPrivilegedActionIntentSource | undefined
) {
  args.session.countdownRunToken = runToken;
  startCountdown({
    onElapsed: () => {
      void executeCountdownScreenshot(type, args, runToken, contentIntentSource);
    },
    session: args.session,
    setCountdown: args.setCountdown,
    setIsToolbarVisible: args.params.setIsToolbarVisible,
    setNavigationLockEnabled: args.params.setNavigationLockEnabled,
    timerDelay: args.params.timerDelay,
    type,
  });
}
