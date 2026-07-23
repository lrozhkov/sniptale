import { beforeEach, describe, expect, it, vi } from 'vitest';

import { runImmediateScreenshot } from './immediate';
import type { ScreenshotControllerRuntime } from '../types';
import { StaleScreenshotRunError, type ScreenshotControllerParams } from '../mode';
import { createScreenshotControllerSession } from './state';
import type { ScreenshotControllerSession } from './state';

const {
  hideAllToastsMock,
  runSelectionScreenshotMock,
  runViewportScreenshotMock,
  restoreVisibleUiStateMock,
  shouldExitAfterQuickActionCaptureMock,
  closeQuickActionCaptureMock,
  showSelectionErrorMock,
  showScreenshotErrorMock,
} = vi.hoisted(() => ({
  closeQuickActionCaptureMock: vi.fn(),
  hideAllToastsMock: vi.fn(),
  restoreVisibleUiStateMock: vi.fn(),
  runSelectionScreenshotMock: vi.fn(),
  runViewportScreenshotMock: vi.fn(),
  shouldExitAfterQuickActionCaptureMock: vi.fn(),
  showScreenshotErrorMock: vi.fn(),
  showSelectionErrorMock: vi.fn(),
}));

vi.mock('@sniptale/ui/product-feedback/toast-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-feedback/toast-service')>()),
  hideAllToasts: hideAllToastsMock,
}));

vi.mock('../feedback', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../feedback')>()),
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
}));

type ActionArgs = Parameters<typeof runImmediateScreenshot>[1];

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
  runSelectionScreenshotMock.mockResolvedValue(undefined);
  runViewportScreenshotMock.mockResolvedValue(undefined);
  shouldExitAfterQuickActionCaptureMock.mockReturnValue(false);
});

async function expectViewportImmediateSuccessRestoresVisibleUi() {
  const args = createArgs();

  await runImmediateScreenshot('visible', args, 1);

  expect(hideAllToastsMock).toHaveBeenCalledTimes(1);
  expect(runViewportScreenshotMock).toHaveBeenCalledWith('visible', args.runtime, {
    runToken: 1,
  });
  expect(restoreVisibleUiStateMock).toHaveBeenCalledWith(args.runtime, 1);
  expect(closeQuickActionCaptureMock).not.toHaveBeenCalled();
}

async function expectSelectionFailureShowsSelectionError() {
  const args = createArgs();
  const error = new Error('selection failed');
  runSelectionScreenshotMock.mockRejectedValue(error);

  await runImmediateScreenshot('selection', args, 1);

  expect(restoreVisibleUiStateMock).toHaveBeenCalledWith(args.runtime, 1);
  expect(showSelectionErrorMock).toHaveBeenCalledWith(error);
  expect(showScreenshotErrorMock).not.toHaveBeenCalled();
}

async function expectStaleImmediateFailureDoesNotShowError() {
  const args = createArgs();
  runViewportScreenshotMock.mockImplementation(async () => {
    args.session.runGeneration = 2;
    throw new StaleScreenshotRunError();
  });

  await runImmediateScreenshot('visible', args, 1);

  expect(restoreVisibleUiStateMock).toHaveBeenCalledWith(args.runtime, 1);
  expect(showSelectionErrorMock).not.toHaveBeenCalled();
  expect(showScreenshotErrorMock).not.toHaveBeenCalled();
}

describe('screenshot-controller-action-immediate', () => {
  it(
    'runs viewport capture and restores the visible runtime state',
    expectViewportImmediateSuccessRestoresVisibleUi
  );
  it(
    'routes selection failures to the selection error surface without using viewport error handling',
    expectSelectionFailureShowsSelectionError
  );
  it(
    'suppresses stale capture aborts without showing an error',
    expectStaleImmediateFailureDoesNotShowError
  );
});
