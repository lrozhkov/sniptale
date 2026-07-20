import { describe, expect, it, vi } from 'vitest';

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { createRuntimeMessageHandler } from './helpers';

function createBridgeParams() {
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
      captureAction: 'download_default' as const,
      captureActionRef: { current: 'download_default' as const },
      quickActionOverlayRef: { current: null },
      setCaptureAction: vi.fn(),
      setQuickActionOverlay: vi.fn(),
      setQuickActionToastCountdown: vi.fn(),
      setTimerDelay: vi.fn(),
    },
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

function expectInvalidPayloadIsIgnored() {
  const params = createBridgeParams();
  const sendResponse = vi.fn();
  const handleMessage = createRuntimeMessageHandler(params);

  expect(handleMessage('invalid', {} as chrome.runtime.MessageSender, sendResponse)).toBe(false);
  expect(sendResponse).not.toHaveBeenCalled();
  expect(params.modeControls.setIsToolbarVisible).not.toHaveBeenCalled();
}

function expectToolbarMessageRoutesThroughModeControls() {
  const params = createBridgeParams();
  const sendResponse = vi.fn();
  const handleMessage = createRuntimeMessageHandler(params);

  expect(
    handleMessage(
      { type: MessageType.SHOW_TOOLBAR },
      {} as chrome.runtime.MessageSender,
      sendResponse
    )
  ).toBe(false);

  expect(params.modeControls.setIsToolbarVisible).toHaveBeenCalledWith(true);
  expect(sendResponse).toHaveBeenCalledWith({ success: true });
}

function expectSaveDialogRoutesThroughDialogControls() {
  const params = createBridgeParams();
  const sendResponse = vi.fn();
  const handleMessage = createRuntimeMessageHandler(params);

  expect(
    handleMessage(
      {
        type: MessageType.SHOW_SAVE_DIALOG,
        dataUrl: 'data:image/png;base64,abc',
        filename: 'capture.png',
      },
      {} as chrome.runtime.MessageSender,
      sendResponse
    )
  ).toBe(false);

  expect(params.dialogs.setSaveDialogState).toHaveBeenCalledWith({
    dataUrl: 'data:image/png;base64,abc',
    filename: 'capture.png',
  });
  expect(sendResponse).toHaveBeenCalledWith({ success: true });
}

function expectGetterSourceUsesLatestParams() {
  const firstParams = createBridgeParams();
  const secondParams = createBridgeParams();
  let currentParams = firstParams;
  const sendResponse = vi.fn();
  const handleMessage = createRuntimeMessageHandler(() => currentParams);

  currentParams = secondParams;

  expect(
    handleMessage(
      { type: MessageType.SHOW_TOOLBAR },
      {} as chrome.runtime.MessageSender,
      sendResponse
    )
  ).toBe(false);

  expect(firstParams.modeControls.setIsToolbarVisible).not.toHaveBeenCalled();
  expect(secondParams.modeControls.setIsToolbarVisible).toHaveBeenCalledWith(true);
}

function expectTopLevelOnlyMessagesAreIgnoredBeforeParsing() {
  const params = createBridgeParams();
  const sendResponse = vi.fn();
  const handleMessage = createRuntimeMessageHandler(params);

  expect(
    handleMessage(
      { type: 'SHOW_REGION_SELECTOR' },
      {} as chrome.runtime.MessageSender,
      sendResponse
    )
  ).toBe(false);

  expect(sendResponse).not.toHaveBeenCalled();
  expect(params.modeControls.setIsToolbarVisible).not.toHaveBeenCalled();
  expect(params.modeControls.setScreenshotMode).not.toHaveBeenCalled();
}

async function expectWebSnapshotExportRoutesThroughPopupExportController() {
  const handleRequest = vi.fn(() => true);

  vi.doMock('../../../parser/popup-export', () => ({
    createPopupExportController: () => ({
      handleRequest,
    }),
  }));

  const params = createBridgeParams();
  const sendResponse = vi.fn();
  const handleMessage = createRuntimeMessageHandler(params);
  const request = {
    allowAnonymousCrossOriginAssets: false,
    allowAuthenticatedSameOriginAssets: true,
    requestId: 'snapshot-request',
    type: MessageType.EXPORT_POPUP_SAVE_WEB_SNAPSHOT,
  };

  expect(handleMessage(request, {} as chrome.runtime.MessageSender, sendResponse)).toBe(true);

  await vi.waitFor(() => {
    expect(handleRequest).toHaveBeenCalledWith(request, sendResponse);
  });

  vi.doUnmock('../../../parser/popup-export');
}

describe('createRuntimeMessageHandler', () => {
  it(
    'ignores invalid raw payloads before branching on runtime message fields',
    expectInvalidPayloadIsIgnored
  );
  it(
    'routes SHOW_TOOLBAR through the grouped mode controls',
    expectToolbarMessageRoutesThroughModeControls
  );
  it(
    'routes SHOW_SAVE_DIALOG through the dialog controls',
    expectSaveDialogRoutesThroughDialogControls
  );
  it(
    'uses the latest bridge params when created from a getter source',
    expectGetterSourceUsesLatestParams
  );
  it(
    'ignores top-level-only runtime messages before UI bridge parsing',
    expectTopLevelOnlyMessagesAreIgnoredBeforeParsing
  );
  it(
    'routes web snapshot export requests through the popup export controller',
    expectWebSnapshotExportRoutesThroughPopupExportController
  );
});
