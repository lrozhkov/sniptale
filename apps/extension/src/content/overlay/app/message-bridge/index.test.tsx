// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { useRuntimeMessageBridge } from '.';

const { subscribeToMessages } = vi.hoisted(() => ({
  subscribeToMessages: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/runtime')>()),
  browserRuntime: {
    subscribeToMessages,
  },
}));

let root: Root | null = null;
let container: HTMLDivElement | null = null;

type BridgeOverrides = {
  handleTakeScreenshot?: (type: 'visible' | 'full' | 'selection') => Promise<void>;
  setNavigationLockEnabled?: (enabled: boolean) => void;
  setScreenshotMode?: (enabled: boolean) => void;
  setIsToolbarVisible?: (visible: boolean) => void;
};

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  subscribeToMessages.mockReset();
  subscribeToMessages.mockReturnValue(vi.fn());
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

function createBridgeParams(overrides: BridgeOverrides = {}) {
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
      setIsToolbarVisible: overrides.setIsToolbarVisible ?? vi.fn(),
      setNavigationLockEnabled: overrides.setNavigationLockEnabled ?? vi.fn(),
      setQuickEditDocumentMode: vi.fn(),
      setQuickEditMode: vi.fn(),
      setScreenshotMode: overrides.setScreenshotMode ?? vi.fn(),
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
      handleTakeScreenshot: overrides.handleTakeScreenshot ?? vi.fn().mockResolvedValue(undefined),
      invalidateScreenshotRuns: vi.fn(),
      queueAutoStartCapture: vi.fn(),
      setCurrentViewport: vi.fn(),
    },
  };
}

function TestBridge(props: Parameters<typeof useRuntimeMessageBridge>[0]) {
  useRuntimeMessageBridge(props);
  return null;
}

async function renderBridge(props: Parameters<typeof useRuntimeMessageBridge>[0]) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<TestBridge {...props} />);
  });
}

async function expectScreenshotMessagesStillRouteThroughUiBridge() {
  const setNavigationLockEnabled = vi.fn();
  const setScreenshotMode = vi.fn();

  await renderBridge(
    createBridgeParams({
      setNavigationLockEnabled,
      setScreenshotMode,
    })
  );

  const listener = subscribeToMessages.mock.calls[0]?.[0] as
    | ((
        message: unknown,
        sender: chrome.runtime.MessageSender,
        sendResponse: (response?: unknown) => void
      ) => boolean)
    | undefined;

  const sendResponse = vi.fn();
  expect(listener).toBeTypeOf('function');

  expect(
    listener?.(
      {
        type: MessageType.ENABLE_SCREENSHOT_MODE,
        viewport: { width: 1440, height: 900 },
      },
      {} as chrome.runtime.MessageSender,
      sendResponse
    )
  ).toBe(false);

  expect(setScreenshotMode).toHaveBeenCalledWith(true);
  expect(setNavigationLockEnabled).toHaveBeenCalledWith(true);
  expect(sendResponse).toHaveBeenCalledWith({ success: true });
}

describe('useRuntimeMessageBridge', () => {
  it('subscribes once and routes messages through the latest bridge params after rerender', async () => {
    const initialSetToolbarVisible = vi.fn();
    const nextSetToolbarVisible = vi.fn();

    await renderBridge(
      createBridgeParams({
        setIsToolbarVisible: initialSetToolbarVisible,
      })
    );

    expect(subscribeToMessages).toHaveBeenCalledTimes(1);

    await renderBridge(
      createBridgeParams({
        setIsToolbarVisible: nextSetToolbarVisible,
      })
    );

    expect(subscribeToMessages).toHaveBeenCalledTimes(1);

    const listener = subscribeToMessages.mock.calls[0]?.[0] as
      | ((
          message: unknown,
          sender: chrome.runtime.MessageSender,
          sendResponse: (response?: unknown) => void
        ) => boolean)
      | undefined;

    expect(listener).toBeTypeOf('function');

    listener?.({ type: MessageType.SHOW_TOOLBAR }, {} as chrome.runtime.MessageSender, vi.fn());

    expect(initialSetToolbarVisible).not.toHaveBeenCalled();
    expect(nextSetToolbarVisible).toHaveBeenCalledWith(true);
  });
  it(
    'keeps ENABLE_SCREENSHOT_MODE routed through the UI bridge after listener ownership filtering',
    expectScreenshotMessagesStillRouteThroughUiBridge
  );
});
