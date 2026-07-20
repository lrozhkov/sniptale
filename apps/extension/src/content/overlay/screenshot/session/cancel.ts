import { setUIHidden } from '../../../selection/locker';
import { resetCountdownRuntimeState, restoreCountdownLockOnCancel } from '../countdown/controller';
import { cancelQuickActionCountdown, completeScreenshotRun } from '../mode';
import type { CreateScreenshotControllerActionsArgs } from './action-types';

export function createHandleCancelCountdown(args: CreateScreenshotControllerActionsArgs) {
  return () => {
    if (args.refs.countdownTimeoutRef.current) {
      resetCountdownRuntimeState({
        countdownTimeoutRef: args.refs.countdownTimeoutRef,
        pendingScreenshotType: args.refs.pendingScreenshotType,
        setCountdown: args.setCountdown,
      });
    } else {
      args.setCountdown(null);
      args.refs.pendingScreenshotType.current = null;
    }
    setUIHidden(false);
    completeScreenshotRun(args.runtime, undefined);

    if (args.params.quickActionOverlayRef.current) {
      cancelQuickActionCountdown(args.params, args.runtime, args.refs.countdownLockSessionRef);
      return;
    }

    restoreCountdownLockOnCancel({
      countdownLockSessionRef: args.refs.countdownLockSessionRef,
      navigationLockStateBeforeScreenshot: args.refs.navigationLockStateBeforeScreenshot,
      setNavigationLockEnabled: args.params.setNavigationLockEnabled,
    });
    args.params.setIsToolbarVisible(true);
  };
}
