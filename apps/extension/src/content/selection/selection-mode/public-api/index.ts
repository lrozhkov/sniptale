import { disableNavigationLock, enableNavigationLock } from '../../locker';
import type { CaptureArea } from '@sniptale/runtime-contracts/messaging/capture-messages';
import { createLogger } from '@sniptale/platform/observability/logger';
import type { SelectionModeSession } from '../session';
import type { SelectionModeActivationOptions } from '../types';

const logger = createLogger({ namespace: 'ContentSelectionMode' });

type SelectionModeEnableSession = Pick<
  SelectionModeSession,
  | 'frozenFrame'
  | 'captureAction'
  | 'currentState'
  | 'isActive'
  | 'onCaptureActionChange'
  | 'onConfirmEvent'
  | 'rejectCallback'
  | 'resolveCallback'
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
  options?: SelectionModeActivationOptions;
  session: SelectionModeEnableSession;
  setupEventListeners: () => void;
}) {
  return new Promise<CaptureArea>((resolve, reject) => {
    void (async () => {
      if (args.session.isActive || args.session.resolveCallback) {
        logSelectionModeDiag('enableSelectionModeApi.cleanup-existing-session');
        const rejectPrevious = args.session.rejectCallback;
        args.cleanup();
        rejectPrevious?.(new Error('Cancelled by user'));
      }

      args.session.resolveCallback = resolve;
      args.session.rejectCallback = reject;
      args.session.frozenFrame = args.options?.frozenFrame ?? null;
      args.session.captureAction = args.options?.captureAction ?? 'download_default';
      args.session.onCaptureActionChange = args.options?.onCaptureActionChange ?? null;
      args.session.onConfirmEvent = args.options?.onConfirmEvent ?? null;

      try {
        args.session.currentState = 'idle';
        enableNavigationLock(true);
        await args.prepareUi();
        if (args.session.resolveCallback !== resolve) {
          reject(new Error('Cancelled by user'));
          return;
        }
        args.createOverlayContainer();
        args.createHoverElements();
        args.enableCursor();
        args.setupEventListeners();
        args.session.isActive = true;
      } catch (error) {
        if (args.session.resolveCallback !== resolve) {
          reject(error);
          return;
        }
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
