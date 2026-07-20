import { expect, it } from 'vitest';

import {
  cleanupScreenshotModeAfterNavigation,
  handleTabNavigation,
  handleTabUpdated,
  handleControlledCursorNavigationStart,
  handleExportHarNavigationStart,
  handleRegionSelectionNavigationStart,
  handleViewportRecordingNavigationStart,
  navigationListenerRef,
  parseTopLevelNavigation,
  updatedListenerRef,
  createModeState,
} from '../../../../../../../tooling/test/support/background-runtime-wiring.test-support';
import { registerNavigationListeners } from './navigation';

it('routes tab updates and top-level navigation through their owning seams', () => {
  const state = createModeState();

  registerNavigationListeners(state);

  updatedListenerRef.current?.(7, { status: 'loading' }, {
    url: 'https://example.com',
  } as chrome.tabs.Tab);
  updatedListenerRef.current?.(7, { status: 'complete' }, {
    url: 'https://example.com',
  } as chrome.tabs.Tab);

  expect(handleTabNavigation).toHaveBeenCalledWith(7, 'https://example.com');
  expect(handleTabUpdated).toHaveBeenCalledTimes(2);

  navigationListenerRef.current?.({ frameId: 3, tabId: 7 });
  expect(handleViewportRecordingNavigationStart).not.toHaveBeenCalled();

  parseTopLevelNavigation.mockReturnValue({ frameId: 0, tabId: 7 });
  navigationListenerRef.current?.({ frameId: 0, tabId: 7 });
  expect(state.highlighterModeState.has(7)).toBe(false);
  expect(state.quickEditModeState.has(7)).toBe(false);
  expect(cleanupScreenshotModeAfterNavigation).toHaveBeenCalledWith(
    7,
    state.screenshotModeState,
    state.viewportState,
    state.viewportOwnerState,
    state.webSnapshotViewerPorts
  );
  expect(handleRegionSelectionNavigationStart).toHaveBeenCalledWith(7);
  expect(handleExportHarNavigationStart).toHaveBeenCalledWith(7);
  expect(handleViewportRecordingNavigationStart).toHaveBeenCalledWith(7);
  expect(handleControlledCursorNavigationStart).toHaveBeenCalledWith(7);
});
