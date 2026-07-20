import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { QuickActionOverlay } from '../../../contracts/settings';
import type { ScreenshotControllerRuntime } from './types';
import {
  cancelQuickActionCountdown,
  closeQuickActionCapture,
  prepareScreenshotMode,
  syncCaptureAction,
  type ScreenshotControllerParams,
} from './mode';
import {
  disableNavigationLock,
  enableNavigationLock,
  isLockEnabled,
  setUIHidden,
} from '../../selection/locker';
import type { CountdownLockSession } from './countdown/controller';

vi.mock('../../selection/locker', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../selection/locker')>()),
  disableNavigationLock: vi.fn(),
  enableNavigationLock: vi.fn(),
  isLockEnabled: vi.fn(() => true),
  setUIHidden: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isLockEnabled).mockReset();
  vi.mocked(isLockEnabled).mockReturnValue(true);
});

function createScreenshotParams(): ScreenshotControllerParams {
  const quickActionOverlayRef = {
    current: {
      afterCapture: 'copy',
      exitAfterCapture: true,
      imageFormat: 'png',
      imageQuality: 90,
    } satisfies QuickActionOverlay,
  };
  const setQuickActionOverlay = vi.fn((overlay) => {
    quickActionOverlayRef.current = overlay;
  });

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
    quickActionOverlayRef,
    setCaptureAction: vi.fn(),
    setIsCompletelyHidden: vi.fn(),
    setIsToolbarVisible: vi.fn(),
    setNavigationLockEnabled: vi.fn(),
    setQuickActionOverlay,
    setScreenshotMode: vi.fn(),
    setTimerDelay: vi.fn(),
    timerDelay: 3,
  };
}

function createScreenshotRuntime(): ScreenshotControllerRuntime {
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

function expectQuickActionCancelTearsDownWithoutRelock() {
  const params = createScreenshotParams();
  const runtime = createScreenshotRuntime();
  const countdownLockSessionRef = {
    current: {
      navigationLockEnabledBeforeCountdown: true,
    },
  } as { current: CountdownLockSession | null };

  cancelQuickActionCountdown(params, runtime, countdownLockSessionRef);

  expect(enableNavigationLock).toHaveBeenCalledWith(false);
  expect(countdownLockSessionRef.current).toBeNull();
  expect(params.quickActionOverlayRef.current).toBeNull();
  expect(params.setScreenshotMode).toHaveBeenCalledWith(false);
  expect(params.setTimerDelay).toHaveBeenCalledWith(0);
  expect(setUIHidden).toHaveBeenCalledWith(false);
  expect(runtime.setNavigationLockEnabled).toHaveBeenCalledWith(true);
  expect(params.setIsToolbarVisible).toHaveBeenCalledWith(false);
}

function expectQuickActionSyncRoutesAfterCapture() {
  const params = createScreenshotParams();

  syncCaptureAction(params);

  expect(params.setCaptureAction).toHaveBeenCalledWith('copy');
}

function expectPrepareScreenshotModeDisablesEditingModes() {
  const params = {
    ...createScreenshotParams(),
    editingModes: {
      ...createScreenshotParams().editingModes,
      aiPickMode: true,
      highlighterMode: true,
      quickEditMode: true,
    },
  };
  const navigationLockStateBeforeScreenshot = { current: false };
  vi.mocked(isLockEnabled).mockReturnValueOnce(false);

  prepareScreenshotMode(params, navigationLockStateBeforeScreenshot);

  expect(navigationLockStateBeforeScreenshot.current).toBe(false);
  expect(params.editingModes.disableQuickEditMode).toHaveBeenCalledOnce();
  expect(params.editingModes.setQuickEditMode).toHaveBeenCalledWith(false);
  expect(params.editingModes.disableHighlighterMode).toHaveBeenCalledOnce();
  expect(params.editingModes.setHighlighterMode).toHaveBeenCalledWith(false);
  expect(params.editingModes.disableAiPickMode).toHaveBeenCalledOnce();
  expect(params.editingModes.setAiPickMode).toHaveBeenCalledWith(false);
  expect(params.setNavigationLockEnabled).toHaveBeenCalledWith(false);
}

function expectPrepareScreenshotModeCapturesUserLockBaseline() {
  const params = createScreenshotParams();
  const navigationLockStateBeforeScreenshot = { current: false };
  vi.mocked(isLockEnabled).mockReturnValueOnce(true).mockReturnValueOnce(true);

  prepareScreenshotMode(params, navigationLockStateBeforeScreenshot);

  expect(navigationLockStateBeforeScreenshot.current).toBe(true);
  expect(params.editingModes.disableHighlighterMode).not.toHaveBeenCalled();
  expect(params.editingModes.disableAiPickMode).not.toHaveBeenCalled();
  expect(params.setNavigationLockEnabled).toHaveBeenCalledWith(true);
}

function expectPrepareScreenshotModeUsesAutoStartBaseline() {
  const params = createScreenshotParams();
  const navigationLockStateBeforeScreenshot = { current: true };
  vi.mocked(isLockEnabled).mockReturnValueOnce(true);

  prepareScreenshotMode(params, navigationLockStateBeforeScreenshot, {
    navigationLockBaseline: false,
  });

  expect(navigationLockStateBeforeScreenshot.current).toBe(false);
  expect(params.setNavigationLockEnabled).toHaveBeenCalledWith(true);
}

function expectQuickActionCloseRestoresUnlockedBaseline() {
  const params = createScreenshotParams();
  const runtime = createScreenshotRuntime();
  runtime.navigationLockStateBeforeScreenshot.current = false;

  closeQuickActionCapture(params, runtime, 1);

  expect(disableNavigationLock).toHaveBeenCalledOnce();
  expect(enableNavigationLock).not.toHaveBeenCalled();
  expect(runtime.setNavigationLockEnabled).toHaveBeenCalledWith(false);
  expect(params.quickActionOverlayRef.current).toBeNull();
}

function expectQuickActionCloseRestoresPreLockedBaseline() {
  const params = createScreenshotParams();
  const runtime = createScreenshotRuntime();
  runtime.navigationLockStateBeforeScreenshot.current = true;

  closeQuickActionCapture(params, runtime, 1);

  expect(enableNavigationLock).toHaveBeenCalledWith(false);
  expect(disableNavigationLock).not.toHaveBeenCalled();
  expect(runtime.setNavigationLockEnabled).toHaveBeenCalledWith(true);
}

function expectStaleQuickActionCloseDoesNotRestoreLock() {
  const params = createScreenshotParams();
  const runtime = createScreenshotRuntime();
  runtime.screenshotRunGenerationRef.current = 2;

  closeQuickActionCapture(params, runtime, 1);

  expect(disableNavigationLock).not.toHaveBeenCalled();
  expect(enableNavigationLock).not.toHaveBeenCalled();
  expect(runtime.setNavigationLockEnabled).not.toHaveBeenCalled();
  expect(params.quickActionOverlayRef.current).not.toBeNull();
}

describe('screenshot-controller-mode', () => {
  it(
    'tears down quick-action countdown without re-locking navigation',
    expectQuickActionCancelTearsDownWithoutRelock
  );
  it(
    'routes quick-action after-capture changes through the shared capture-action setter',
    expectQuickActionSyncRoutesAfterCapture
  );
  it(
    'prepares screenshot mode by disabling editing owners without restoring their lock',
    expectPrepareScreenshotModeDisablesEditingModes
  );
  it(
    'captures a user-owned navigation lock baseline when no editing mode owns it',
    expectPrepareScreenshotModeCapturesUserLockBaseline
  );
  it(
    'uses the auto-start navigation baseline instead of the temporary capture lock',
    expectPrepareScreenshotModeUsesAutoStartBaseline
  );
  it(
    'restores an unlocked baseline after quick-action capture exit',
    expectQuickActionCloseRestoresUnlockedBaseline
  );
  it(
    'restores a pre-locked baseline after quick-action capture exit',
    expectQuickActionCloseRestoresPreLockedBaseline
  );
  it('ignores stale quick-action close attempts', expectStaleQuickActionCloseDoesNotRestoreLock);
});
