import { setUIHidden } from '../../../selection/locker';
import { resetCountdownRuntimeState, restoreCountdownLockOnCancel } from '../countdown/controller';
import { cancelQuickActionCountdown, completeScreenshotRun } from '../mode';
import type { CreateScreenshotControllerActionsArgs } from './action-types';

export function createHandleCancelCountdown(args: CreateScreenshotControllerActionsArgs) {
  return () => {
    if (args.session.countdownTimeout) {
      resetCountdownRuntimeState({
        session: args.session,
        setCountdown: args.setCountdown,
      });
    } else {
      args.setCountdown(null);
      args.session.pendingType = null;
    }
    setUIHidden(false);
    completeScreenshotRun(args.runtime, undefined);

    if (args.params.quickActionOverlayRef.current) {
      cancelQuickActionCountdown(args.params, args.runtime, args.session);
      return;
    }

    restoreCountdownLockOnCancel({
      session: args.session,
      setNavigationLockEnabled: args.params.setNavigationLockEnabled,
    });
    args.params.setIsToolbarVisible(true);
  };
}
