// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { translate } from '../../../../platform/i18n';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { handleQuickActionUiMessage } from './passive-quick-action';
import type { RuntimeMessageBridgeParams, RuntimeMessageResponse } from './types';

const passiveUiMocks = vi.hoisted(() => ({
  copyImageToClipboard: vi.fn(),
  showToast: vi.fn(),
}));

vi.mock('../../clipboard-image', () => ({
  copyImageToClipboard: passiveUiMocks.copyImageToClipboard,
}));

vi.mock('@sniptale/ui/product-feedback/toast-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-feedback/toast-service')>()),

  showToast: passiveUiMocks.showToast,
}));

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
  vi.stubGlobal('navigator', {
    clipboard: {
      writeText: vi.fn().mockResolvedValue(undefined),
    },
  });
});

function expectQuickActionCountdownAndToastAreHandled() {
  const params = createBridgeParams();
  const sendResponse = vi.fn();

  expect(
    handleQuickActionUiMessage(
      {
        seconds: 5,
        type: MessageType.SHOW_QUICK_ACTION_COUNTDOWN,
      },
      params,
      sendResponse
    )
  ).toBe(true);
  expect(params.quickAction.setQuickActionToastCountdown).toHaveBeenCalledWith(5);
  expect(sendResponse).toHaveBeenLastCalledWith({ success: true });

  expect(
    handleQuickActionUiMessage(
      {
        payload: { message: 'Saved', type: 'success' },
        type: MessageType.SHOW_TOAST,
      },
      params,
      sendResponse
    )
  ).toBe(true);
  expect(passiveUiMocks.showToast).toHaveBeenCalledWith('Saved', 'success');
  expect(sendResponse).toHaveBeenLastCalledWith({ success: true });
}

async function expectImageClipboardSuccessResponse() {
  const params = createBridgeParams();
  const responses: RuntimeMessageResponse[] = [];
  passiveUiMocks.copyImageToClipboard.mockResolvedValue(undefined);

  expect(
    handleQuickActionUiMessage(
      {
        dataUrl: 'data:image/png;base64,ZmFrZQ==',
        type: MessageType.COPY_IMAGE_TO_CLIPBOARD,
      },
      params,
      (response) => {
        if (response) {
          responses.push(response);
        }
      }
    )
  ).toBe(true);

  await Promise.resolve();

  expect(passiveUiMocks.copyImageToClipboard).toHaveBeenCalledWith(
    'data:image/png;base64,ZmFrZQ=='
  );
  expect(responses).toEqual([{ success: true }]);
}

function expectOversizedClipboardTextIsRejected() {
  const params = createBridgeParams();
  const sendResponse = vi.fn();

  expect(
    handleQuickActionUiMessage(
      {
        text: 'x'.repeat(50_001),
        type: MessageType.COPY_TEXT_TO_CLIPBOARD,
      },
      params,
      sendResponse
    )
  ).toBe(true);

  expect(globalThis.navigator.clipboard.writeText).not.toHaveBeenCalled();
  expect(sendResponse).toHaveBeenCalledWith({
    success: false,
    error: translate('content.runtime.clipboardTextTooLarge'),
  });
}

describe('runtime-message-bridge-passive-quick-action', () => {
  it(
    'handles quick-action countdown and toast UI messages synchronously',
    expectQuickActionCountdownAndToastAreHandled
  );
  it('copies image data asynchronously and reports success', expectImageClipboardSuccessResponse);
  it(
    'rejects oversized clipboard text before touching the clipboard',
    expectOversizedClipboardTextIsRejected
  );
});
