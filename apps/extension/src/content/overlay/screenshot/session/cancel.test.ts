import type { MutableRefObject } from 'react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createHandleCancelCountdown } from './cancel';
import type { ScreenshotControllerRuntime } from '../types';
import type { CountdownLockSession, ScreenshotType } from '../countdown/controller';
import type { ScreenshotControllerParams } from '../mode';

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

function createRefs(overrides: Partial<FactoryArgs['refs']> = {}): FactoryArgs['refs'] {
  return {
    countdownLockSessionRef: { current: null } as MutableRefObject<CountdownLockSession | null>,
    countdownRunTokenRef: { current: null } as MutableRefObject<number | null>,
    countdownTimeoutRef: {
      current: null,
    } as MutableRefObject<ReturnType<typeof setTimeout> | null>,
    navigationLockStateBeforeScreenshot: { current: true },
    pendingScreenshotType: { current: null } as MutableRefObject<ScreenshotType | null>,
    ...overrides,
  };
}

function createArgs(overrides: Partial<FactoryArgs> = {}) {
  const setCountdown = vi.fn();

  const args: FactoryArgs = {
    params: createParams(),
    refs: createRefs(),
    runtime: createRuntime(),
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
    refs: createRefs({
      countdownTimeoutRef: {
        current: timeoutId,
      } as MutableRefObject<ReturnType<typeof setTimeout> | null>,
    }),
  });

  createHandleCancelCountdown(args)();
  clearTimeout(timeoutId);

  expect(setCountdown).not.toHaveBeenCalledWith(null);
  expect(resetCountdownRuntimeStateMock).toHaveBeenCalledWith({
    countdownTimeoutRef: args.refs.countdownTimeoutRef,
    pendingScreenshotType: args.refs.pendingScreenshotType,
    setCountdown,
  });
  expect(setUIHiddenMock).toHaveBeenCalledWith(false);
  expect(cancelQuickActionCountdownMock).toHaveBeenCalledWith(
    args.params,
    args.runtime,
    args.refs.countdownLockSessionRef
  );
  expect(restoreCountdownLockOnCancelMock).not.toHaveBeenCalled();
}

function verifyStandardCancelBranch() {
  const timeoutId = setTimeout(() => undefined, 1_000);
  const { args, setCountdown } = createArgs({
    refs: createRefs({
      countdownTimeoutRef: {
        current: timeoutId,
      } as MutableRefObject<ReturnType<typeof setTimeout> | null>,
    }),
  });

  createHandleCancelCountdown(args)();
  clearTimeout(timeoutId);

  expect(setCountdown).not.toHaveBeenCalledWith(null);
  expect(resetCountdownRuntimeStateMock).toHaveBeenCalledWith({
    countdownTimeoutRef: args.refs.countdownTimeoutRef,
    pendingScreenshotType: args.refs.pendingScreenshotType,
    setCountdown,
  });
  expect(restoreCountdownLockOnCancelMock).toHaveBeenCalledWith({
    countdownLockSessionRef: args.refs.countdownLockSessionRef,
    navigationLockStateBeforeScreenshot: args.refs.navigationLockStateBeforeScreenshot,
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
