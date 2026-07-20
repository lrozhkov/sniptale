import { disableNavigationLock, enableNavigationLock } from '../../locker';
import type { CaptureArea } from '@sniptale/runtime-contracts/messaging/capture-messages';
import { createLogger } from '@sniptale/platform/observability/logger';

const logger = createLogger({ namespace: 'ContentSelectionMode' });

function logSelectionModeDiag(event: string, details?: Record<string, unknown>): void {
  logger.debug(event, details ?? {});
}

export function enableSelectionModeApi(args: {
  cleanup: () => void;
  createHoverElements: () => void;
  createOverlayContainer: () => void;
  enableCursor: () => void;
  getIsActive: () => boolean;
  prepareUi: () => Promise<void>;
  setCurrentState: (state: 'idle') => void;
  setIsActive: (value: boolean) => void;
  setRejectCallback: (callback: ((reason?: unknown) => void) | null) => void;
  setResolveCallback: (callback: ((value: CaptureArea) => void) | null) => void;
  setupEventListeners: () => void;
}) {
  return new Promise<CaptureArea>((resolve, reject) => {
    void (async () => {
      if (args.getIsActive()) {
        logSelectionModeDiag('enableSelectionModeApi.cleanup-existing-session');
        args.cleanup();
      }

      args.setResolveCallback(resolve);
      args.setRejectCallback(reject);

      try {
        args.setCurrentState('idle');
        enableNavigationLock(true);
        await args.prepareUi();
        args.createOverlayContainer();
        args.createHoverElements();
        args.enableCursor();
        args.setupEventListeners();
        args.setIsActive(true);
      } catch (error) {
        disableNavigationLock();
        args.cleanup();
        args.setIsActive(false);
        args.setCurrentState('idle');
        args.setResolveCallback(null);
        args.setRejectCallback(null);
        reject(error);
        return;
      }

      logSelectionModeDiag('enableSelectionModeApi.enabled', {
        isActive: args.getIsActive(),
      });
      logger.info('Selection mode enabled');
    })();
  });
}

export function disableSelectionModeApi(args: {
  cleanup: () => void;
  getRejectCallback: () => ((error: Error) => void) | null;
  setAspectRatio: (value: number | null) => void;
  setCurrentSelection: (selection: { x: number; y: number; width: number; height: number }) => void;
  setCurrentState: (state: 'idle') => void;
  setIsActive: (value: boolean) => void;
  setMaintainAspectRatio: (value: boolean) => void;
  setRejectCallback: (callback: ((error: Error) => void) | null) => void;
  setResolveCallback: (callback: ((value: CaptureArea) => void) | null) => void;
}) {
  const rejectCallback = args.getRejectCallback();
  logSelectionModeDiag('disableSelectionModeApi.start', {
    hasPendingRejectCallback: Boolean(rejectCallback),
  });
  args.cleanup();
  disableNavigationLock();
  args.setIsActive(false);
  args.setCurrentState('idle');
  args.setCurrentSelection({ x: 0, y: 0, width: 0, height: 0 });
  args.setAspectRatio(null);
  args.setMaintainAspectRatio(false);
  args.setResolveCallback(null);
  args.setRejectCallback(null);
  rejectCallback?.(new Error('Cancelled by user'));

  logSelectionModeDiag('disableSelectionModeApi.complete', {
    didRejectPendingSelection: Boolean(rejectCallback),
  });
  logger.info('Selection mode disabled');
}

export function isSelectionModeActiveApi(isActive: boolean) {
  return isActive;
}
