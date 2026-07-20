import type { MutableRefObject } from 'react';

import type { CaptureActionType, QuickActionOverlay } from '../../../contracts/settings';
import { isLockEnabled, setUIHidden } from '../../selection/locker';
import type { CountdownLockSession } from './countdown/controller';
import { restoreNavigationLockState } from './countdown/controller';
import type { ScreenshotControllerScenarioBridge } from './scenario';
import type {
  ScreenshotCaptureAdapter,
  ScreenshotControllerCapturePersistenceBridge,
  ScreenshotControllerRuntime,
  ScreenshotStartContext,
} from './types';

const STALE_SCREENSHOT_RUN_ERROR_NAME = 'StaleScreenshotRunError';

export class StaleScreenshotRunError extends Error {
  constructor() {
    super('Screenshot run was superseded.');
    this.name = STALE_SCREENSHOT_RUN_ERROR_NAME;
  }
}

type ScreenshotEditingModeControls = {
  aiPickMode: boolean;
  disableAiPickMode: () => void;
  disableHighlighterMode: () => void;
  disableQuickEditMode: () => void;
  highlighterMode: boolean;
  quickEditMode: boolean;
  setAiPickMode: (enabled: boolean) => void;
  setHighlighterMode: (enabled: boolean) => void;
  setQuickEditMode: (enabled: boolean) => void;
};

export interface ScreenshotControllerParams {
  captureAdapter?: ScreenshotCaptureAdapter;
  capturePersistence: ScreenshotControllerCapturePersistenceBridge;
  captureActionRef: MutableRefObject<CaptureActionType>;
  editingModes: ScreenshotEditingModeControls;
  navigationLockEnabled: boolean;
  quickActionOverlayRef: MutableRefObject<QuickActionOverlay | null>;
  scenario?: ScreenshotControllerScenarioBridge;
  setCaptureAction: (action: CaptureActionType) => void;
  setIsCompletelyHidden: (hidden: boolean) => void;
  setIsToolbarVisible: (visible: boolean) => void;
  setNavigationLockEnabled: (enabled: boolean) => void;
  setQuickActionOverlay: (overlay: QuickActionOverlay | null) => void;
  setScreenshotMode: (enabled: boolean) => void;
  setTimerDelay: (delay: number) => void;
  timerDelay: number;
}

function disableEditingModes(params: ScreenshotControllerParams): void {
  const { editingModes } = params;
  editingModes.disableQuickEditMode();
  editingModes.setQuickEditMode(false);

  if (editingModes.highlighterMode) {
    editingModes.disableHighlighterMode();
    editingModes.setHighlighterMode(false);
  }

  if (editingModes.aiPickMode) {
    editingModes.disableAiPickMode();
    editingModes.setAiPickMode(false);
  }
}

function hasModeOwnedNavigationLock(params: ScreenshotControllerParams): boolean {
  const { editingModes } = params;
  return editingModes.aiPickMode || editingModes.highlighterMode || editingModes.quickEditMode;
}

function resolveNavigationLockBaseline(
  params: ScreenshotControllerParams,
  startContext: ScreenshotStartContext
): boolean {
  if (startContext.navigationLockBaseline !== undefined) {
    return startContext.navigationLockBaseline;
  }

  if (hasModeOwnedNavigationLock(params)) {
    return false;
  }

  return isLockEnabled();
}

export function shouldExitAfterQuickActionCapture(
  quickActionOverlayRef: MutableRefObject<QuickActionOverlay | null>
): boolean {
  return Boolean(quickActionOverlayRef.current?.exitAfterCapture);
}

export function syncCaptureAction(params: ScreenshotControllerParams): void {
  const quickActionOverlay = params.quickActionOverlayRef.current;

  if (quickActionOverlay) {
    params.setCaptureAction(quickActionOverlay.afterCapture);
  }
}

export function closeQuickActionCapture(
  params: ScreenshotControllerParams,
  runtime: ScreenshotControllerRuntime,
  runToken?: number
): void {
  if (!isCurrentScreenshotRun(runtime, runToken)) {
    return;
  }

  const navigationLockEnabledBeforeScreenshot = runtime.navigationLockStateBeforeScreenshot.current;

  clearQuickActionOverlay(params);
  params.setScreenshotMode(false);
  params.setTimerDelay(0);
  setUIHidden(false);
  runtime.setIsCompletelyHidden(false);
  restoreNavigationLockState(
    navigationLockEnabledBeforeScreenshot,
    runtime.setNavigationLockEnabled
  );
  params.setIsToolbarVisible(false);
}

export function cancelQuickActionCountdown(
  params: ScreenshotControllerParams,
  runtime: ScreenshotControllerRuntime,
  countdownLockSessionRef: MutableRefObject<CountdownLockSession | null>
): void {
  countdownLockSessionRef.current = null;
  closeQuickActionCapture(params, runtime);
}

export function prepareScreenshotMode(
  params: ScreenshotControllerParams,
  navigationLockStateBeforeScreenshot: MutableRefObject<boolean>,
  startContext: ScreenshotStartContext = {}
): void {
  navigationLockStateBeforeScreenshot.current = resolveNavigationLockBaseline(params, startContext);
  disableEditingModes(params);
  params.setNavigationLockEnabled(isLockEnabled());
}

function clearQuickActionOverlay(
  params: Pick<ScreenshotControllerParams, 'setQuickActionOverlay'>
): void {
  params.setQuickActionOverlay(null);
}

export function beginScreenshotRun(runtime: ScreenshotControllerRuntime): number {
  runtime.screenshotRunGenerationRef.current += 1;
  runtime.screenshotRunActiveRef.current = true;
  return runtime.screenshotRunGenerationRef.current;
}

export function completeScreenshotRun(
  runtime: ScreenshotControllerRuntime,
  runToken: number | undefined
): void {
  if (isCurrentScreenshotRun(runtime, runToken)) {
    runtime.screenshotRunActiveRef.current = false;
  }
}

export function isCurrentScreenshotRun(
  runtime: Pick<ScreenshotControllerRuntime, 'screenshotRunGenerationRef'>,
  runToken: number | undefined
): boolean {
  return runToken === undefined || runtime.screenshotRunGenerationRef.current === runToken;
}

export function assertCurrentScreenshotRun(
  runtime: Pick<ScreenshotControllerRuntime, 'screenshotRunGenerationRef'>,
  runToken: number | undefined
): void {
  if (!isCurrentScreenshotRun(runtime, runToken)) {
    throw new StaleScreenshotRunError();
  }
}

export function isStaleScreenshotRunError(error: unknown): boolean {
  return error instanceof Error && error.name === STALE_SCREENSHOT_RUN_ERROR_NAME;
}
