import { beforeEach, expect, it, vi } from 'vitest';

const {
  buildScreenshotModeStatusResponseMock,
  cleanupScreenshotModeAfterNavigationMock,
  disableScreenshotModeMock,
  enableScreenshotModeMock,
  getScreenshotPresetAvailabilitiesMock,
  handleApplyViewportPresetMock,
  handleReleaseViewportPresetMock,
} = vi.hoisted(() => ({
  buildScreenshotModeStatusResponseMock: vi.fn(),
  cleanupScreenshotModeAfterNavigationMock: vi.fn(),
  disableScreenshotModeMock: vi.fn(),
  enableScreenshotModeMock: vi.fn(),
  getScreenshotPresetAvailabilitiesMock: vi.fn(),
  handleApplyViewportPresetMock: vi.fn(),
  handleReleaseViewportPresetMock: vi.fn(),
}));

vi.mock('../tab-mode-router-screenshot', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../tab-mode-router-screenshot')>()),
  buildScreenshotModeStatusResponse: buildScreenshotModeStatusResponseMock,
  cleanupScreenshotModeAfterNavigation: cleanupScreenshotModeAfterNavigationMock,
  disableScreenshotModeForContent: disableScreenshotModeMock,
  enableScreenshotMode: enableScreenshotModeMock,
  getScreenshotPresetAvailabilities: getScreenshotPresetAvailabilitiesMock,
  handleApplyViewportPreset: handleApplyViewportPresetMock,
  handleReleaseViewportPreset: handleReleaseViewportPresetMock,
}));

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { markPreauthorizedContentActionRouteMessage } from '../../capture/routes';
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
    viewportState: new Map<
      number,
      { presetId: string; target: 'viewport' | 'window'; width: number; height: number } | null
    >(),
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
  getScreenshotPresetAvailabilitiesMock.mockResolvedValue([{ status: 'available' }]);
  handleApplyViewportPresetMock.mockResolvedValue(undefined);
  handleReleaseViewportPresetMock.mockResolvedValue(undefined);
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
    enableContext.webSnapshotViewerPorts,
    {}
  );
  expect(enableContext.sendResponse).toHaveBeenCalledWith({ success: true, result: 'accepted' });

  const disableContext = createContext();
  disableScreenshotModeMock.mockRejectedValueOnce('detach failed');
  expect(
    routeScreenshotModeMessage(
      {
        type: MessageType.DISABLE_SCREENSHOT_MODE,
        leaseGeneration: 3,
        operationGeneration: 4,
        surfaceCapabilityToken: 'surface-token',
      },
      disableContext
    )
  ).toBe(true);
  await flushPromises();
  expect(disableScreenshotModeMock).toHaveBeenCalledWith({
    leaseGeneration: 3,
    operationGeneration: 4,
    screenshotModeState: disableContext.screenshotModeState,
    senderDocumentId: 'content-document-7',
    surfaceCapabilityToken: 'surface-token',
    tabId: 7,
    viewportOwnerState: disableContext.viewportOwnerState,
    viewportState: disableContext.viewportState,
    webSnapshotViewerPorts: disableContext.webSnapshotViewerPorts,
  });
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

it('binds content-originated screenshot enable to its preauthorized document', async () => {
  const context = createContext();
  const message = { type: MessageType.ENABLE_SCREENSHOT_MODE } as const;
  markPreauthorizedContentActionRouteMessage(message, {
    documentId: 'content-document-7',
    frameId: 0,
    senderUrl: 'https://example.test/page',
    tabId: 7,
  });

  expect(routeScreenshotModeMessage(message, context)).toBe(true);
  await flushPromises();

  expect(enableScreenshotModeMock).toHaveBeenCalledWith(
    7,
    context.screenshotModeState,
    context.viewportState,
    context.viewportOwnerState,
    context.webSnapshotViewerPorts,
    { surfaceDocumentId: 'content-document-7' }
  );
});

it('routes apply preset messages through async success responses', async () => {
  const setViewportContext = createContext();
  expect(
    routeViewportMessage(
      {
        type: MessageType.APPLY_VIEWPORT_PRESET,
        operationGeneration: 2,
        presetId: 'preset-1',
        surfaceCapabilityToken: 'surface-token',
      },
      setViewportContext
    )
  ).toBe(true);
  await flushPromises();
  expect(handleApplyViewportPresetMock).toHaveBeenCalledWith(
    7,
    'preset-1',
    2,
    'surface-token',
    'content-document-7',
    setViewportContext.viewportState,
    setViewportContext.viewportOwnerState,
    setViewportContext.webSnapshotViewerPorts
  );
  expect(setViewportContext.sendResponse).toHaveBeenCalledWith({
    success: true,
    result: 'accepted',
  });
});

it('routes release and availability requests with their capability context', async () => {
  const releaseContext = createContext();
  expect(
    routeViewportMessage(
      {
        type: MessageType.RELEASE_VIEWPORT_PRESET,
        leaseGeneration: 2,
        operationGeneration: 3,
        surfaceCapabilityToken: 'surface-token',
      },
      releaseContext
    )
  ).toBe(true);
  await flushPromises();
  expect(handleReleaseViewportPresetMock).toHaveBeenCalledWith(
    7,
    3,
    2,
    'surface-token',
    'content-document-7',
    releaseContext.viewportState,
    releaseContext.viewportOwnerState,
    releaseContext.webSnapshotViewerPorts
  );

  const availabilityContext = createContext();
  expect(
    routeViewportMessage(
      {
        type: MessageType.GET_VIEWPORT_PRESET_AVAILABILITY,
        context: 'video',
        presetIds: ['preset-1', 'preset-2'],
      },
      availabilityContext
    )
  ).toBe(true);
  await flushPromises();
  expect(getScreenshotPresetAvailabilitiesMock).toHaveBeenCalledWith(
    7,
    ['preset-1', 'preset-2'],
    'video'
  );
  expect(availabilityContext.sendResponse).toHaveBeenCalledWith({
    availabilities: [{ status: 'available' }],
    success: true,
  });
});

it('defaults availability to screenshot and reports a missing viewport as null', async () => {
  const availabilityContext = createContext();
  expect(
    routeViewportMessage(
      {
        type: MessageType.GET_VIEWPORT_PRESET_AVAILABILITY,
        presetIds: ['preset-1'],
      },
      availabilityContext
    )
  ).toBe(true);
  await flushPromises();
  expect(getScreenshotPresetAvailabilitiesMock).toHaveBeenCalledWith(7, ['preset-1'], 'screenshot');

  const statusContext = createContext();
  expect(routeViewportMessage({ type: MessageType.GET_VIEWPORT_STATUS }, statusContext)).toBe(true);
  expect(statusContext.sendResponse).toHaveBeenCalledWith({ success: true, viewport: null });
});

it('routes get viewport status and rejects unsupported screenshot messages', () => {
  const getViewportContext = createContext();
  getViewportContext.viewportState.set(7, {
    presetId: 'test:viewport',
    target: 'viewport' as const,
    width: 1440,
    height: 900,
  });
  expect(routeViewportMessage({ type: MessageType.GET_VIEWPORT_STATUS }, getViewportContext)).toBe(
    true
  );
  expect(getViewportContext.sendResponse).toHaveBeenCalledWith({
    success: true,
    viewport: {
      presetId: 'test:viewport',
      target: 'viewport',
      width: 1440,
      height: 900,
    },
  });

  expect(
    routeScreenshotModeMessage({ type: MessageType.QUICK_EDIT_MODE_STATUS }, createContext())
  ).toBe(false);
  expect(routeViewportMessage({ type: MessageType.ENABLE_HIGHLIGHTER_MODE }, createContext())).toBe(
    false
  );
});
