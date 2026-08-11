// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { ContentPrivilegedActionIntentSource } from '../../../content/application/privileged-action-intent';
import type { ContentAppModeState } from '../../../content/overlay/app/mode';
import type { ScreenshotStartContext } from '../../../content/overlay/screenshot/types';
import { createModeState } from './mode-state.test-support';
import { usePreparationSurfacePortSync } from './port-sync';
import type { UseToolbarModeControllerResult } from '../../../content/overlay/toolbar/mode-controller/types';

type PortCommand = { type: string; viewport?: { width: number; height: number } };
type PortListener = (command: PortCommand) => void | Promise<void>;

const mocks = vi.hoisted(() => ({
  connectPort: vi.fn(),
  handleScreenshotModeMessage: vi.fn(),
  invalidateScreenshotRuns: vi.fn(),
}));

vi.mock('../../../content/overlay/app/message-bridge/message-helpers', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../content/overlay/app/message-bridge/message-helpers')
  >()),
  handleScreenshotModeMessage: mocks.handleScreenshotModeMessage,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let portListener: PortListener | null = null;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.clearAllMocks();
  mocks.handleScreenshotModeMessage.mockImplementation(
    (_command, _params, sendResponse: (response: { success: boolean }) => void) => {
      sendResponse({ success: true });
      return true;
    }
  );
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  mocks.connectPort.mockImplementation((listener: PortListener) => {
    portListener = listener;
    return vi.fn();
  });
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  portListener = null;
  vi.unstubAllGlobals();
});

it('forwards viewer preparation port commands through the screenshot mode handler', async () => {
  const modeState = createModeState();
  const handleTakeScreenshot = vi.fn().mockResolvedValue(undefined);
  renderHarness(modeState, handleTakeScreenshot);
  const command = {
    type: MessageType.ENABLE_SCREENSHOT_MODE,
    viewport: { width: 1024, height: 768 },
  };

  await act(async () => {
    await portListener?.(command);
  });

  expect(mocks.handleScreenshotModeMessage).toHaveBeenCalledWith(
    command,
    expect.objectContaining({
      modeControls: expect.objectContaining({
        setScreenshotMode: modeState.setScreenshotMode,
      }),
      viewport: expect.objectContaining({
        clearPendingAutoStartCapture: modeState.clearPendingAutoStartCapture,
        handleTakeScreenshotRef: { current: handleTakeScreenshot },
        setCurrentViewport: modeState.setCurrentViewport,
      }),
    }),
    expect.any(Function)
  );
});

it('waits for the asynchronous content teardown acknowledgement before resolving', async () => {
  const modeState = createModeState();
  const responseRef: { current: ((response: { success: boolean }) => void) | null } = {
    current: null,
  };
  mocks.handleScreenshotModeMessage.mockImplementation(
    (_command, _params, sendResponse: (response: { success: boolean }) => void) => {
      responseRef.current = sendResponse;
      return true;
    }
  );
  renderHarness(modeState, vi.fn().mockResolvedValue(undefined));

  const commandPromise = portListener?.({ type: MessageType.DISABLE_SCREENSHOT_MODE });
  let settled = false;
  void commandPromise?.then(() => {
    settled = true;
  });
  await Promise.resolve();
  expect(settled).toBe(false);

  responseRef.current?.({ success: true });
  await expect(commandPromise).resolves.toBeUndefined();
});

it('rejects an asynchronous negative teardown acknowledgement', async () => {
  const modeState = createModeState();
  mocks.handleScreenshotModeMessage.mockImplementation(
    (_command, _params, sendResponse: (response: { error: string; success: boolean }) => void) => {
      queueMicrotask(() => sendResponse({ error: 'Restoration failed', success: false }));
      return true;
    }
  );
  renderHarness(modeState, vi.fn().mockResolvedValue(undefined));

  await expect(portListener?.({ type: MessageType.DISABLE_SCREENSHOT_MODE })).rejects.toThrow(
    'Restoration failed'
  );
});

function renderHarness(
  modeState: ContentAppModeState,
  handleTakeScreenshot: (
    type: 'visible' | 'full' | 'selection',
    contentIntentSource?: ContentPrivilegedActionIntentSource,
    startContext?: ScreenshotStartContext
  ) => Promise<void>
) {
  function Harness() {
    usePreparationSurfacePortSync(
      modeState,
      createModeController(),
      handleTakeScreenshot,
      mocks.invalidateScreenshotRuns,
      mocks.connectPort
    );
    return null;
  }

  act(() => {
    root?.render(<Harness />);
  });
}

function createModeController(): UseToolbarModeControllerResult {
  return {
    handleClearHighlights: vi.fn(),
    handleEnableCursorMode: vi.fn(() => true),
    handleHideToolbar: vi.fn(),
    handleToggleDesignReviewMode: vi.fn(),
    handleToggleDrawingMode: vi.fn(),
    handleToggleHighlighterMode: vi.fn(),
    handleToggleNavigationLock: vi.fn(),
    handleToggleQuickEditDocumentMode: vi.fn(),
    handleToggleQuickEditMode: vi.fn(),
    handleToggleScreenshotMode: vi.fn(),
  };
}
