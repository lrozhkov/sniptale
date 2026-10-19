import type { ContentPrivilegedActionIntentSource } from '../../application/privileged-action-intent';
import type { MutableRefObject } from 'react';

import type { CaptureActionType, QuickActionOverlay } from '../../../contracts/settings';
import { isLockEnabled, setUIHidden } from '../../selection/locker';
import { restoreNavigationLockState } from './countdown/controller';
import type { ScreenshotControllerScenarioBridge } from './scenario';
import type {
  ScreenshotCaptureAdapter,
  ScreenshotControllerCapturePersistenceBridge,
  ScreenshotControllerRuntime,
  ScreenshotEditingMode,
  ScreenshotStartContext,
  ScreenshotType,
} from './types';
import type { ScreenshotControllerSession } from './session/state';
import { getContentRuntimeServices } from '../../application/runtime-services/services';
import { createLogger } from '@sniptale/platform/observability/logger';
import {
  createDisableScreenshotModeRequest,
  createScreenshotSurfaceStatusBindingUpdater,
} from '../viewport-selector/capability';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';

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
  designReviewMode: boolean;
  drawingMode?: boolean;
  disableAiPickMode: () => void;
  disableDesignReviewMode: () => void;
  disableDrawingMode?: () => void;
  disableHighlighterMode: () => void;
  disableQuickEditMode: () => void;
  highlighterMode: boolean;
  quickEditMode: boolean;
  quickEditDocumentMode?: boolean;
  restoreEditingMode: (mode: ScreenshotEditingMode) => void;
  setAiPickMode: (enabled: boolean) => void;
  setDesignReviewMode: (enabled: boolean) => void;
  setDrawingMode?: (enabled: boolean) => void;
  setHighlighterMode: (enabled: boolean) => void;
  setQuickEditMode: (enabled: boolean) => void;
};

export interface ScreenshotControllerParams {
  prepareWindowSize?: (
    intent?: ContentPrivilegedActionIntentSource
  ) => Promise<() => Promise<void>>;
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
  setCurrentViewport?: (viewport: { width: number; height: number } | null) => void;
  timerDelay: number;
}

function disableEditingModes(params: ScreenshotControllerParams): void {
  const { editingModes } = params;
  editingModes.disableQuickEditMode();
  editingModes.setQuickEditMode(false);

  if (editingModes.drawingMode) {
    editingModes.disableDrawingMode?.();
    editingModes.setDrawingMode?.(false);
  }

  if (editingModes.designReviewMode) {
    editingModes.disableDesignReviewMode();
    editingModes.setDesignReviewMode(false);
  }

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
  return (
    editingModes.aiPickMode ||
    editingModes.designReviewMode ||
    editingModes.drawingMode ||
    editingModes.highlighterMode ||
    editingModes.quickEditMode
  );
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

export async function closeQuickActionCapture(
  params: ScreenshotControllerParams,
  runtime: ScreenshotControllerRuntime,
  runToken?: number
): Promise<void> {
  if (!isCurrentScreenshotRun(runtime, runToken)) {
    return;
  }

  const navigationLockEnabledBeforeScreenshot = runtime.session.navigationLockBaseline;

  if (runtime.session.preparationBaseline) {
    await restoreBorrowedPreparation(params, runtime, runToken);
    return;
  }

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
    const response = await getContentRuntimeServices().messaging.sendRuntimeMessage(
      createDisableScreenshotModeRequest()
    );
    if (response?.success === false || response?.error) {
      throw new Error(response.error || 'Screenshot surface cleanup failed');
    }
  } catch (error) {
    logger.error('Failed to release quick-action screenshot surface', error);
    throw error;
  }
}

async function refreshScreenshotSurfaceStatus(
  params: ScreenshotControllerParams,
  runtime: ScreenshotControllerRuntime,
  runToken: number | undefined
): Promise<void> {
  const updateBinding = createScreenshotSurfaceStatusBindingUpdater();
  const response = await getContentRuntimeServices().messaging.sendRuntimeMessage({
    type: MessageType.SCREENSHOT_MODE_STATUS,
  });
  assertCurrentScreenshotRun(runtime, runToken);
  if (!response?.success || !response.enabled || !response.surfaceCapabilityToken) {
    throw new Error('Screenshot surface status is unavailable');
  }
  if (
    !updateBinding({
      token: response.surfaceCapabilityToken,
      ...(response.surfaceLeaseGeneration === undefined
        ? {}
        : { leaseGeneration: response.surfaceLeaseGeneration }),
      ...(response.surfaceOperationGeneration === undefined
        ? {}
        : { operationGeneration: response.surfaceOperationGeneration }),
    })
  ) {
    throw new StaleScreenshotRunError();
  }
  params.setCurrentViewport?.(response.viewport ?? null);
}

async function restoreBorrowedPreparation(
  params: ScreenshotControllerParams,
  runtime: ScreenshotControllerRuntime,
  runToken: number | undefined
): Promise<void> {
  const baseline = runtime.session.preparationBaseline;
  const transactionId = params.quickActionOverlayRef.current?.transactionId;
  if (!baseline) return;
  let released = false;
  try {
    if (!transactionId) throw new Error('Screenshot transaction is unavailable');
    const response = await getContentRuntimeServices().messaging.sendRuntimeMessage({
      ...createDisableScreenshotModeRequest(),
      quickActionTransactionId: transactionId,
    });
    assertCurrentScreenshotRun(runtime, runToken);
    if (response?.success === false || response?.error)
      throw new Error(response.error || 'Screenshot surface cleanup failed');
    released = true;
    runtime.session.preparationBaseline = null;
    await refreshScreenshotSurfaceStatus(params, runtime, runToken);
  } finally {
    if (isCurrentScreenshotRun(runtime, runToken)) {
      if (released) clearQuickActionOverlay(params);
      params.setCaptureAction(baseline.captureAction);
      params.setTimerDelay(baseline.timerDelay);
      params.setScreenshotMode(true);
      setUIHidden(false);
      runtime.setIsCompletelyHidden(false);
      params.setIsToolbarVisible(baseline.isToolbarVisible);
      const suspendedEditingMode = runtime.session.editingModeBaseline;
      runtime.session.editingModeBaseline = null;
      if (suspendedEditingMode && baseline.editingMode)
        runtime.restoreEditingMode(baseline.editingMode);
      restoreNavigationLockState(baseline.navigationLockEnabled, runtime.setNavigationLockEnabled);
    }
  }
}

export function cancelQuickActionCountdown(
  params: ScreenshotControllerParams,
  runtime: ScreenshotControllerRuntime,
  session: Pick<ScreenshotControllerSession, 'countdownLock'>
): void {
  session.countdownLock = null;
  void closeQuickActionCapture(params, runtime, runtime.session.runGeneration).catch((error) => {
    logger.error('Failed to close cancelled quick-action capture', error);
  });
}

export function prepareScreenshotMode(
  params: ScreenshotControllerParams,
  session: Pick<
    ScreenshotControllerSession,
    'editingModeBaseline' | 'navigationLockBaseline' | 'preparationBaseline'
  >,
  type: ScreenshotType,
  startContext: ScreenshotStartContext = {}
): void {
  session.preparationBaseline =
    startContext.preparationBaseline ?? session.preparationBaseline ?? null;
  if (session.preparationBaseline && !startContext.preparationBaseline) {
    session.preparationBaseline = {
      ...session.preparationBaseline,
      editingMode: resolveEditingModeBaseline(params.editingModes),
      navigationLockEnabled: params.navigationLockEnabled,
    };
  }
  session.editingModeBaseline =
    type === 'selection'
      ? (session.preparationBaseline?.editingMode ??
        resolveEditingModeBaseline(params.editingModes))
      : null;
  session.navigationLockBaseline =
    session.preparationBaseline?.navigationLockEnabled ??
    resolveNavigationLockBaseline(params, startContext);
  if (!session.preparationBaseline || type === 'selection') disableEditingModes(params);
  params.setNavigationLockEnabled(isLockEnabled());
}

function resolveEditingModeBaseline(
  editingModes: ScreenshotEditingModeControls
): ScreenshotEditingMode | null {
  if (editingModes.aiPickMode) return 'ai-pick';
  if (editingModes.designReviewMode) return 'design-review';
  if (editingModes.drawingMode) return 'drawing';
  if (editingModes.highlighterMode) return 'highlighter';
  if (editingModes.quickEditDocumentMode) return 'quick-edit-document';
  if (editingModes.quickEditMode) return 'quick-edit';
  return null;
}

export function restoreScreenshotEditingMode(
  mode: ScreenshotEditingMode,
  actions: Record<ScreenshotEditingMode, () => void>
): void {
  actions[mode]();
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
