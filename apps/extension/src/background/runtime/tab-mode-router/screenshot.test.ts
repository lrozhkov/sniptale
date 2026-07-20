import { beforeEach, expect, it, vi } from 'vitest';

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

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { routeScreenshotModeMessage, routeViewportMessage } from './screenshot';
import type { TabModeContext } from './shared';

function createContext(): TabModeContext {
  return {
    resolvedTabId: 7,
    senderDocumentId: 'content-document-7',
    sendResponse: vi.fn(),
    screenshotModeState: new Map<number, boolean>(),
    highlighterModeState: new Map<number, boolean>(),
    quickEditModeState: new Map<number, boolean>(),
    viewportOwnerState: new Map(),
    viewportState: new Map<number, { width: number; height: number } | null>(),
    webSnapshotViewerPorts: new Map(),
  };
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  vi.clearAllMocks();
  buildScreenshotModeStatusResponseMock.mockReturnValue(true);
  disableScreenshotModeMock.mockResolvedValue(undefined);
  enableScreenshotModeMock.mockResolvedValue(undefined);
  handleSetViewportMock.mockResolvedValue(undefined);
});

it('routes screenshot mode messages through async success and delegated status handling', async () => {
  const enableContext = createContext();
  expect(
    routeScreenshotModeMessage({ type: MessageType.ENABLE_SCREENSHOT_MODE }, enableContext)
  ).toBe(true);
  await flushPromises();
  expect(enableScreenshotModeMock).toHaveBeenCalledWith(
    7,
    enableContext.screenshotModeState,
    enableContext.viewportState,
    enableContext.viewportOwnerState,
    enableContext.webSnapshotViewerPorts
  );
  expect(enableContext.sendResponse).toHaveBeenCalledWith({ success: true, result: 'accepted' });

  const disableContext = createContext();
  disableScreenshotModeMock.mockRejectedValueOnce('detach failed');
  expect(
    routeScreenshotModeMessage({ type: MessageType.DISABLE_SCREENSHOT_MODE }, disableContext)
  ).toBe(true);
  await flushPromises();
  expect(disableScreenshotModeMock).toHaveBeenCalledWith(
    7,
    disableContext.screenshotModeState,
    disableContext.viewportState,
    disableContext.viewportOwnerState,
    disableContext.webSnapshotViewerPorts
  );
  expect(disableContext.sendResponse).toHaveBeenCalledWith({
    success: false,
    error: 'detach failed',
  });

  const statusContext = createContext();
  expect(
    routeScreenshotModeMessage({ type: MessageType.SCREENSHOT_MODE_STATUS }, statusContext)
  ).toBe(true);
  expect(buildScreenshotModeStatusResponseMock).toHaveBeenCalledWith(
    7,
    statusContext.screenshotModeState,
    statusContext.viewportState,
    statusContext.sendResponse,
    'content-document-7'
  );
});

it('routes set viewport messages through async success responses', async () => {
  const setViewportContext = createContext();
  expect(
    routeViewportMessage(
      {
        type: MessageType.SET_VIEWPORT,
        width: 1280,
        height: 720,
      },
      setViewportContext
    )
  ).toBe(true);
  await flushPromises();
  expect(handleSetViewportMock).toHaveBeenCalledWith(
    7,
    1280,
    720,
    setViewportContext.viewportState,
    setViewportContext.viewportOwnerState,
    setViewportContext.webSnapshotViewerPorts
  );
  expect(setViewportContext.sendResponse).toHaveBeenCalledWith({
    success: true,
    result: 'accepted',
  });
});

it('routes get viewport status and rejects unsupported screenshot messages', () => {
  const getViewportContext = createContext();
  getViewportContext.viewportState.set(7, { width: 1440, height: 900 });
  expect(routeViewportMessage({ type: MessageType.GET_VIEWPORT_STATUS }, getViewportContext)).toBe(
    true
  );
  expect(getViewportContext.sendResponse).toHaveBeenCalledWith({
    success: true,
    viewport: { width: 1440, height: 900 },
  });

  expect(
    routeScreenshotModeMessage({ type: MessageType.QUICK_EDIT_MODE_STATUS }, createContext())
  ).toBe(false);
  expect(routeViewportMessage({ type: MessageType.ENABLE_HIGHLIGHTER_MODE }, createContext())).toBe(
    false
  );
});
