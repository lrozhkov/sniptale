import { startCountdown, type ScreenshotType } from '../countdown/controller';
import { executeCountdownScreenshot } from './elapsed';
import { runImmediateScreenshot } from './immediate';
import { beginScreenshotRun, prepareScreenshotMode, syncCaptureAction } from '../mode';
import type { CreateScreenshotControllerActionsArgs } from './action-types';
import type { ContentPrivilegedActionIntentSource } from '../../../application/privileged-action-intent';
import type { ScreenshotStartContext } from '../types';

export function createHandleTakeScreenshot(args: CreateScreenshotControllerActionsArgs) {
  return async (
    type: ScreenshotType,
    contentIntentSource?: ContentPrivilegedActionIntentSource,
    startContext?: ScreenshotStartContext
  ) => {
    await syncCaptureAction(args.params);
    prepareScreenshotMode(args.params, args.refs.navigationLockStateBeforeScreenshot, startContext);
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
  args.refs.countdownRunTokenRef.current = runToken;
  startCountdown({
    countdownLockSessionRef: args.refs.countdownLockSessionRef,
    countdownTimeoutRef: args.refs.countdownTimeoutRef,
    navigationLockStateBeforeScreenshot: args.refs.navigationLockStateBeforeScreenshot,
    onElapsed: () => {
      void executeCountdownScreenshot(type, args, runToken, contentIntentSource);
    },
    pendingScreenshotType: args.refs.pendingScreenshotType,
    setCountdown: args.setCountdown,
    setIsToolbarVisible: args.params.setIsToolbarVisible,
    setNavigationLockEnabled: args.params.setNavigationLockEnabled,
    timerDelay: args.params.timerDelay,
    type,
  });
}
