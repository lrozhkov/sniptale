import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  buildScreenshotModeStatusResponseMock,
  cleanupScreenshotModeAfterNavigationMock,
  disableScreenshotModeMock,
  enableScreenshotModeMock,
  handleSetViewportMock,
} = vi.hoisted(() => ({
  buildScreenshotModeStatusResponseMock: vi.fn(),
  cleanupScreenshotModeAfterNavigationMock: vi.fn(),
  disableScreenshotModeMock: vi.fn(),
  enableScreenshotModeMock: vi.fn(),
  handleSetViewportMock: vi.fn(),
}));

vi.mock('../tab-mode-router-screenshot', () => ({
  buildScreenshotModeStatusResponse: buildScreenshotModeStatusResponseMock,
  cleanupScreenshotModeAfterNavigation: cleanupScreenshotModeAfterNavigationMock,
  disableScreenshotMode: disableScreenshotModeMock,
  enableScreenshotMode: enableScreenshotModeMock,
  handleSetViewport: handleSetViewportMock,
}));

import {
  MessageType,
  type TabModeMessage,
} from '@sniptale/runtime-contracts/messaging/message-types';
import { routeTabModeMessage } from './router';

function resetTabModeRouterMocks() {
  vi.clearAllMocks();
  buildScreenshotModeStatusResponseMock.mockReturnValue(true);
  disableScreenshotModeMock.mockResolvedValue(undefined);
  enableScreenshotModeMock.mockResolvedValue(undefined);
  handleSetViewportMock.mockResolvedValue(undefined);
}

function createModeMaps() {
  return {
    screenshotModeState: new Map<number, boolean>(),
    highlighterModeState: new Map<number, boolean>(),
    quickEditModeState: new Map<number, boolean>(),
    viewportOwnerState: new Map(),
    viewportState: new Map<number, { width: number; height: number } | null>(),
  };
}

function createRouteArgs<TMessage extends TabModeMessage>(message: TMessage) {
  return {
    message,
    resolvedTabId: 7,
    senderDocumentId: 'content-document-7',
    sendResponse: vi.fn(),
    webSnapshotViewerPorts: new Map(),
    ...createModeMaps(),
  };
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

async function verifiesEnableScreenshotModeAsyncSuccess() {
  const args = createRouteArgs({ type: MessageType.ENABLE_SCREENSHOT_MODE });

  expect(routeTabModeMessage(args)).toBe(true);
  await flushPromises();

  expect(enableScreenshotModeMock).toHaveBeenCalledWith(
    7,
    args.screenshotModeState,
    args.viewportState,
    args.viewportOwnerState,
    args.webSnapshotViewerPorts
  );
  expect(args.sendResponse).toHaveBeenCalledWith({ success: true, result: 'accepted' });
}

async function verifiesDisableScreenshotModeAsyncError() {
  const args = createRouteArgs({ type: MessageType.DISABLE_SCREENSHOT_MODE });

  disableScreenshotModeMock.mockRejectedValueOnce('detach failed');

  expect(routeTabModeMessage(args)).toBe(true);
  await flushPromises();

  expect(disableScreenshotModeMock).toHaveBeenCalledWith(
    7,
    args.screenshotModeState,
    args.viewportState,
    args.viewportOwnerState,
    args.webSnapshotViewerPorts
  );
  expect(args.sendResponse).toHaveBeenCalledWith({
    success: false,
    error: 'detach failed',
  });
}

function verifiesScreenshotModeStatusDelegation() {
  const args = createRouteArgs({ type: MessageType.SCREENSHOT_MODE_STATUS });

  expect(routeTabModeMessage(args)).toBe(true);
  expect(buildScreenshotModeStatusResponseMock).toHaveBeenCalledWith(
    7,
    args.screenshotModeState,
    args.viewportState,
    args.sendResponse,
    'content-document-7'
  );
}

async function verifiesViewportRoutes() {
  const setViewportArgs = createRouteArgs({
    type: MessageType.SET_VIEWPORT,
    width: 1280,
    height: 720,
  });

  expect(routeTabModeMessage(setViewportArgs)).toBe(true);
  await flushPromises();

  expect(handleSetViewportMock).toHaveBeenCalledWith(
    7,
    1280,
    720,
    setViewportArgs.viewportState,
    setViewportArgs.viewportOwnerState,
    setViewportArgs.webSnapshotViewerPorts
  );
  expect(setViewportArgs.sendResponse).toHaveBeenCalledWith({
    success: true,
    result: 'accepted',
  });

  const getViewportArgs = createRouteArgs({ type: MessageType.GET_VIEWPORT_STATUS });
  getViewportArgs.viewportState.set(7, { width: 1440, height: 900 });

  expect(routeTabModeMessage(getViewportArgs)).toBe(true);
  expect(getViewportArgs.sendResponse).toHaveBeenCalledWith({
    success: true,
    viewport: { width: 1440, height: 900 },
  });
}

function verifiesHighlighterRoutes() {
  const enableArgs = createRouteArgs({ type: MessageType.ENABLE_HIGHLIGHTER_MODE });
  expect(routeTabModeMessage(enableArgs)).toBe(true);
  expect(enableArgs.highlighterModeState.get(7)).toBe(true);
  expect(enableArgs.sendResponse).toHaveBeenCalledWith({ success: true, result: 'accepted' });

  const statusArgs = createRouteArgs({ type: MessageType.HIGHLIGHTER_MODE_STATUS });
  statusArgs.highlighterModeState.set(7, true);
  expect(routeTabModeMessage(statusArgs)).toBe(true);
  expect(statusArgs.sendResponse).toHaveBeenCalledWith({ success: true, enabled: true });

  const disableArgs = createRouteArgs({ type: MessageType.DISABLE_HIGHLIGHTER_MODE });
  disableArgs.highlighterModeState.set(7, true);
  expect(routeTabModeMessage(disableArgs)).toBe(true);
  expect(disableArgs.highlighterModeState.has(7)).toBe(false);
  expect(disableArgs.sendResponse).toHaveBeenCalledWith({ success: true, result: 'accepted' });
}

function verifiesQuickEditRoutes() {
  const enableArgs = createRouteArgs({ type: MessageType.ENABLE_QUICK_EDIT_MODE });
  expect(routeTabModeMessage(enableArgs)).toBe(true);
  expect(enableArgs.quickEditModeState.get(7)).toBe(true);
  expect(enableArgs.sendResponse).toHaveBeenCalledWith({ success: true, result: 'accepted' });

  const statusArgs = createRouteArgs({ type: MessageType.QUICK_EDIT_MODE_STATUS });
  statusArgs.quickEditModeState.set(7, true);
  expect(routeTabModeMessage(statusArgs)).toBe(true);
  expect(statusArgs.sendResponse).toHaveBeenCalledWith({ success: true, enabled: true });

  const disableArgs = createRouteArgs({ type: MessageType.DISABLE_QUICK_EDIT_MODE });
  disableArgs.quickEditModeState.set(7, true);
  expect(routeTabModeMessage(disableArgs)).toBe(true);
  expect(disableArgs.quickEditModeState.has(7)).toBe(false);
  expect(disableArgs.sendResponse).toHaveBeenCalledWith({ success: true, result: 'accepted' });
}

describe('tab-mode-router', () => {
  beforeEach(resetTabModeRouterMocks);

  it(
    'routes enable screenshot mode through async success response',
    verifiesEnableScreenshotModeAsyncSuccess
  );
  it(
    'routes disable screenshot mode through async error response',
    verifiesDisableScreenshotModeAsyncError
  );
  it(
    'delegates screenshot mode status requests to the screenshot helper',
    verifiesScreenshotModeStatusDelegation
  );
  it('handles set/get viewport routes', verifiesViewportRoutes);
  it('toggles and reports highlighter mode state', verifiesHighlighterRoutes);
  it('toggles and reports quick edit mode state', verifiesQuickEditRoutes);
});
