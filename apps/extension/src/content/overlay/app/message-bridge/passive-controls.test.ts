// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { translate } from '../../../../platform/i18n';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import {
  handleDiagnosticLoggerMessage,
  handleSaveDialogMessage,
  handleViewportChangedMessage,
} from './passive-controls';
import type { RuntimeMessageBridgeParams } from './types';

function createBridgeParams(): RuntimeMessageBridgeParams {
  return {
    diagnostics: {
      disableDiagnosticLogger: vi.fn(),
      enableDiagnosticLogger: vi.fn(),
    },
    dialogs: {
      setSaveDialogState: vi.fn(),
    },
    modeControls: {
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
    },
    modeState: {
      aiPickMode: false,
      highlighterMode: false,
      isToolbarVisible: false,
      quickEditMode: false,
      screenshotMode: false,
    },
    quickAction: {
      captureAction: 'download_default',
      captureActionRef: { current: 'download_default' },
      quickActionOverlayRef: { current: null },
      setCaptureAction: vi.fn(),
      setQuickActionOverlay: vi.fn(),
      setQuickActionToastCountdown: vi.fn(),
      setTimerDelay: vi.fn(),
    },
    viewport: {
      clearPendingAutoStartCapture: vi.fn(),
      handleTakeScreenshotRef: {
        current: vi.fn(async () => undefined),
      },
      invalidateScreenshotRuns: vi.fn(),
      queueAutoStartCapture: vi.fn(),
      setCurrentViewport: vi.fn(),
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

function expectViewportUpdatesRouteThroughControls() {
  const params = createBridgeParams();
  const sendResponse = vi.fn();

  expect(
    handleViewportChangedMessage(
      { type: MessageType.VIEWPORT_CHANGED, viewport: { height: 900, width: 1440 } },
      params,
      sendResponse
    )
  ).toBe(true);

  expect(params.viewport.setCurrentViewport).toHaveBeenCalledWith({
    height: 900,
    width: 1440,
  });
  expect(sendResponse).toHaveBeenCalledWith({ success: true });
}

function expectInvalidSaveDialogImageIsRejected() {
  const params = createBridgeParams();
  const sendResponse = vi.fn();

  expect(
    handleSaveDialogMessage(
      {
        dataUrl: 'broken-image',
        type: MessageType.SHOW_SAVE_DIALOG,
      },
      params,
      sendResponse
    )
  ).toBe(true);

  expect(params.dialogs.setSaveDialogState).not.toHaveBeenCalled();
  expect(sendResponse).toHaveBeenCalledWith({
    success: false,
    error: translate('content.runtime.invalidImageData'),
  });
}

function expectDiagnosticLoggerRouting() {
  const params = createBridgeParams();
  const sendResponse = vi.fn();

  expect(
    handleDiagnosticLoggerMessage(
      {
        recordingId: 'rec-3',
        type: VideoMessageType.ENABLE_DIAGNOSTIC_LOGGER,
      },
      params,
      sendResponse
    )
  ).toBe(true);
  expect(params.diagnostics.enableDiagnosticLogger).toHaveBeenCalledWith('rec-3');
  expect(sendResponse).toHaveBeenLastCalledWith({ success: true });

  expect(
    handleDiagnosticLoggerMessage(
      {
        type: VideoMessageType.DISABLE_DIAGNOSTIC_LOGGER,
      },
      params,
      sendResponse
    )
  ).toBe(true);
  expect(params.diagnostics.disableDiagnosticLogger).toHaveBeenCalledOnce();
  expect(sendResponse).toHaveBeenLastCalledWith({ success: true });
}

describe('runtime-message-bridge-passive-controls', () => {
  it(
    'routes viewport updates through injected viewport controls',
    expectViewportUpdatesRouteThroughControls
  );
  it(
    'rejects invalid save-dialog image data before mutating dialog state',
    expectInvalidSaveDialogImageIsRejected
  );
  it(
    'routes diagnostic logger ownership through injected controller controls',
    expectDiagnosticLoggerRouting
  );
});
