import { beforeEach, expect, it, vi } from 'vitest';

const {
  browserTabsGetMock,
  handleFullCaptureMock,
  handleVisibleCaptureMock,
  handleTriggerQuickActionMock,
  ensureActivePageAccessRuntimeMock,
  ensureNativeVisibleCaptureAuthorityMock,
  isOwnedSnapshotViewerPageMock,
  loadQuickActionRuntimeContextMock,
  loadScreenshotCaptureRuntimeContextMock,
  reserveDesktopQuickActionMock,
  waitForContentToolbarReadyMock,
} = vi.hoisted(() => ({
  browserTabsGetMock: vi.fn(),
  handleFullCaptureMock: vi.fn(),
  handleVisibleCaptureMock: vi.fn(),
  handleTriggerQuickActionMock: vi.fn(),
  ensureActivePageAccessRuntimeMock: vi.fn(),
  ensureNativeVisibleCaptureAuthorityMock: vi.fn(),
  isOwnedSnapshotViewerPageMock: vi.fn(),
  loadQuickActionRuntimeContextMock: vi.fn(),
  loadScreenshotCaptureRuntimeContextMock: vi.fn(),
  reserveDesktopQuickActionMock: vi.fn(),
  waitForContentToolbarReadyMock: vi.fn(),
}));

vi.mock('../../quick-actions/flow/load', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../quick-actions/flow/load')>()),
  loadQuickActionRuntimeContext: loadQuickActionRuntimeContextMock,
  loadScreenshotCaptureRuntimeContext: loadScreenshotCaptureRuntimeContextMock,
}));
vi.mock('../../quick-actions/desktop/workflow', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../quick-actions/desktop/workflow')>()),
  reserveDesktopQuickAction: reserveDesktopQuickActionMock,
}));

vi.mock('@sniptale/platform/browser/tabs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/tabs')>()),
  browserTabs: {
    get: (...args: unknown[]) => browserTabsGetMock(...args),
  },
}));

vi.mock('../../../../features/tab-capabilities/url', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../features/tab-capabilities/url')>()),
  isOwnedSnapshotViewerPage: (...args: unknown[]) => isOwnedSnapshotViewerPageMock(...args),
}));

vi.mock('../handlers.full', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../handlers.full')>()),
  handleFullCapture: handleFullCaptureMock,
}));

vi.mock('../handlers.visible', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../handlers.visible')>()),
  handleVisibleCapture: handleVisibleCaptureMock,
}));

vi.mock('../actions.quick-action', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../actions.quick-action')>()),
  handleTriggerQuickAction: handleTriggerQuickActionMock,
}));

import { CaptureMessageType } from '@sniptale/runtime-contracts/messaging/capture-messages';
import { createScenarioSessionServiceStub } from '../../../../../../../tooling/test/support/scenario-session-service.stub';
import { routeCaptureMessage } from './dispatcher';
import { flushRouteAsync } from './dispatcher.test-support';

function createRouteArgs() {
  return {
    captureGuardState: { isCapturing: false },
    resolvedTabId: 42,
    scenarioSessionService: createScenarioSessionServiceStub(),
    screenshotModeState: new Map([[42, true]]),
    sendResponse: vi.fn(),
    viewportState: new Map<
      number,
      { presetId: string; target: 'window' | 'window'; width: number; height: number } | null
    >([[42, { presetId: 'test:viewport', target: 'window' as const, width: 1280, height: 720 }]]),
    pageAccessPort: {
      ensureActivePageAccessRuntime: ensureActivePageAccessRuntimeMock,
      ensureNativeVisibleCaptureAuthority: ensureNativeVisibleCaptureAuthorityMock,
      waitForContentToolbarReady: waitForContentToolbarReadyMock,
    },
    webSnapshotViewerPorts: new Map(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  reserveDesktopQuickActionMock.mockResolvedValue({
    requestId: 'request-1',
    reservationToken: 'reservation-1',
  });
  handleFullCaptureMock.mockReturnValue(true);
  handleVisibleCaptureMock.mockReturnValue(true);
  handleTriggerQuickActionMock.mockReturnValue(true);
  browserTabsGetMock.mockResolvedValue({ id: 42, url: 'https://example.test/page' });
  ensureActivePageAccessRuntimeMock.mockResolvedValue(undefined);
  ensureNativeVisibleCaptureAuthorityMock.mockResolvedValue(undefined);
  isOwnedSnapshotViewerPageMock.mockReturnValue(false);
  loadQuickActionRuntimeContextMock.mockResolvedValue({ captureMode: 'visible' });
  loadScreenshotCaptureRuntimeContextMock.mockResolvedValue({ captureMode: 'visible' });
  waitForContentToolbarReadyMock.mockResolvedValue({ screenshotMode: false, visible: false });
});

const desktopConfig = {
  screenshotMode: 'desktop' as const,
  viewportPresetId: null,
  delay: null,
  afterCapture: 'download_default' as const,
  imageFormat: null,
  imageQuality: null,
  exitAfterCapture: false,
};

it('resolves encoding policy without page access before the popup opens the desktop picker', async () => {
  const { pageAccessPort: _pageAccessPort, ...args } = createRouteArgs();
  loadQuickActionRuntimeContextMock.mockResolvedValueOnce({
    captureMode: 'desktop',
    imageFormat: 'webp',
    imageQuality: 72,
  });

  expect(
    routeCaptureMessage({
      ...args,
      message: { type: 'PREPARE_DESKTOP_SCREENSHOT_CAPTURE', actionId: 'desktop-action' },
    })
  ).toBe(true);
  await flushRouteAsync();

  expect(args.sendResponse).toHaveBeenCalledWith({
    success: true,
    result: 'ready',
    imageFormat: 'webp',
    imageQuality: 72,
    requestId: 'request-1',
    reservationToken: 'reservation-1',
  });
  expect(ensureActivePageAccessRuntimeMock).not.toHaveBeenCalled();
});

it('rejects screenshot capture without page access before handler side effects', async () => {
  const args = createRouteArgs();
  ensureActivePageAccessRuntimeMock.mockRejectedValue(new Error('Page access is required.'));

  expect(
    routeCaptureMessage({
      ...args,
      message: { type: CaptureMessageType.CAPTURE_FULL },
    })
  ).toBe(true);
  await flushRouteAsync();

  expect(ensureActivePageAccessRuntimeMock).toHaveBeenCalledWith(42);
  expect(handleFullCaptureMock).not.toHaveBeenCalled();
  expect(args.sendResponse).toHaveBeenCalledWith({
    error: 'Page access is required.',
    success: false,
  });
});

it('rejects quick actions without page access before handler side effects', async () => {
  const args = createRouteArgs();
  ensureActivePageAccessRuntimeMock.mockRejectedValue(new Error('Page access is required.'));

  expect(
    routeCaptureMessage({
      ...args,
      message: { type: 'TRIGGER_QUICK_ACTION', actionId: 'viewer-action' },
    })
  ).toBe(true);
  await flushRouteAsync();

  expect(ensureActivePageAccessRuntimeMock).toHaveBeenCalledWith(42);
  expect(handleTriggerQuickActionMock).not.toHaveBeenCalled();
  expect(waitForContentToolbarReadyMock).not.toHaveBeenCalled();
  expect(args.sendResponse).toHaveBeenCalledWith({
    error: 'Page access is required.',
    success: false,
  });
});

it('waits for the toolbar bridge before dispatching a tab quick action', async () => {
  const args = createRouteArgs();

  expect(
    routeCaptureMessage({
      ...args,
      message: { type: 'TRIGGER_QUICK_ACTION', actionId: 'visible-action' },
    })
  ).toBe(true);
  await flushRouteAsync();

  expect(ensureActivePageAccessRuntimeMock).toHaveBeenCalledWith(42);
  expect(waitForContentToolbarReadyMock).toHaveBeenCalledWith(42);
  expect(waitForContentToolbarReadyMock.mock.invocationCallOrder[0]).toBeLessThan(
    handleTriggerQuickActionMock.mock.invocationCallOrder[0] ?? 0
  );
});

it('fails quick actions closed when page access port is missing', async () => {
  const { pageAccessPort: _pageAccessPort, ...args } = createRouteArgs();

  expect(
    routeCaptureMessage({
      ...args,
      message: { type: 'TRIGGER_QUICK_ACTION', actionId: 'viewer-action' },
    })
  ).toBe(true);
  await flushRouteAsync();

  expect(ensureActivePageAccessRuntimeMock).not.toHaveBeenCalled();
  expect(handleTriggerQuickActionMock).not.toHaveBeenCalled();
  expect(args.sendResponse).toHaveBeenCalledWith({
    error: 'Page access port unavailable.',
    success: false,
  });
});

it('runs desktop quick actions without page access or active-page authorization', async () => {
  const { pageAccessPort: _pageAccessPort, ...args } = createRouteArgs();
  const runtimeContext = { captureMode: 'desktop' };
  const desktopSelection = {
    dataUrl:
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl9sAAAAASUVORK5CYII=',
    height: 1,
    requestId: 'request-1',
    reservationToken: 'reservation-1',
    status: 'selected' as const,
    width: 1,
  };
  loadQuickActionRuntimeContextMock.mockResolvedValueOnce(runtimeContext);

  expect(
    routeCaptureMessage({
      ...args,
      message: {
        type: 'TRIGGER_QUICK_ACTION',
        actionId: 'desktop-action',
        desktopSelection,
      },
    })
  ).toBe(true);
  await flushRouteAsync();

  expect(browserTabsGetMock).not.toHaveBeenCalled();
  expect(ensureActivePageAccessRuntimeMock).not.toHaveBeenCalled();
  expect(handleTriggerQuickActionMock).toHaveBeenCalledWith(
    {
      type: 'TRIGGER_QUICK_ACTION',
      actionId: 'desktop-action',
      desktopSelection,
    },
    expect.any(Object),
    runtimeContext
  );
});

it('runs popup desktop capture without page access and uses the validated runtime context', async () => {
  const { pageAccessPort: _pageAccessPort, ...args } = createRouteArgs();
  const runtimeContext = { captureMode: 'desktop' };
  const desktopSelection = {
    dataUrl:
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl9sAAAAASUVORK5CYII=',
    height: 1,
    requestId: 'request-2',
    reservationToken: 'reservation-2',
    status: 'selected' as const,
    width: 1,
  };
  loadScreenshotCaptureRuntimeContextMock.mockResolvedValueOnce(runtimeContext);

  expect(
    routeCaptureMessage({
      ...args,
      message: {
        type: 'TRIGGER_SCREENSHOT_CAPTURE',
        config: desktopConfig,
        desktopSelection,
      },
    })
  ).toBe(true);
  await flushRouteAsync();

  expect(ensureActivePageAccessRuntimeMock).not.toHaveBeenCalled();
  expect(handleTriggerQuickActionMock).toHaveBeenCalledWith(
    { actionId: 'popup-screenshot-setup', desktopSelection },
    expect.any(Object),
    runtimeContext
  );
});

it('requires page access for popup tab capture before handler effects', async () => {
  const args = createRouteArgs();
  ensureActivePageAccessRuntimeMock.mockRejectedValue(new Error('Page access is required.'));
  loadScreenshotCaptureRuntimeContextMock.mockResolvedValueOnce({ captureMode: 'visible' });
  expect(
    routeCaptureMessage({
      ...args,
      message: {
        type: 'TRIGGER_SCREENSHOT_CAPTURE',
        config: { ...desktopConfig, screenshotMode: 'visible' },
      },
    })
  ).toBe(true);
  await flushRouteAsync();
  expect(handleTriggerQuickActionMock).not.toHaveBeenCalled();
  expect(args.sendResponse).toHaveBeenCalledWith({
    error: 'Page access is required.',
    success: false,
  });
});

it('rejects native visible capture without native capture authority before handler side effects', async () => {
  const args = createRouteArgs();
  args.viewportState.set(42, null);
  ensureNativeVisibleCaptureAuthorityMock.mockRejectedValue(
    new Error('Visible capture requires all-sites access or active tab activation.')
  );

  expect(
    routeCaptureMessage({
      ...args,
      message: { type: CaptureMessageType.CAPTURE_VISIBLE },
    })
  ).toBe(true);
  await flushRouteAsync();

  expect(ensureActivePageAccessRuntimeMock).toHaveBeenCalledWith(42);
  expect(ensureNativeVisibleCaptureAuthorityMock).toHaveBeenCalledWith(42);
  expect(handleVisibleCaptureMock).not.toHaveBeenCalled();
  expect(args.sendResponse).toHaveBeenCalledWith({
    error: 'Visible capture requires all-sites access or active tab activation.',
    success: false,
  });
});

it('requires native capture authority for window-sized visible capture', async () => {
  const args = createRouteArgs();

  expect(
    routeCaptureMessage({
      ...args,
      message: { type: CaptureMessageType.CAPTURE_VISIBLE },
    })
  ).toBe(true);
  await flushRouteAsync();

  expect(ensureActivePageAccessRuntimeMock).toHaveBeenCalledWith(42);
  expect(ensureNativeVisibleCaptureAuthorityMock).toHaveBeenCalledWith(42);
  expect(handleVisibleCaptureMock).toHaveBeenCalledOnce();
});
