import { startCountdown } from '../countdown/controller';
import { executeCountdownScreenshot } from './elapsed';
import { runImmediateScreenshot } from './immediate';
import { beginScreenshotRun, prepareScreenshotMode, syncCaptureAction } from '../mode';
import type { CreateScreenshotControllerActionsArgs } from './action-types';
import type { ContentPrivilegedActionIntentSource } from '../../../application/privileged-action-intent';
import type { ScreenshotStartContext, ScreenshotType } from '../types';
import type { CaptureActionType } from '../../../../contracts/settings';

export function createHandleTakeScreenshot(args: CreateScreenshotControllerActionsArgs) {
  return async (
    type: ScreenshotType,
    contentIntentSource?: ContentPrivilegedActionIntentSource,
    startContext?: ScreenshotStartContext
  ) => {
    if (
      startContext?.runGeneration !== undefined &&
      startContext.runGeneration !== args.session.runGeneration
    )
      return;
    syncCaptureAction(args.params);
    prepareScreenshotMode(args.params, args.session, type, startContext);
    const runToken = beginScreenshotRun(args.runtime);

    if (args.params.timerDelay > 0) {
      startScreenshotCountdown(
        type,
        args,
        runToken,
        contentIntentSource,
        startContext?.captureAction
      );
      return;
    }

    if (startContext?.captureAction !== undefined) {
      await runImmediateScreenshot(
        type,
        args,
        runToken,
        contentIntentSource,
        startContext.captureAction
      );
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
  contentIntentSource: ContentPrivilegedActionIntentSource | undefined,
  captureAction?: CaptureActionType
) {
  args.session.countdownRunToken = runToken;
  startCountdown({
    onElapsed: () => {
      if (captureAction !== undefined) {
        void executeCountdownScreenshot(type, args, runToken, contentIntentSource, captureAction);
      } else {
        void executeCountdownScreenshot(type, args, runToken, contentIntentSource);
      }
    },
    session: args.session,
    setCountdown: args.setCountdown,
    setIsToolbarVisible: args.params.setIsToolbarVisible,
    setNavigationLockEnabled: args.params.setNavigationLockEnabled,
    timerDelay: args.params.timerDelay,
    type,
  });
}
