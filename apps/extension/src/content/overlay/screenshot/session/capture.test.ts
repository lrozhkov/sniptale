import type { MutableRefObject } from 'react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createHandleTakeScreenshot } from './capture';
import type { CountdownLockSession, ScreenshotType } from '../countdown/controller';
import type { ScreenshotControllerParams } from '../mode';

const {
  executeCountdownScreenshotMock,
  prepareScreenshotModeMock,
  runImmediateScreenshotMock,
  startCountdownMock,
  syncCaptureActionMock,
} = vi.hoisted(() => ({
  executeCountdownScreenshotMock: vi.fn(),
  prepareScreenshotModeMock: vi.fn(),
  runImmediateScreenshotMock: vi.fn(),
  startCountdownMock: vi.fn(),
  syncCaptureActionMock: vi.fn(),
}));

vi.mock('../countdown/controller', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../countdown/controller')>()),
  startCountdown: startCountdownMock,
}));

vi.mock('./elapsed', () => ({
  executeCountdownScreenshot: executeCountdownScreenshotMock,
}));

vi.mock('./immediate', () => ({
  runImmediateScreenshot: runImmediateScreenshotMock,
}));

vi.mock('../mode', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../mode')>()),
  prepareScreenshotMode: prepareScreenshotModeMock,
  syncCaptureAction: syncCaptureActionMock,
}));

type FactoryArgs = Parameters<typeof createHandleTakeScreenshot>[0];

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
    setCountdown,
    ...overrides,
  };

  return { args, setCountdown };
}

beforeEach(() => {
  vi.clearAllMocks();
  syncCaptureActionMock.mockResolvedValue(undefined);
  runImmediateScreenshotMock.mockResolvedValue(undefined);
  executeCountdownScreenshotMock.mockResolvedValue(undefined);
});

async function verifyCountdownStartBranch() {
  const { args } = createArgs({
    params: createParams({ timerDelay: 3 }),
  });

  await createHandleTakeScreenshot(args)('selection');

  expect(syncCaptureActionMock).toHaveBeenCalledWith(args.params);
  expect(prepareScreenshotModeMock).toHaveBeenCalledWith(
    args.params,
    args.refs.navigationLockStateBeforeScreenshot,
    undefined
  );
  expect(startCountdownMock).toHaveBeenCalledTimes(1);
  expect(runImmediateScreenshotMock).not.toHaveBeenCalled();
  const countdownArgs = startCountdownMock.mock.calls[0]?.[0];
  expect(countdownArgs?.type).toBe('selection');
  expect(args.refs.countdownRunTokenRef.current).toBe(1);
  countdownArgs?.onElapsed();
  expect(executeCountdownScreenshotMock).toHaveBeenCalledWith('selection', args, 1, undefined);
}

async function verifyImmediateViewportBranch() {
  const { args } = createArgs();

  await createHandleTakeScreenshot(args)('visible');

  expect(syncCaptureActionMock).toHaveBeenCalledWith(args.params);
  expect(prepareScreenshotModeMock).toHaveBeenCalledWith(
    args.params,
    args.refs.navigationLockStateBeforeScreenshot,
    undefined
  );
  expect(prepareScreenshotModeMock.mock.invocationCallOrder[0]).toBeLessThan(
    runImmediateScreenshotMock.mock.invocationCallOrder[0] ?? 0
  );
  expect(runImmediateScreenshotMock).toHaveBeenCalledWith('visible', args, 1);
  expect(startCountdownMock).not.toHaveBeenCalled();
}

async function verifyAutoStartContextBranch() {
  const { args } = createArgs();
  const startContext = { navigationLockBaseline: false };

  await createHandleTakeScreenshot(args)('visible', undefined, startContext);

  expect(prepareScreenshotModeMock).toHaveBeenCalledWith(
    args.params,
    args.refs.navigationLockStateBeforeScreenshot,
    startContext
  );
  expect(runImmediateScreenshotMock).toHaveBeenCalledWith('visible', args, 1);
}

describe('screenshot-controller-action-capture', () => {
  it(
    'starts countdown instead of immediate capture when timerDelay is configured',
    verifyCountdownStartBranch
  );
  it('runs immediate viewport capture when timerDelay is zero', verifyImmediateViewportBranch);
  it('passes auto-start context into screenshot preparation', verifyAutoStartContextBranch);
});
