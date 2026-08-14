import { browserTabs } from '@sniptale/platform/browser/tabs';
import { browserWebNavigation } from '@sniptale/platform/browser/web-navigation';
import { createLogger } from '@sniptale/platform/observability/logger';
import { cleanupScreenshotModeAfterNavigation } from '../../tab-mode-router-screenshot';
import { restorePinnedToolbarAfterNavigation } from '../../page-access/pinned-toolbar-restore';
import { invalidatePinnedToolbarOperations } from '../../page-access/pinned-toolbar-operation';
import { handleTabNavigation } from '../../../diagnostics/lifecycle';
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
import { bindAnnotationForkSessionDocument } from '../../../annotation-fork-session/route';

const logger = createLogger({ namespace: 'BackgroundRuntimeNavigationWiring' });

function runWithVideoLeaseHydrationFallback(description: string, work: () => boolean): void {
  try {
    if (work()) return;
  } catch (error) {
    logger.warn(`Failed to ${description} from active recording state`, error);
    return;
  }
  void ensureActiveVideoRecordingLeaseHydrated()
    .then(() => work())
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
    handleRegionSelectionNavigationStart(navigation.tabId);
    runWithVideoLeaseHydrationFallback('process recording navigation', () =>
      handleTabRecordingNavigationStart(navigation.tabId)
    );
  });

  browserWebNavigation.subscribeToCommitted((details: unknown) => {
    const navigation = parseTopLevelDocumentNavigation(details);
    if (!navigation) return;
    void bindAnnotationForkSessionDocument(navigation.tabId, navigation.documentId).catch(
      (error) => {
        logger.warn('Failed to bind annotation fork session document', error);
      }
    );
    runWithVideoLeaseHydrationFallback('bind recording navigation document', () =>
      handleTabRecordingNavigationCommitted(navigation.tabId, navigation.documentId)
    );
  });

  browserWebNavigation.subscribeToCompleted((details: unknown) => {
    const navigation = parseTopLevelDocumentNavigation(details);
    if (!navigation) return;
    runWithVideoLeaseHydrationFallback('complete recording navigation', () =>
      handleTabRecordingNavigationCompleted(
        navigation.tabId,
        navigation.documentId,
        ensureActivePageAccessRuntime
      )
    );
  });

  browserWebNavigation.subscribeToErrorOccurred((details: unknown) => {
    const navigation = parseTopLevelDocumentNavigation(details);
    if (!navigation) return;
    runWithVideoLeaseHydrationFallback('reconcile failed recording navigation', () =>
      handleTabRecordingNavigationError(
        navigation.tabId,
        navigation.documentId,
        ensureActivePageAccessRuntime
      )
    );
  });
}
