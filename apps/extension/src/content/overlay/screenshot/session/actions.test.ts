import type { MutableRefObject } from 'react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createScreenshotControllerActions } from './actions';
import type { CreateScreenshotControllerActionsArgs } from './action-types';

const { createHandleCancelCountdownMock, createHandleTakeScreenshotMock } = vi.hoisted(() => ({
  createHandleCancelCountdownMock: vi.fn(),
  createHandleTakeScreenshotMock: vi.fn(),
}));

vi.mock('./cancel', () => ({
  createHandleCancelCountdown: createHandleCancelCountdownMock,
}));

vi.mock('./capture', () => ({
  createHandleTakeScreenshot: createHandleTakeScreenshotMock,
}));

type ControllerArgs = Parameters<typeof createScreenshotControllerActions>[0];

function createParams(): ControllerArgs['params'] {
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
  };
}

function createArgs(overrides: Partial<ControllerArgs> = {}): ControllerArgs {
  return {
    params: createParams(),
    refs: {
      countdownLockSessionRef: { current: null } as MutableRefObject<null>,
      countdownRunTokenRef: { current: null } as MutableRefObject<number | null>,
      countdownTimeoutRef: {
        current: null,
      } as MutableRefObject<ReturnType<typeof setTimeout> | null>,
      navigationLockStateBeforeScreenshot: { current: true },
      pendingScreenshotType: { current: null } as MutableRefObject<null>,
    },
    runtime: {
      capturePersistence: {
        sessionActivePresetId: null,
        setSaveDialogState: vi.fn(),
      },
      captureActionRef: { current: 'download_default' },
      navigationLockStateBeforeScreenshot: { current: true },
      screenshotRunActiveRef: { current: false },
      screenshotRunGenerationRef: { current: 0 },
      setIsCompletelyHidden: vi.fn(),
      setIsToolbarVisible: vi.fn(),
      setNavigationLockEnabled: vi.fn(),
    },
    setCountdown: vi.fn(),
    ...overrides,
  } satisfies CreateScreenshotControllerActionsArgs;
}

beforeEach(() => {
  vi.clearAllMocks();
  createHandleCancelCountdownMock.mockReturnValue(vi.fn());
  createHandleTakeScreenshotMock.mockReturnValue(vi.fn());
});

function verifyFacadeDelegatesToOwnerLocalCreators() {
  const handleCancelCountdown = vi.fn();
  const handleTakeScreenshot = vi.fn();
  createHandleCancelCountdownMock.mockReturnValue(handleCancelCountdown);
  createHandleTakeScreenshotMock.mockReturnValue(handleTakeScreenshot);
  const args = createArgs();

  const actions = createScreenshotControllerActions(args);

  expect(createHandleCancelCountdownMock).toHaveBeenCalledWith(args);
  expect(createHandleTakeScreenshotMock).toHaveBeenCalledWith(args);
  expect(actions).toEqual({
    handleCancelCountdown,
    handleTakeScreenshot,
  });
}

describe('createScreenshotControllerActions', () => {
  it(
    'delegates action creation to owner-local cancel and capture seams',
    verifyFacadeDelegatesToOwnerLocalCreators
  );
});
