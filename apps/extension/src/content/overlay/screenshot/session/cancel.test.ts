import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createHandleCancelCountdown } from './cancel';
import type { ScreenshotControllerRuntime } from '../types';
import type { ScreenshotControllerParams } from '../mode';
import { createScreenshotControllerSession } from './state';
import type { ScreenshotControllerSession } from './state';

const {
  cancelQuickActionCountdownMock,
  resetCountdownRuntimeStateMock,
  restoreCountdownLockOnCancelMock,
  setUIHiddenMock,
} = vi.hoisted(() => ({
  cancelQuickActionCountdownMock: vi.fn(),
  resetCountdownRuntimeStateMock: vi.fn(),
  restoreCountdownLockOnCancelMock: vi.fn(),
  setUIHiddenMock: vi.fn(),
}));

vi.mock('../../../selection/locker', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../selection/locker')>()),
  setUIHidden: setUIHiddenMock,
}));

vi.mock('../countdown/controller', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../countdown/controller')>()),
  resetCountdownRuntimeState: resetCountdownRuntimeStateMock,
  restoreCountdownLockOnCancel: restoreCountdownLockOnCancelMock,
}));

vi.mock('../mode', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../mode')>()),
  cancelQuickActionCountdown: cancelQuickActionCountdownMock,
}));

type FactoryArgs = Parameters<typeof createHandleCancelCountdown>[0];

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
      designReviewMode: false,
      disableAiPickMode: vi.fn(),
      disableDesignReviewMode: vi.fn(),
      disableHighlighterMode: vi.fn(),
      disableQuickEditMode: vi.fn(),
      highlighterMode: false,
      quickEditMode: false,
      setAiPickMode: vi.fn(),
      setDesignReviewMode: vi.fn(),
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

function createArgs(overrides: Partial<FactoryArgs> = {}) {
  const setCountdown = vi.fn();
  const session = overrides.session ?? createScreenshotControllerSession(true);

  const args: FactoryArgs = {
    params: createParams(),
    runtime: createRuntime(session),
    session,
    setCountdown,
    ...overrides,
  };

  return { args, setCountdown };
}

beforeEach(() => {
  vi.clearAllMocks();
});

function verifyQuickActionCancelBranch() {
  const timeoutId = setTimeout(() => undefined, 1_000);
  const session = createScreenshotControllerSession(true);
  session.countdownTimeout = timeoutId;
  const { args, setCountdown } = createArgs({
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

  createHandleCancelCountdown(args)();
  clearTimeout(timeoutId);

  expect(setCountdown).not.toHaveBeenCalledWith(null);
  expect(resetCountdownRuntimeStateMock).toHaveBeenCalledWith({
    session: args.session,
    setCountdown,
  });
  expect(setUIHiddenMock).toHaveBeenCalledWith(false);
  expect(cancelQuickActionCountdownMock).toHaveBeenCalledWith(
    args.params,
    args.runtime,
    args.session
  );
  expect(restoreCountdownLockOnCancelMock).not.toHaveBeenCalled();
}

function verifyStandardCancelBranch() {
  const timeoutId = setTimeout(() => undefined, 1_000);
  const session = createScreenshotControllerSession(true);
  session.countdownTimeout = timeoutId;
  const { args, setCountdown } = createArgs({
    session,
  });

  createHandleCancelCountdown(args)();
  clearTimeout(timeoutId);

  expect(setCountdown).not.toHaveBeenCalledWith(null);
  expect(resetCountdownRuntimeStateMock).toHaveBeenCalledWith({
    session: args.session,
    setCountdown,
  });
  expect(restoreCountdownLockOnCancelMock).toHaveBeenCalledWith({
    session: args.session,
    setNavigationLockEnabled: args.params.setNavigationLockEnabled,
  });
  expect(args.params.setIsToolbarVisible).toHaveBeenCalledWith(true);
  expect(cancelQuickActionCountdownMock).not.toHaveBeenCalled();
}

describe('screenshot-controller-action-cancel', () => {
  it(
    'routes cancel through quick-action teardown when quick-action overlay is active',
    verifyQuickActionCancelBranch
  );
  it(
    'restores the normal countdown lock when quick-action overlay is not active',
    verifyStandardCancelBranch
  );
});
