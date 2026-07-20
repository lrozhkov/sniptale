import type { MutableRefObject } from 'react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { executeCountdownScreenshot } from './elapsed';
import type { ScreenshotControllerRuntime } from '../types';
import type { CountdownLockSession, ScreenshotType } from '../countdown/controller';
import { StaleScreenshotRunError, type ScreenshotControllerParams } from '../mode';

const {
  showToastMock,
  getQuickActionSuccessMessageMock,
  restoreVisibleUiStateMock,
  runSelectionScreenshotMock,
  runViewportScreenshotMock,
  showScreenshotErrorMock,
  showSelectionErrorMock,
  closeQuickActionCaptureMock,
  shouldExitAfterQuickActionCaptureMock,
  syncCaptureActionMock,
} = vi.hoisted(() => ({
  closeQuickActionCaptureMock: vi.fn(),
  getQuickActionSuccessMessageMock: vi.fn(),
  restoreVisibleUiStateMock: vi.fn(),
  runSelectionScreenshotMock: vi.fn(),
  runViewportScreenshotMock: vi.fn(),
  showScreenshotErrorMock: vi.fn(),
  showSelectionErrorMock: vi.fn(),
  shouldExitAfterQuickActionCaptureMock: vi.fn(),
  showToastMock: vi.fn(),
  syncCaptureActionMock: vi.fn(),
}));

vi.mock('@sniptale/ui/product-feedback/toast-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-feedback/toast-service')>()),
  showToast: showToastMock,
}));

vi.mock('../feedback', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../feedback')>()),
  getQuickActionSuccessMessage: getQuickActionSuccessMessageMock,
  restoreVisibleUiState: restoreVisibleUiStateMock,
  showScreenshotError: showScreenshotErrorMock,
  showSelectionError: showSelectionErrorMock,
}));

vi.mock('../capture/run', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../capture/run')>()),
  runSelectionScreenshot: runSelectionScreenshotMock,
  runViewportScreenshot: runViewportScreenshotMock,
}));

vi.mock('../mode', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../mode')>()),
  closeQuickActionCapture: closeQuickActionCaptureMock,
  shouldExitAfterQuickActionCapture: shouldExitAfterQuickActionCaptureMock,
  syncCaptureAction: syncCaptureActionMock,
}));

type ActionArgs = Parameters<typeof executeCountdownScreenshot>[1];

function createParams(
  overrides: Partial<ScreenshotControllerParams> = {}
): ScreenshotControllerParams {
  return {
    capturePersistence: {
      sessionActivePresetId: null,
      setSaveDialogState: vi.fn(),
    },
    captureActionRef: { current: 'download_default' },
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
    ...overrides,
  };
}

function createRuntime(): ScreenshotControllerRuntime {
  return {
    capturePersistence: {
      sessionActivePresetId: null,
      setSaveDialogState: vi.fn(),
    },
    captureActionRef: { current: 'download_default' },
    navigationLockStateBeforeScreenshot: { current: true },
    screenshotRunActiveRef: { current: false },
    screenshotRunGenerationRef: { current: 1 },
    setIsCompletelyHidden: vi.fn(),
    setIsToolbarVisible: vi.fn(),
    setNavigationLockEnabled: vi.fn(),
  };
}

function createArgs(overrides: Partial<ActionArgs> = {}): ActionArgs {
  return {
    params: createParams(),
    refs: {
      countdownLockSessionRef: { current: null } as MutableRefObject<CountdownLockSession | null>,
      countdownRunTokenRef: { current: null } as MutableRefObject<number | null>,
      countdownTimeoutRef: {
        current: null,
      } as MutableRefObject<ReturnType<typeof setTimeout> | null>,
      navigationLockStateBeforeScreenshot: { current: true },
      pendingScreenshotType: { current: 'visible' } as MutableRefObject<ScreenshotType | null>,
    },
    runtime: createRuntime(),
    setCountdown: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  syncCaptureActionMock.mockResolvedValue(undefined);
  runSelectionScreenshotMock.mockResolvedValue(undefined);
  runViewportScreenshotMock.mockResolvedValue(undefined);
  shouldExitAfterQuickActionCaptureMock.mockReturnValue(false);
});

async function expectCountdownQuickActionSuccessClosesOverlayAndShowsToast() {
  getQuickActionSuccessMessageMock.mockReturnValue('Copied');
  shouldExitAfterQuickActionCaptureMock.mockReturnValue(true);
  const args = createArgs({
    params: createParams({
      quickActionOverlayRef: {
        current: {
          afterCapture: 'copy',
          exitAfterCapture: true,
          imageFormat: 'png',
          imageQuality: 90,
        },
      },
    }),
  });

  await executeCountdownScreenshot('visible', args, 1);

  expect(syncCaptureActionMock).toHaveBeenCalledWith(args.params);
  expect(runViewportScreenshotMock).toHaveBeenCalledWith('visible', args.runtime, {
    runToken: 1,
    showSuccessToast: false,
  });
  expect(closeQuickActionCaptureMock).toHaveBeenCalledWith(args.params, args.runtime, 1);
  expect(showToastMock).toHaveBeenCalledWith('Copied', 'success');
  expect(restoreVisibleUiStateMock).not.toHaveBeenCalled();
  expect(args.setCountdown).toHaveBeenCalledWith(null);
  expect(args.refs.pendingScreenshotType.current).toBeNull();
}

async function expectCountdownSelectionFailureRestoresUiAndReportsSelectionError() {
  const error = new Error('selection failed');
  runSelectionScreenshotMock.mockRejectedValue(error);
  const args = createArgs({
    refs: {
      countdownLockSessionRef: { current: null } as MutableRefObject<CountdownLockSession | null>,
      countdownRunTokenRef: { current: null } as MutableRefObject<number | null>,
      countdownTimeoutRef: {
        current: null,
      } as MutableRefObject<ReturnType<typeof setTimeout> | null>,
      navigationLockStateBeforeScreenshot: { current: true },
      pendingScreenshotType: { current: 'selection' } as MutableRefObject<ScreenshotType | null>,
    },
  });

  await executeCountdownScreenshot('selection', args, 1);

  expect(showSelectionErrorMock).toHaveBeenCalledWith(error);
  expect(showScreenshotErrorMock).not.toHaveBeenCalled();
  expect(restoreVisibleUiStateMock).toHaveBeenCalledWith(args.runtime, 1);
  expect(args.setCountdown).toHaveBeenCalledWith(null);
  expect(args.refs.pendingScreenshotType.current).toBeNull();
}

async function expectStaleCountdownRunDoesNotCaptureOrRestore() {
  const args = createArgs({
    params: createParams({
      quickActionOverlayRef: {
        current: {
          afterCapture: 'copy',
          exitAfterCapture: true,
          imageFormat: 'png',
          imageQuality: 90,
        },
      },
    }),
    runtime: {
      ...createRuntime(),
      screenshotRunGenerationRef: { current: 2 },
    },
  });

  await executeCountdownScreenshot('visible', args, 1);

  expect(syncCaptureActionMock).not.toHaveBeenCalled();
  expect(runViewportScreenshotMock).not.toHaveBeenCalled();
  expect(runSelectionScreenshotMock).not.toHaveBeenCalled();
  expect(closeQuickActionCaptureMock).not.toHaveBeenCalled();
  expect(showToastMock).not.toHaveBeenCalled();
  expect(restoreVisibleUiStateMock).not.toHaveBeenCalled();
  expect(args.setCountdown).toHaveBeenCalledWith(null);
  expect(args.refs.pendingScreenshotType.current).toBeNull();
}

async function expectStaleCountdownRunDoesNotClearNewerCountdown() {
  const args = createArgs({
    runtime: {
      ...createRuntime(),
      screenshotRunGenerationRef: { current: 2 },
    },
  });
  args.refs.countdownRunTokenRef.current = 2;
  args.refs.pendingScreenshotType.current = 'full';

  await executeCountdownScreenshot('visible', args, 1);

  expect(syncCaptureActionMock).not.toHaveBeenCalled();
  expect(args.setCountdown).not.toHaveBeenCalled();
  expect(args.refs.countdownRunTokenRef.current).toBe(2);
  expect(args.refs.pendingScreenshotType.current).toBe('full');
}

async function expectStaleCountdownCaptureDoesNotShowFeedback() {
  getQuickActionSuccessMessageMock.mockReturnValue('Copied');
  shouldExitAfterQuickActionCaptureMock.mockReturnValue(true);
  const args = createArgs({
    params: createParams({
      quickActionOverlayRef: {
        current: {
          afterCapture: 'copy',
          exitAfterCapture: true,
          imageFormat: 'png',
          imageQuality: 90,
        },
      },
    }),
  });
  runViewportScreenshotMock.mockImplementation(async () => {
    args.runtime.screenshotRunGenerationRef.current = 2;
    throw new StaleScreenshotRunError();
  });

  await executeCountdownScreenshot('visible', args, 1);

  expect(closeQuickActionCaptureMock).not.toHaveBeenCalled();
  expect(showToastMock).not.toHaveBeenCalled();
  expect(showScreenshotErrorMock).not.toHaveBeenCalled();
  expect(restoreVisibleUiStateMock).toHaveBeenCalledWith(args.runtime, 1);
  expect(args.setCountdown).toHaveBeenCalledWith(null);
  expect(args.refs.pendingScreenshotType.current).toBeNull();
}

describe('screenshot-controller-action-elapsed', () => {
  it(
    'closes quick-action countdown captures and shows the derived success toast after viewport completion',
    expectCountdownQuickActionSuccessClosesOverlayAndShowsToast
  );
  it(
    'restores visible UI and routes selection failures through the selection error surface',
    expectCountdownSelectionFailureRestoresUiAndReportsSelectionError
  );
  it(
    'aborts stale delayed quick-action captures before capture or restore side effects',
    expectStaleCountdownRunDoesNotCaptureOrRestore
  );
  it(
    'does not let stale countdown callbacks clear a newer countdown owner',
    expectStaleCountdownRunDoesNotClearNewerCountdown
  );
  it(
    'suppresses stale countdown capture feedback after an in-flight supersede',
    expectStaleCountdownCaptureDoesNotShowFeedback
  );
});
