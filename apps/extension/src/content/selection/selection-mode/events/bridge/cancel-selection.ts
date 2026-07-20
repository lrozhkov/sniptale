import { disableNavigationLock } from '../../../locker';
import { logSelectionModeDiag, logSelectionModeError } from '../../diag';
import type { SelectionModeEventsBridgeArgs } from './types';

export function createSelectionModeCancelSelection(args: SelectionModeEventsBridgeArgs) {
  return () => {
    const rejectCallback = args.getRejectCallback();

    logSelectionModeDiag('cancelSelection.start', {
      hasRejectCallback: Boolean(rejectCallback),
    });

    try {
      args.cleanupEvent();
      logSelectionModeDiag('cancelSelection.after-cleanup');
      disableNavigationLock();
      logSelectionModeDiag('cancelSelection.after-disableNavigationLock');
      rejectCallback?.(new Error('Cancelled by user'));
      logSelectionModeDiag('cancelSelection.after-reject', {
        didReject: Boolean(rejectCallback),
      });
    } catch (error) {
      logSelectionModeError('cancelSelection.failed', error);
      throw error;
    }
  };
}
