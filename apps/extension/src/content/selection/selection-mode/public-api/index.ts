import { disableNavigationLock, enableNavigationLock } from '../../locker';
import type { CaptureArea } from '@sniptale/runtime-contracts/messaging/capture-messages';
import { createLogger } from '@sniptale/platform/observability/logger';
import type { SelectionModeSession } from '../session';

const logger = createLogger({ namespace: 'ContentSelectionMode' });

type SelectionModeEnableSession = Pick<
  SelectionModeSession,
  'currentState' | 'isActive' | 'rejectCallback' | 'resolveCallback'
>;

function logSelectionModeDiag(event: string, details?: Record<string, unknown>): void {
  logger.debug(event, details ?? {});
}

export function enableSelectionModeApi(args: {
  cleanup: () => void;
  createHoverElements: () => void;
  createOverlayContainer: () => void;
  enableCursor: () => void;
  prepareUi: () => Promise<void>;
  session: SelectionModeEnableSession;
  setupEventListeners: () => void;
}) {
  return new Promise<CaptureArea>((resolve, reject) => {
    void (async () => {
      if (args.session.isActive) {
        logSelectionModeDiag('enableSelectionModeApi.cleanup-existing-session');
        args.cleanup();
      }

      args.session.resolveCallback = resolve;
      args.session.rejectCallback = reject;

      try {
        args.session.currentState = 'idle';
        enableNavigationLock(true);
        await args.prepareUi();
        args.createOverlayContainer();
        args.createHoverElements();
        args.enableCursor();
        args.setupEventListeners();
        args.session.isActive = true;
      } catch (error) {
        disableNavigationLock();
        args.cleanup();
        reject(error);
        return;
      }

      logSelectionModeDiag('enableSelectionModeApi.enabled', {
        isActive: args.session.isActive,
      });
      logger.info('Selection mode enabled');
    })();
  });
}

export function disableSelectionModeApi(args: {
  cleanup: () => void;
  session: Pick<SelectionModeSession, 'rejectCallback'>;
}) {
  const rejectCallback = args.session.rejectCallback;
  logSelectionModeDiag('disableSelectionModeApi.start', {
    hasPendingRejectCallback: Boolean(rejectCallback),
  });
  args.cleanup();
  disableNavigationLock();
  rejectCallback?.(new Error('Cancelled by user'));

  logSelectionModeDiag('disableSelectionModeApi.complete', {
    didRejectPendingSelection: Boolean(rejectCallback),
  });
  logger.info('Selection mode disabled');
}

export function isSelectionModeActiveApi(isActive: boolean) {
  return isActive;
}
