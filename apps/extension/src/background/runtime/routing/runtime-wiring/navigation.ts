import { browserTabs } from '@sniptale/platform/browser/tabs';
import { browserWebNavigation } from '@sniptale/platform/browser/web-navigation';
import { createLogger } from '@sniptale/platform/observability/logger';
import { cleanupScreenshotModeAfterNavigation } from '../../tab-mode-router-screenshot';
import { restorePinnedToolbarAfterNavigation } from '../../page-access/pinned-toolbar-restore';
import { invalidatePinnedToolbarOperations } from '../../page-access/pinned-toolbar-operation';
import {
  handleExportHarNavigationStart,
  handleTabNavigation,
} from '../../../diagnostics/lifecycle';
import { clearBackgroundRuntimeTabEditingState } from '../../../application/runtime-state';
import {
  ensureActiveVideoRecordingLeaseHydrated,
  handleRegionSelectionNavigationStart,
  handleTabRecordingNavigationCommitted,
  handleTabRecordingNavigationCompleted,
  handleTabRecordingNavigationError,
  handleTabRecordingNavigationStart,
} from '../../../media/lifecycle';
import { parseTopLevelDocumentNavigation, parseTopLevelNavigation } from './parsers';
import type { BackgroundModeState } from './shared';
import { ensureActivePageAccessRuntime } from '../../page-access/service';

const logger = createLogger({ namespace: 'BackgroundRuntimeNavigationWiring' });

function runAfterVideoLeaseHydration(description: string, work: () => void): void {
  void ensureActiveVideoRecordingLeaseHydrated()
    .then(work)
    .catch((error) => {
      logger.warn(`Failed to ${description} after recording lease hydration`, error);
    });
}

export function registerNavigationListeners(state: BackgroundModeState): void {
  browserTabs.subscribeToUpdated((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'loading' && tab.url) {
      handleTabNavigation(tabId, tab.url);
    }

    if (changeInfo.status === 'complete') {
      void restorePinnedToolbarAfterNavigation(tabId, state).catch((error) => {
        logger.warn('Failed to restore pinned toolbar after navigation', error);
      });
    }
  });

  browserWebNavigation.subscribeToBeforeNavigate((details: unknown) => {
    const navigation = parseTopLevelNavigation(details);
    if (!navigation) {
      return;
    }

    invalidatePinnedToolbarOperations(navigation.tabId);
    clearBackgroundRuntimeTabEditingState(state, navigation.tabId);
    void cleanupScreenshotModeAfterNavigation(
      navigation.tabId,
      state.screenshotModeState,
      state.viewportState,
      state.viewportOwnerState,
      state.webSnapshotViewerPorts
    ).catch((error) => {
      logger.warn('Failed to clean screenshot mode after navigation', error);
    });
    runAfterVideoLeaseHydration('process recording navigation', () => {
      handleRegionSelectionNavigationStart(navigation.tabId);
      handleTabRecordingNavigationStart(navigation.tabId);
    });
    void handleExportHarNavigationStart(navigation.tabId).catch((error) => {
      logger.warn('Failed to clean HAR export after navigation', error);
    });
  });

  browserWebNavigation.subscribeToCommitted((details: unknown) => {
    const navigation = parseTopLevelDocumentNavigation(details);
    if (!navigation) return;
    runAfterVideoLeaseHydration('bind recording navigation document', () => {
      handleTabRecordingNavigationCommitted(navigation.tabId, navigation.documentId);
    });
  });

  browserWebNavigation.subscribeToCompleted((details: unknown) => {
    const navigation = parseTopLevelDocumentNavigation(details);
    if (!navigation) return;
    runAfterVideoLeaseHydration('complete recording navigation', () => {
      handleTabRecordingNavigationCompleted(
        navigation.tabId,
        navigation.documentId,
        ensureActivePageAccessRuntime
      );
    });
  });

  browserWebNavigation.subscribeToErrorOccurred((details: unknown) => {
    const navigation = parseTopLevelDocumentNavigation(details);
    if (!navigation) return;
    runAfterVideoLeaseHydration('reconcile failed recording navigation', () => {
      handleTabRecordingNavigationError(
        navigation.tabId,
        navigation.documentId,
        ensureActivePageAccessRuntime
      );
    });
  });
}
