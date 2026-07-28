import type { MutableRefObject } from 'react';

import type { CaptureActionType, QuickActionOverlay } from '../../../contracts/settings';
import { isLockEnabled, setUIHidden } from '../../selection/locker';
import { restoreNavigationLockState } from './countdown/controller';
import type { ScreenshotControllerScenarioBridge } from './scenario';
import type {
  ScreenshotCaptureAdapter,
  ScreenshotControllerCapturePersistenceBridge,
  ScreenshotControllerRuntime,
  ScreenshotStartContext,
} from './types';
import type { ScreenshotControllerSession } from './session/state';
import { getContentRuntimeServices } from '../../application/runtime-services/services';
import { createLogger } from '@sniptale/platform/observability/logger';
import { createDisableScreenshotModeRequest } from '../viewport-selector/capability';

const STALE_SCREENSHOT_RUN_ERROR_NAME = 'StaleScreenshotRunError';
const logger = createLogger({ namespace: 'ContentScreenshotMode' });

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

  const navigationLockEnabledBeforeScreenshot = runtime.session.navigationLockBaseline;

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
  try {
    void getContentRuntimeServices().messaging.sendRuntimeMessage(
      createDisableScreenshotModeRequest()
    );
  } catch (error) {
    logger.error('Screenshot surface binding is unavailable during quick-action cleanup', error);
  }
}

export function cancelQuickActionCountdown(
  params: ScreenshotControllerParams,
  runtime: ScreenshotControllerRuntime,
  session: Pick<ScreenshotControllerSession, 'countdownLock'>
): void {
  session.countdownLock = null;
  closeQuickActionCapture(params, runtime);
}

export function prepareScreenshotMode(
  params: ScreenshotControllerParams,
  session: Pick<ScreenshotControllerSession, 'navigationLockBaseline'>,
  startContext: ScreenshotStartContext = {}
): void {
  session.navigationLockBaseline = resolveNavigationLockBaseline(params, startContext);
  disableEditingModes(params);
  params.setNavigationLockEnabled(isLockEnabled());
}

function clearQuickActionOverlay(
  params: Pick<ScreenshotControllerParams, 'setQuickActionOverlay'>
): void {
  params.setQuickActionOverlay(null);
}

export function beginScreenshotRun(runtime: ScreenshotControllerRuntime): number {
  runtime.session.runGeneration += 1;
  runtime.session.runActive = true;
  return runtime.session.runGeneration;
}

export function completeScreenshotRun(
  runtime: ScreenshotControllerRuntime,
  runToken: number | undefined
): void {
  if (isCurrentScreenshotRun(runtime, runToken)) {
    runtime.session.runActive = false;
  }
}

export function isCurrentScreenshotRun(
  runtime: Pick<ScreenshotControllerRuntime, 'session'>,
  runToken: number | undefined
): boolean {
  return runToken === undefined || runtime.session.runGeneration === runToken;
}

export function assertCurrentScreenshotRun(
  runtime: Pick<ScreenshotControllerRuntime, 'session'>,
  runToken: number | undefined
): void {
  if (!isCurrentScreenshotRun(runtime, runToken)) {
    throw new StaleScreenshotRunError();
  }
}

export function isStaleScreenshotRunError(error: unknown): boolean {
  return error instanceof Error && error.name === STALE_SCREENSHOT_RUN_ERROR_NAME;
}
