import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { type QuickActionOverlay } from '../../../../contracts/settings';
import { handleScreenshotModeMessage } from './screenshot';

const { isLockEnabledMock } = vi.hoisted(() => ({
  isLockEnabledMock: vi.fn(() => false),
}));

vi.mock('../../../selection/locker', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../selection/locker')>()),
  isLockEnabled: isLockEnabledMock,
}));

function createModeControls() {
  return {
    disableAiPickMode: vi.fn(),
    disableHighlighterMode: vi.fn(),
    disableQuickEditMode: vi.fn(),
    setAiPickMode: vi.fn(),
    setHighlighterMode: vi.fn(),
    setIsToolbarVisible: vi.fn(),
    setNavigationLockEnabled: vi.fn(),
    setQuickEditDocumentMode: vi.fn(),
    setQuickEditMode: vi.fn(),
    setScreenshotMode: vi.fn(),
  };
}

function createQuickActionState(
  quickActionOverlayRef: { current: QuickActionOverlay | null },
  setQuickActionOverlay: (overlay: QuickActionOverlay | null) => void
) {
  return {
    captureAction: 'download_default' as const,
    captureActionRef: { current: 'download_default' as const },
    quickActionOverlayRef,
    setCaptureAction: vi.fn(),
    setQuickActionOverlay,
    setQuickActionToastCountdown: vi.fn(),
    setTimerDelay: vi.fn(),
  };
}

function createBridgeParams() {
  const quickActionOverlayRef: { current: QuickActionOverlay | null } = { current: null };
  const setQuickActionOverlay = vi.fn((overlay: QuickActionOverlay | null) => {
    quickActionOverlayRef.current = overlay;
  });

  return {
    diagnostics: {
      disableDiagnosticLogger: vi.fn(),
      enableDiagnosticLogger: vi.fn(),
    },
    dialogs: {
      setSaveDialogState: vi.fn(),
    },
    modeControls: createModeControls(),
    modeState: {
      aiPickMode: false,
      highlighterMode: false,
      isToolbarVisible: false,
      quickEditMode: false,
      screenshotMode: false,
    },
    quickAction: createQuickActionState(quickActionOverlayRef, setQuickActionOverlay),
    viewport: {
      clearPendingAutoStartCapture: vi.fn(),
      handleTakeScreenshotRef: {
        current: vi.fn().mockResolvedValue(undefined),
      },
      invalidateScreenshotRuns: vi.fn(),
      queueAutoStartCapture: vi.fn(),
      setCurrentViewport: vi.fn(),
    },
  };
}

function enableAutoStartCapture(params: ReturnType<typeof createBridgeParams>) {
  const sendResponse = vi.fn();

  expect(
    handleScreenshotModeMessage(
      {
        type: MessageType.ENABLE_SCREENSHOT_MODE,
        autoStartCaptureType: 'visible',
      },
      params,
      sendResponse
    )
  ).toBe(true);

  return sendResponse;
}

function expectAutoStartCaptureQueueing() {
  const params = createBridgeParams();
  const sendResponse = vi.fn();
  isLockEnabledMock.mockReturnValueOnce(false);

  expect(
    handleScreenshotModeMessage(
      {
        type: MessageType.ENABLE_SCREENSHOT_MODE,
        autoStartSelection: true,
        contentIntentGrant: { grantToken: 'grant-1' },
      },
      params,
      sendResponse
    )
  ).toBe(true);

  expect(params.viewport.queueAutoStartCapture).toHaveBeenCalledWith(
    'selection',
    {
      grantToken: 'grant-1',
      kind: 'background-auto-start',
    },
    { navigationLockBaseline: false }
  );
  expect(params.viewport.handleTakeScreenshotRef.current).not.toHaveBeenCalled();
  expect(sendResponse).toHaveBeenCalledWith({ success: true });
}

function expectAutoStartCaptureInvalidatesCurrentRunBeforeQueueing() {
  const params = createBridgeParams();

  enableAutoStartCapture(params);

  expect(params.viewport.invalidateScreenshotRuns).toHaveBeenCalledOnce();
  expect(params.viewport.invalidateScreenshotRuns.mock.invocationCallOrder[0]).toBeLessThan(
    params.viewport.queueAutoStartCapture.mock.invocationCallOrder[0] ?? 0
  );
  expect(params.viewport.queueAutoStartCapture).toHaveBeenCalledWith('visible', undefined, {
    navigationLockBaseline: false,
  });
}

function expectAutoStartCaptureUsesInvalidatedRunBaseline() {
  const params = createBridgeParams();
  params.viewport.invalidateScreenshotRuns.mockReturnValueOnce({
    navigationLockBaseline: false,
  });
  isLockEnabledMock.mockReturnValue(true);

  enableAutoStartCapture(params);

  expect(isLockEnabledMock).not.toHaveBeenCalled();
  expect(params.viewport.queueAutoStartCapture).toHaveBeenCalledWith('visible', undefined, {
    navigationLockBaseline: false,
  });
}

function expectAutoStartCaptureSnapshotsExistingLockBeforeTemporaryLock() {
  const params = createBridgeParams();
  const sendResponse = vi.fn();
  isLockEnabledMock.mockReturnValueOnce(true);

  expect(
    handleScreenshotModeMessage(
      {
        type: MessageType.ENABLE_SCREENSHOT_MODE,
        autoStartCaptureType: 'visible',
        quickActionOverlay: {
          afterCapture: 'edit',
          exitAfterCapture: true,
          imageFormat: 'png',
          imageQuality: 100,
        },
      },
      params,
      sendResponse
    )
  ).toBe(true);

  expect(isLockEnabledMock.mock.invocationCallOrder[0]).toBeLessThan(
    params.modeControls.setNavigationLockEnabled.mock.invocationCallOrder[0] ?? 0
  );
  expect(params.viewport.queueAutoStartCapture).toHaveBeenCalledWith('visible', undefined, {
    navigationLockBaseline: true,
  });
  expect(sendResponse).toHaveBeenCalledWith({ success: true });
}

function expectAutoStartCaptureIgnoresModeOwnedLockBaseline() {
  const params = createBridgeParams();
  const sendResponse = vi.fn();
  params.modeState.highlighterMode = true;
  isLockEnabledMock.mockReturnValueOnce(true);

  expect(
    handleScreenshotModeMessage(
      {
        type: MessageType.ENABLE_SCREENSHOT_MODE,
        autoStartCaptureType: 'visible',
      },
      params,
      sendResponse
    )
  ).toBe(true);

  expect(params.viewport.queueAutoStartCapture).toHaveBeenCalledWith('visible', undefined, {
    navigationLockBaseline: false,
  });
  expect(sendResponse).toHaveBeenCalledWith({ success: true });
}

beforeEach(() => {
  vi.clearAllMocks();
  isLockEnabledMock.mockReturnValue(false);
});

describe('handleScreenshotModeMessage auto-start captures', () => {
  it(
    'queues auto-start captures through the viewport readiness seam',
    expectAutoStartCaptureQueueing
  );
  it(
    'invalidates the current screenshot run before queueing a new auto-start capture',
    expectAutoStartCaptureInvalidatesCurrentRunBeforeQueueing
  );
  it(
    'uses the invalidated run baseline instead of a temporary selection lock',
    expectAutoStartCaptureUsesInvalidatedRunBaseline
  );
  it(
    'captures the pre-auto-start lock state before enabling the temporary capture lock',
    expectAutoStartCaptureSnapshotsExistingLockBeforeTemporaryLock
  );
  it(
    'does not persist a highlighter-owned navigation lock as the auto-start baseline',
    expectAutoStartCaptureIgnoresModeOwnedLockBaseline
  );
});
