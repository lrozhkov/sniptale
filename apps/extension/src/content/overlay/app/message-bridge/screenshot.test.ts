import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { type QuickActionOverlay } from '../../../../contracts/settings';
import {
  createDisableScreenshotModeRequest,
  requireScreenshotSurfaceCapabilityToken,
  setScreenshotSurfaceCapabilityToken,
} from '../../viewport-selector/capability';
import { handleScreenshotModeMessage } from './screenshot';

const { isLockEnabledMock } = vi.hoisted(() => ({
  isLockEnabledMock: vi.fn(() => false),
}));

vi.mock('../../../selection/locker', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../selection/locker')>()),
  isLockEnabled: isLockEnabledMock,
}));

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
      designReviewMode: false,
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

function createModeControls() {
  return {
    disableAiPickMode: vi.fn(),
    disableDesignReviewMode: vi.fn(),
    disableHighlighterMode: vi.fn(),
    disableQuickEditMode: vi.fn(),
    setAiPickMode: vi.fn(),
    setDesignReviewMode: vi.fn(),
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

function expectEnableScreenshotModeRouting() {
  const params = createBridgeParams();
  const sendResponse = vi.fn();

  expect(
    handleScreenshotModeMessage(
      {
        surfaceCapabilityToken: 'surface-token-1',
        surfaceLeaseGeneration: 1,
        surfaceOperationGeneration: 1,
        type: MessageType.ENABLE_SCREENSHOT_MODE,
        viewport: {
          presetId: 'test:viewport',
          target: 'viewport',
          width: 1280,
          height: 720,
        },
        quickActionOverlay: {
          afterCapture: 'copy',
          delaySeconds: 3,
          exitAfterCapture: false,
          imageFormat: 'png',
          imageQuality: 100,
        },
      },
      params,
      sendResponse
    )
  ).toBe(true);

  expect(params.modeControls.setScreenshotMode).toHaveBeenCalledWith(true);
  expect(params.modeControls.setNavigationLockEnabled).toHaveBeenCalledWith(true);
  expect(params.modeControls.setIsToolbarVisible).toHaveBeenCalledWith(true);
  expect(params.viewport.setCurrentViewport).toHaveBeenCalledWith({
    presetId: 'test:viewport',
    target: 'viewport',
    width: 1280,
    height: 720,
  });
  expect(params.quickAction.setQuickActionOverlay).toHaveBeenCalledWith({
    afterCapture: 'copy',
    delaySeconds: 3,
    exitAfterCapture: false,
    imageFormat: 'png',
    imageQuality: 100,
  });
  expect(params.quickAction.setCaptureAction).toHaveBeenCalledWith('copy');
  expect(params.quickAction.quickActionOverlayRef.current).toEqual({
    afterCapture: 'copy',
    delaySeconds: 3,
    exitAfterCapture: false,
    imageFormat: 'png',
    imageQuality: 100,
  });
  expect(params.quickAction.setTimerDelay).toHaveBeenCalledWith(3);
  expect(createDisableScreenshotModeRequest()).toEqual({
    leaseGeneration: 1,
    operationGeneration: 2,
    surfaceCapabilityToken: 'surface-token-1',
    type: MessageType.DISABLE_SCREENSHOT_MODE,
  });
  expect(sendResponse).toHaveBeenCalledWith({ success: true });
}

function expectRepeatedPopupPreparationEnableBecomesNoOp() {
  const params = createBridgeParams();
  params.modeState.screenshotMode = true;
  params.modeState.isToolbarVisible = true;
  const sendResponse = vi.fn();

  expect(
    handleScreenshotModeMessage(
      {
        surfaceCapabilityToken: 'refreshed-surface-token',
        type: MessageType.ENABLE_SCREENSHOT_MODE,
      },
      params,
      sendResponse
    )
  ).toBe(true);

  expect(params.modeControls.setScreenshotMode).not.toHaveBeenCalled();
  expect(params.modeControls.setNavigationLockEnabled).not.toHaveBeenCalled();
  expect(params.modeControls.setIsToolbarVisible).not.toHaveBeenCalled();
  expect(params.viewport.setCurrentViewport).not.toHaveBeenCalled();
  expect(params.quickAction.setQuickActionOverlay).not.toHaveBeenCalled();
  expect(params.quickAction.setCaptureAction).not.toHaveBeenCalled();
  expect(params.quickAction.setTimerDelay).not.toHaveBeenCalled();
  expect(requireScreenshotSurfaceCapabilityToken()).toBe('refreshed-surface-token');
  expect(sendResponse).toHaveBeenCalledWith({ success: true });
}

function expectPinnedRestorePreservesCollapsedToolbar() {
  const params = createBridgeParams();
  const sendResponse = vi.fn();

  expect(
    handleScreenshotModeMessage(
      {
        toolbarVisible: false,
        type: MessageType.ENABLE_SCREENSHOT_MODE,
      },
      params,
      sendResponse
    )
  ).toBe(true);

  expect(params.modeControls.setScreenshotMode).toHaveBeenCalledWith(true);
  expect(params.modeControls.setIsToolbarVisible).toHaveBeenCalledWith(false);
  expect(sendResponse).toHaveBeenCalledWith({ success: true });
}

function expectDestroyToolbarInvalidatesInFlightCapture() {
  const params = createBridgeParams();
  const sendResponse = vi.fn();

  expect(
    handleScreenshotModeMessage(
      {
        type: MessageType.DESTROY_UI_TOOLBAR,
      },
      params,
      sendResponse
    )
  ).toBe(true);

  expect(params.viewport.invalidateScreenshotRuns).toHaveBeenCalledOnce();
  expect(params.viewport.clearPendingAutoStartCapture).toHaveBeenCalledOnce();
  expect(params.modeControls.setScreenshotMode).toHaveBeenCalledWith(false);
  expect(params.modeControls.setNavigationLockEnabled).toHaveBeenCalledWith(false);
  expect(params.modeControls.setIsToolbarVisible).toHaveBeenCalledWith(false);
  expect(sendResponse).toHaveBeenCalledWith({ success: true });
}

function runHandleScreenshotModeMessageSuite() {
  beforeEach(() => {
    setScreenshotSurfaceCapabilityToken(null);
  });
  it(
    'routes ENABLE_SCREENSHOT_MODE through grouped viewport and quick-action controls',
    expectEnableScreenshotModeRouting
  );
  it(
    'keeps repeated popup preparation enables idempotent when screenshot mode is already visible',
    expectRepeatedPopupPreparationEnableBecomesNoOp
  );
  it(
    'preserves collapsed toolbar visibility when pinned preparation is restored',
    expectPinnedRestorePreservesCollapsedToolbar
  );
  it(
    'invalidates in-flight captures when destroying the toolbar',
    expectDestroyToolbarInvalidatesInFlightCapture
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  isLockEnabledMock.mockReturnValue(false);
});

describe('handleScreenshotModeMessage', runHandleScreenshotModeMessageSuite);
