// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  armCleanupState,
  createHandleCancelCountdownMock,
  createHandleTakeScreenshotMock,
  disableSelectionModeIfLoadedMock,
  handleCancelCountdownMock,
  handleTakeScreenshotMock,
  setUIHiddenMock,
} = vi.hoisted(() => ({
  armCleanupState: { current: false },
  createHandleCancelCountdownMock: vi.fn(),
  createHandleTakeScreenshotMock: vi.fn(),
  disableSelectionModeIfLoadedMock: vi.fn(),
  handleCancelCountdownMock: vi.fn(),
  handleTakeScreenshotMock: vi.fn(),
  setUIHiddenMock: vi.fn(),
}));

vi.mock('./session/cancel', () => ({
  createHandleCancelCountdown: createHandleCancelCountdownMock,
}));

vi.mock('./session/capture', () => ({
  createHandleTakeScreenshot: createHandleTakeScreenshotMock,
}));

vi.mock('../../selection/selection-mode/lazy', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../selection/selection-mode/lazy')>()),
  disableSelectionModeIfLoaded: disableSelectionModeIfLoadedMock,
}));

vi.mock('../../selection/locker', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../selection/locker')>()),
  setUIHidden: setUIHiddenMock,
}));

import { useScreenshotController } from './controller';
import type { CreateScreenshotControllerActionsArgs } from './session/action-types';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latestActionArgs: CreateScreenshotControllerActionsArgs | null = null;
let latestControllerResult: ReturnType<typeof useScreenshotController> | null = null;

function createParams() {
  return {
    capturePersistence: {
      sessionActivePresetId: null,
      setSaveDialogState: vi.fn(),
    },
    captureActionRef: { current: 'download_default' as const },
    editingModes: {
      aiPickMode: false,
      disableAiPickMode: vi.fn(),
      disableHighlighterMode: vi.fn(),
      disableQuickEditMode: vi.fn(),
      highlighterMode: false,
      quickEditMode: false,
      setAiPickMode: vi.fn(),
      setHighlighterMode: vi.fn(),
      setQuickEditMode: vi.fn(),
    },
    navigationLockEnabled: true,
    quickActionOverlayRef: { current: null },
    setCaptureAction: vi.fn(),
    setIsCompletelyHidden: vi.fn(),
    setIsToolbarVisible: vi.fn(),
    setNavigationLockEnabled: vi.fn(),
    setQuickActionOverlay: vi.fn(),
    setScreenshotMode: vi.fn(),
    setTimerDelay: vi.fn(),
    timerDelay: 0,
  };
}

function Harness({ armCleanup }: { armCleanup: boolean }) {
  armCleanupState.current = armCleanup;
  latestControllerResult = useScreenshotController(createParams());

  return <div data-arm-cleanup={String(armCleanup)} />;
}

async function renderHarness(armCleanup: boolean) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<Harness armCleanup={armCleanup} />);
  });
}

function configureActionMock() {
  createHandleCancelCountdownMock.mockImplementation((args) => {
    latestActionArgs = args;
    const handleCancelCountdown = vi.fn(() => {
      handleCancelCountdownMock();
    });

    if (armCleanupState.current) {
      args.session.countdownLock = {
        navigationLockEnabledBeforeCountdown: true,
      };
    }

    return handleCancelCountdown;
  });
  createHandleTakeScreenshotMock.mockImplementation((args) => {
    latestActionArgs = args;
    return handleTakeScreenshotMock;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  latestActionArgs = null;
  latestControllerResult = null;
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  configureActionMock();
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

async function expectInvalidationReturnsActiveRunBaselineAndCleansSelection() {
  await renderHarness(false);
  expect(latestActionArgs).not.toBeNull();
  expect(latestControllerResult).not.toBeNull();
  expect(latestActionArgs!.runtime.session).toBe(latestActionArgs!.session);
  latestActionArgs!.session.navigationLockBaseline = false;
  latestActionArgs!.session.countdownLock = {
    navigationLockEnabledBeforeCountdown: false,
  };
  latestActionArgs!.session.countdownRunToken = 1;
  latestActionArgs!.session.countdownTimeout = globalThis.setTimeout(vi.fn(), 1000);
  latestActionArgs!.session.pendingType = 'selection';
  latestActionArgs!.session.runActive = true;

  const startContext = latestControllerResult!.invalidateScreenshotRuns();

  expect(startContext).toEqual({ navigationLockBaseline: false });
  expect(setUIHiddenMock).toHaveBeenCalledWith(false);
  expect(latestActionArgs!.params.setIsCompletelyHidden).toHaveBeenCalledWith(false);
  expect(latestActionArgs!.session.countdownLock).toBeNull();
  expect(latestActionArgs!.session.countdownRunToken).toBeNull();
  expect(latestActionArgs!.session.countdownTimeout).toBeNull();
  expect(latestActionArgs!.session.pendingType).toBeNull();
  expect(latestActionArgs!.session.runActive).toBe(false);
  expect(latestActionArgs!.session.runGeneration).toBe(1);
  expect(disableSelectionModeIfLoadedMock).toHaveBeenCalledOnce();
}

describe('useScreenshotController', () => {
  it('cancels the countdown on unmount when a countdown lock session is still active', async () => {
    await renderHarness(true);

    act(() => {
      root?.unmount();
    });
    root = null;

    expect(handleCancelCountdownMock).toHaveBeenCalledTimes(1);
  });

  it('skips unmount cancellation when no countdown session is active', async () => {
    await renderHarness(false);

    act(() => {
      root?.unmount();
    });
    root = null;

    expect(handleCancelCountdownMock).not.toHaveBeenCalled();
  });

  it('keeps an active countdown alive across rerenders and cancels it on unmount', async () => {
    await renderHarness(true);
    await renderHarness(true);

    expect(handleCancelCountdownMock).not.toHaveBeenCalled();

    act(() => {
      root?.unmount();
    });
    root = null;

    expect(handleCancelCountdownMock).toHaveBeenCalledTimes(1);
  });

  it('invalidates active runs with their original lock baseline and selection cleanup', async () => {
    await expectInvalidationReturnsActiveRunBaselineAndCleansSelection();
  });
});
