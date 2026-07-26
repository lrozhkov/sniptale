import { beforeEach, describe, expect, it, vi } from 'vitest';

import { executeCountdownScreenshot } from './elapsed';
import type { ScreenshotControllerRuntime } from '../types';
import { StaleScreenshotRunError, type ScreenshotControllerParams } from '../mode';
import { createScreenshotControllerSession } from './state';
import type { ScreenshotControllerSession } from './state';

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

function createRuntime(session: ScreenshotControllerSession): ScreenshotControllerRuntime {
  return {
    capturePersistence: {
      sessionActivePresetId: null,
      setSaveDialogState: vi.fn(),
    },
    captureActionRef: { current: 'download_default' },
    session,
    setCaptureAction: vi.fn(),
    setIsCompletelyHidden: vi.fn(),
    setIsToolbarVisible: vi.fn(),
    setNavigationLockEnabled: vi.fn(),
  };
}

function createArgs(overrides: Partial<ActionArgs> = {}): ActionArgs {
  const session = overrides.session ?? createScreenshotControllerSession(true);
  if (session.runGeneration === 0) {
    session.runGeneration = 1;
  }
  session.pendingType ??= 'visible';

  return {
    params: createParams(),
    runtime: createRuntime(session),
    session,
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
  expect(args.session.pendingType).toBeNull();
}

async function expectCountdownSelectionFailureRestoresUiAndReportsSelectionError() {
  const error = new Error('selection failed');
  runSelectionScreenshotMock.mockRejectedValue(error);
  const session = createScreenshotControllerSession(true);
  session.pendingType = 'selection';
  const args = createArgs({ session });

  await executeCountdownScreenshot('selection', args, 1);

  expect(showSelectionErrorMock).toHaveBeenCalledWith(error);
  expect(showScreenshotErrorMock).not.toHaveBeenCalled();
  expect(restoreVisibleUiStateMock).toHaveBeenCalledWith(args.runtime, 1);
  expect(args.setCountdown).toHaveBeenCalledWith(null);
  expect(args.session.pendingType).toBeNull();
}

async function expectStaleCountdownRunDoesNotCaptureOrRestore() {
  const session = createScreenshotControllerSession(true);
  session.runGeneration = 2;
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
    session,
  });

  await executeCountdownScreenshot('visible', args, 1);

  expect(syncCaptureActionMock).not.toHaveBeenCalled();
  expect(runViewportScreenshotMock).not.toHaveBeenCalled();
  expect(runSelectionScreenshotMock).not.toHaveBeenCalled();
  expect(closeQuickActionCaptureMock).not.toHaveBeenCalled();
  expect(showToastMock).not.toHaveBeenCalled();
  expect(restoreVisibleUiStateMock).not.toHaveBeenCalled();
  expect(args.setCountdown).toHaveBeenCalledWith(null);
  expect(args.session.pendingType).toBeNull();
}

async function expectStaleCountdownRunDoesNotClearNewerCountdown() {
  const session = createScreenshotControllerSession(true);
  session.runGeneration = 2;
  const args = createArgs({ session });
  args.session.countdownRunToken = 2;
  args.session.pendingType = 'full';

  await executeCountdownScreenshot('visible', args, 1);

  expect(syncCaptureActionMock).not.toHaveBeenCalled();
  expect(args.setCountdown).not.toHaveBeenCalled();
  expect(args.session.countdownRunToken).toBe(2);
  expect(args.session.pendingType).toBe('full');
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
    args.session.runGeneration = 2;
    throw new StaleScreenshotRunError();
  });

  await executeCountdownScreenshot('visible', args, 1);

  expect(closeQuickActionCaptureMock).not.toHaveBeenCalled();
  expect(showToastMock).not.toHaveBeenCalled();
  expect(showScreenshotErrorMock).not.toHaveBeenCalled();
  expect(restoreVisibleUiStateMock).toHaveBeenCalledWith(args.runtime, 1);
  expect(args.setCountdown).toHaveBeenCalledWith(null);
  expect(args.session.pendingType).toBeNull();
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
