// policyStateId: video-capture-surface-sessions
// Navigation transactions suspend and revalidate the active source session.
import { createLogger } from '@sniptale/platform/observability/logger';
import { deferVideoCaptureSurfaceWorkUntilRecovery } from '../../../capture-surface';
import {
  beginTabNavigationTransaction,
  bindTabNavigationDocument,
  completeTabNavigationDocument,
  failActiveTabNavigation,
  isTabNavigationTransactionPending,
  markTabNavigationManuallyPaused,
  recoverDetachedViewport,
  resetTabNavigationTransactionForTests,
} from './transaction';
import type { TabNavigationPageAccessVerifier } from './page-effects';
import { queueTabRecordingWindowBoundsChanged, resetTabRecordingResizeForTests } from './resize';

const logger = createLogger({ namespace: 'BackgroundVideoTabNavigation' });

const unavailablePageAccessVerifier: TabNavigationPageAccessVerifier = async () => {
  throw new Error('Recording page access verifier is unavailable');
};

function deferUntilRecovery(work: () => void): boolean {
  return deferVideoCaptureSurfaceWorkUntilRecovery(work, (error) => {
    logger.error('Tab recording recovery failed during navigation', error);
    failActiveTabNavigation(error);
  });
}

export function handleTabRecordingNavigationStart(tabId: number): boolean {
  if (deferUntilRecovery(() => handleTabRecordingNavigationStart(tabId))) return true;
  return beginTabNavigationTransaction(tabId, true) !== null;
}

export function handleTabRecordingNavigationCommitted(tabId: number, documentId: string): boolean {
  if (deferUntilRecovery(() => handleTabRecordingNavigationCommitted(tabId, documentId))) {
    return true;
  }
  return bindTabNavigationDocument(tabId, documentId);
}

export function handleTabRecordingNavigationCompleted(
  tabId: number,
  documentId: string,
  pageAccessVerifier: TabNavigationPageAccessVerifier = unavailablePageAccessVerifier
): boolean {
  if (
    deferUntilRecovery(() =>
      handleTabRecordingNavigationCompleted(tabId, documentId, pageAccessVerifier)
    )
  ) {
    return true;
  }
  return completeTabNavigationDocument(tabId, documentId, pageAccessVerifier);
}

export function handleTabRecordingNavigationError(
  tabId: number,
  documentId: string,
  pageAccessVerifier: TabNavigationPageAccessVerifier = unavailablePageAccessVerifier
): boolean {
  if (
    deferUntilRecovery(() =>
      handleTabRecordingNavigationError(tabId, documentId, pageAccessVerifier)
    )
  ) {
    return true;
  }
  return completeTabNavigationDocument(tabId, documentId, pageAccessVerifier);
}

export function handleTabRecordingDebuggerDetach(
  tabId: number,
  pageAccessVerifier: TabNavigationPageAccessVerifier = unavailablePageAccessVerifier
): boolean {
  if (deferUntilRecovery(() => handleTabRecordingDebuggerDetach(tabId, pageAccessVerifier))) {
    return true;
  }
  return recoverDetachedViewport(tabId, pageAccessVerifier);
}

export function handleTabRecordingWindowBoundsChanged(windowId: number): boolean {
  if (deferUntilRecovery(() => handleTabRecordingWindowBoundsChanged(windowId))) return true;
  return queueTabRecordingWindowBoundsChanged(windowId);
}

export function isTabRecordingNavigationPending(): boolean {
  return isTabNavigationTransactionPending();
}

export function markTabRecordingManuallyPaused(): void {
  markTabNavigationManuallyPaused();
}

export function resetTabRecordingNavigationForTests(): void {
  resetTabNavigationTransactionForTests();
  resetTabRecordingResizeForTests();
}
