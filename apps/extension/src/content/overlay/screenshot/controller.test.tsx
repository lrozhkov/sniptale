// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  armCleanupState,
  createScreenshotControllerActionsMock,
  disableSelectionModeIfLoadedMock,
  handleCancelCountdownMock,
  handleTakeScreenshotMock,
  setUIHiddenMock,
} = vi.hoisted(() => ({
  armCleanupState: { current: false },
  createScreenshotControllerActionsMock: vi.fn(),
  disableSelectionModeIfLoadedMock: vi.fn(),
  handleCancelCountdownMock: vi.fn(),
  handleTakeScreenshotMock: vi.fn(),
  setUIHiddenMock: vi.fn(),
}));

vi.mock('./session/actions', () => ({
  createScreenshotControllerActions: createScreenshotControllerActionsMock,
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

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latestActionArgs: Parameters<typeof createScreenshotControllerActionsMock>[0] | null = null;
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
  createScreenshotControllerActionsMock.mockImplementation((args) => {
    latestActionArgs = args;
    const handleCancelCountdown = vi.fn(() => {
      handleCancelCountdownMock();
    });

    if (armCleanupState.current) {
      args.refs.countdownLockSessionRef.current = {
        navigationLockEnabledBeforeCountdown: true,
      };
    }

    return {
      handleCancelCountdown,
      handleTakeScreenshot: handleTakeScreenshotMock,
    };
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
  latestActionArgs!.refs.navigationLockStateBeforeScreenshot.current = false;
  latestActionArgs!.refs.countdownLockSessionRef.current = {
    navigationLockEnabledBeforeCountdown: false,
  };
  latestActionArgs!.refs.countdownRunTokenRef.current = 1;
  latestActionArgs!.refs.countdownTimeoutRef.current = setTimeout(vi.fn(), 1000);
  latestActionArgs!.refs.pendingScreenshotType.current = 'selection';
  latestActionArgs!.runtime.screenshotRunActiveRef.current = true;

  const startContext = latestControllerResult!.invalidateScreenshotRuns();

  expect(startContext).toEqual({ navigationLockBaseline: false });
  expect(setUIHiddenMock).toHaveBeenCalledWith(false);
  expect(latestActionArgs!.params.setIsCompletelyHidden).toHaveBeenCalledWith(false);
  expect(latestActionArgs!.refs.countdownLockSessionRef.current).toBeNull();
  expect(latestActionArgs!.refs.countdownRunTokenRef.current).toBeNull();
  expect(latestActionArgs!.refs.countdownTimeoutRef.current).toBeNull();
  expect(latestActionArgs!.refs.pendingScreenshotType.current).toBeNull();
  expect(latestActionArgs!.runtime.screenshotRunActiveRef.current).toBe(false);
  expect(latestActionArgs!.runtime.screenshotRunGenerationRef.current).toBe(1);
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
