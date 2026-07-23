import { disableNavigationLock } from '../../../locker';
import { logSelectionModeDiag, logSelectionModeError } from '../../diag';
import { buildSelectionCaptureArea } from '../../runtime';
import type { SelectionModeEventsBridgeArgs } from './types';

export function createSelectionModeConfirmSelection(args: SelectionModeEventsBridgeArgs) {
  return () => {
    const area = buildSelectionCaptureArea(args.runtimeArgs.state.currentSelection);
    const resolveCallback = args.runtimeArgs.state.resolveCallback;

    logSelectionModeDiag('confirmSelection.start', {
      area,
      hasResolveCallback: Boolean(resolveCallback),
    });

    try {
      args.cleanupEvent();
      logSelectionModeDiag('confirmSelection.after-cleanup');
      disableNavigationLock();
      logSelectionModeDiag('confirmSelection.after-disableNavigationLock');
      resolveCallback?.(area);
      logSelectionModeDiag('confirmSelection.after-resolve', {
        didResolve: Boolean(resolveCallback),
      });
    } catch (error) {
      logSelectionModeError('confirmSelection.failed', error);
      throw error;
    }
  };
}
