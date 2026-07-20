// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { translate } from '../../../../platform/i18n';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { createPassiveRuntimeMessageHandler } from './passive';
import type { RuntimeMessageBridgeParams, RuntimeMessageResponse } from './types';

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

async function flushClipboardResponse(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  vi.stubGlobal('navigator', {
    clipboard: {
      write: vi.fn().mockResolvedValue(undefined),
      writeText: vi.fn().mockResolvedValue(undefined),
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('runtime message bridge passive plain clipboard text', () => {
  it('writes clipboard text and returns a success response', async () => {
    const handler = createPassiveRuntimeMessageHandler(createBridgeParams());
    const responses: RuntimeMessageResponse[] = [];

    const keepChannelOpen = handler(
      {
        text: 'copied',
        type: MessageType.COPY_TEXT_TO_CLIPBOARD,
      },
      (response) => {
        if (response) {
          responses.push(response);
        }
      }
    );

    await flushClipboardResponse();

    expect(keepChannelOpen).toBe(true);
    expect(globalThis.navigator.clipboard.writeText).toHaveBeenCalledWith('copied');
    expect(responses).toEqual([{ success: true }]);
  });
});

describe('runtime message bridge passive rich clipboard write', () => {
  it('writes rich clipboard HTML with a plain-text fallback', async () => {
    const clipboardItems: unknown[] = [];

    vi.stubGlobal(
      'ClipboardItem',
      class FakeClipboardItem {
        constructor(items: unknown) {
          clipboardItems.push(items);
        }
      }
    );

    const handler = createPassiveRuntimeMessageHandler(createBridgeParams());
    const responses: RuntimeMessageResponse[] = [];

    const keepChannelOpen = handler(
      {
        html: '<a href="https://example.test">Example</a>',
        text: 'Example\nhttps://example.test',
        type: MessageType.COPY_TEXT_TO_CLIPBOARD,
      },
      (response) => {
        if (response) {
          responses.push(response);
        }
      }
    );

    await flushClipboardResponse();

    expect(keepChannelOpen).toBe(true);
    expect(globalThis.navigator.clipboard.write).toHaveBeenCalledWith([expect.any(Object)]);
    expect(globalThis.navigator.clipboard.writeText).not.toHaveBeenCalled();
    expect(clipboardItems).toHaveLength(1);
    expect(responses).toEqual([{ success: true }]);
  });
});

describe('runtime message bridge passive rich clipboard fallback', () => {
  it('falls back to writeText when rich clipboard writing is unavailable', async () => {
    const handler = createPassiveRuntimeMessageHandler(createBridgeParams());
    const responses: RuntimeMessageResponse[] = [];

    const keepChannelOpen = handler(
      {
        html: '<a href="https://example.test">Example</a>',
        text: 'Example\nhttps://example.test',
        type: MessageType.COPY_TEXT_TO_CLIPBOARD,
      },
      (response) => {
        if (response) {
          responses.push(response);
        }
      }
    );

    await flushClipboardResponse();

    expect(keepChannelOpen).toBe(true);
    expect(globalThis.navigator.clipboard.write).not.toHaveBeenCalled();
    expect(globalThis.navigator.clipboard.writeText).toHaveBeenCalledWith(
      'Example\nhttps://example.test'
    );
    expect(responses).toEqual([{ success: true }]);
  });
});

describe('runtime message bridge passive clipboard validation', () => {
  it('rejects oversized clipboard text before touching the clipboard', () => {
    const handler = createPassiveRuntimeMessageHandler(createBridgeParams());
    const sendResponse = vi.fn();

    const keepChannelOpen = handler(
      {
        text: 'x'.repeat(50_001),
        type: MessageType.COPY_TEXT_TO_CLIPBOARD,
      },
      sendResponse
    );

    expect(keepChannelOpen).toBe(true);
    expect(globalThis.navigator.clipboard.writeText).not.toHaveBeenCalled();
    expect(sendResponse).toHaveBeenCalledWith({
      success: false,
      error: translate('content.runtime.clipboardTextTooLarge'),
    });
  });

  it('rejects oversized rich clipboard html before touching the clipboard', () => {
    const handler = createPassiveRuntimeMessageHandler(createBridgeParams());
    const sendResponse = vi.fn();

    const keepChannelOpen = handler(
      {
        html: 'x'.repeat(50_001),
        text: 'Example',
        type: MessageType.COPY_TEXT_TO_CLIPBOARD,
      },
      sendResponse
    );

    expect(keepChannelOpen).toBe(true);
    expect(globalThis.navigator.clipboard.write).not.toHaveBeenCalled();
    expect(globalThis.navigator.clipboard.writeText).not.toHaveBeenCalled();
    expect(sendResponse).toHaveBeenCalledWith({
      success: false,
      error: translate('content.runtime.clipboardTextTooLarge'),
    });
  });
});

describe('runtime message bridge passive image validation', () => {
  it('rejects invalid image data for clipboard requests', () => {
    const handler = createPassiveRuntimeMessageHandler(createBridgeParams());
    const sendResponse = vi.fn();

    const keepChannelOpen = handler(
      {
        dataUrl: 'broken-image',
        type: MessageType.COPY_IMAGE_TO_CLIPBOARD,
      },
      sendResponse
    );

    expect(keepChannelOpen).toBe(true);
    expect(sendResponse).toHaveBeenCalledWith({
      success: false,
      error: translate('content.runtime.invalidImageData'),
    });
  });
});

describe('runtime message bridge passive popup export', () => {
  it('keeps the response channel open for web snapshot export requests', async () => {
    const handleRequest = vi.fn(() => true);

    vi.doMock('../../../parser/popup-export', () => ({
      createPopupExportController: () => ({
        handleRequest,
      }),
    }));

    const handler = createPassiveRuntimeMessageHandler(createBridgeParams());
    const request = {
      allowAnonymousCrossOriginAssets: false,
      allowAuthenticatedSameOriginAssets: true,
      requestId: 'snapshot-request',
      type: MessageType.EXPORT_POPUP_SAVE_WEB_SNAPSHOT,
    };
    const sendResponse = vi.fn();

    expect(handler(request, sendResponse)).toBe(true);

    await vi.waitFor(() => {
      expect(handleRequest).toHaveBeenCalledWith(request, sendResponse);
    });

    vi.doUnmock('../../../parser/popup-export');
  });
});

describe('runtime message bridge passive diagnostics', () => {
  it(
    'routes diagnostic logger ownership through injected controller controls',
    expectDiagnosticLoggerRouting
  );
});

function expectDiagnosticLoggerRouting() {
  const params = createBridgeParams();
  const handler = createPassiveRuntimeMessageHandler(params);
  const sendResponse = vi.fn();

  expect(
    handler(
      {
        recordingId: 'rec-3',
        type: VideoMessageType.ENABLE_DIAGNOSTIC_LOGGER,
      },
      sendResponse
    )
  ).toBe(false);
  expect(params.diagnostics.enableDiagnosticLogger).toHaveBeenCalledWith('rec-3');
  expect(sendResponse).toHaveBeenLastCalledWith({ success: true });

  expect(
    handler(
      {
        type: VideoMessageType.DISABLE_DIAGNOSTIC_LOGGER,
      },
      sendResponse
    )
  ).toBe(false);
  expect(params.diagnostics.disableDiagnosticLogger).toHaveBeenCalledOnce();
  expect(sendResponse).toHaveBeenLastCalledWith({ success: true });
}
