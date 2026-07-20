import { browserTabs } from '@sniptale/platform/browser/tabs';
import { browserWebNavigation } from '@sniptale/platform/browser/web-navigation';
import { createLogger } from '@sniptale/platform/observability/logger';
import { cleanupScreenshotModeAfterNavigation } from '../../tab-mode-router-screenshot';
import {
  handleExportHarNavigationStart,
  handleTabNavigation,
} from '../../../diagnostics/lifecycle';
import { clearBackgroundRuntimeTabEditingState } from '../../../application/runtime-state';
import {
  handleControlledCursorNavigationStart,
  handleRegionSelectionNavigationStart,
  handleTabUpdated,
  handleViewportRecordingNavigationStart,
} from '../../../media/lifecycle';
import { parseTopLevelNavigation } from './parsers';
import type { BackgroundModeState } from './shared';

const logger = createLogger({ namespace: 'BackgroundRuntimeNavigationWiring' });

export function registerNavigationListeners(state: BackgroundModeState): void {
  browserTabs.subscribeToUpdated((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'loading' && tab.url) {
      handleTabNavigation(tabId, tab.url);
    }

    handleTabUpdated(tabId, changeInfo);
  });

  browserWebNavigation.subscribeToBeforeNavigate((details: unknown) => {
    const navigation = parseTopLevelNavigation(details);
    if (!navigation) {
      return;
    }

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
    void handleExportHarNavigationStart(navigation.tabId).catch((error) => {
      logger.warn('Failed to clean HAR export after navigation', error);
    });
    handleViewportRecordingNavigationStart(navigation.tabId);
    handleControlledCursorNavigationStart(navigation.tabId);
  });
}
