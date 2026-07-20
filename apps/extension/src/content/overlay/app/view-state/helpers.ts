import { disableHighlighterMode } from '../../../selection/highlighter';
import { disableQuickEditMode } from '../../../selection/quick-edit';
import type { ContentPrivilegedActionIntentSource } from '../../../application/privileged-action-intent';
import type { DiagnosticLoggerController } from '../../../application/diagnostics/runtime';
import type { ScreenshotStartContext } from '../../screenshot/types';
import type {
  ContentAppModeState,
  ContentAppModeFlags,
  ContentAppQuickActionState,
  ContentAppRuntimeModeControls,
  ContentAppVisibilityState,
  ContentAppViewportState,
} from '../mode';
type ContentAppModeStateValue = ContentAppModeState;

type ContentRuntimeQuickActionState = ContentAppQuickActionState;

export type ContentRuntimeBridgeParams = {
  handleTakeScreenshot: (
    type: 'visible' | 'full' | 'selection',
    contentIntentSource?: ContentPrivilegedActionIntentSource,
    startContext?: ScreenshotStartContext
  ) => Promise<void>;
  invalidateScreenshotRuns: () => ScreenshotStartContext | undefined;
  modeControls: ReturnType<typeof buildContentModeControls>;
  modeFlags: ContentAppModeFlags;
  quickActionState: ContentRuntimeQuickActionState;
  visibilityState: ReturnType<typeof buildContentVisibilityState>;
  viewportState: ContentAppViewportState;
};

export function buildContentModeFlags(modeState: ContentAppModeStateValue): ContentAppModeFlags {
  return {
    aiPickMode: modeState.aiPickMode,
    highlighterMode: modeState.highlighterMode,
    quickEditDocumentMode: modeState.quickEditDocumentMode,
    quickEditMode: modeState.quickEditMode,
    screenshotMode: modeState.screenshotMode,
  };
}

export function buildContentModeControls(
  modeState: ContentAppModeStateValue
): ContentAppRuntimeModeControls {
  return {
    setAiPickMode: modeState.setAiPickMode,
    setHighlighterMode: modeState.setHighlighterMode,
    setQuickEditDocumentMode: modeState.setQuickEditDocumentMode,
    setIsToolbarVisible: modeState.setIsToolbarVisible,
    setNavigationLockEnabled: modeState.setNavigationLockEnabled,
    setQuickEditMode: modeState.setQuickEditMode,
    setScreenshotMode: modeState.setScreenshotMode,
  };
}

export function buildContentVisibilityState(
  modeState: ContentAppModeStateValue
): Pick<
  ContentAppVisibilityState,
  | 'isCompletelyHidden'
  | 'isToolbarVisible'
  | 'navigationLockEnabled'
  | 'clearPendingAutoStartCapture'
  | 'pendingAutoStartCapture'
  | 'queueAutoStartCapture'
  | 'saveDialogState'
  | 'setIsCompletelyHidden'
  | 'setSaveDialogState'
> {
  return {
    clearPendingAutoStartCapture: modeState.clearPendingAutoStartCapture,
    isCompletelyHidden: modeState.isCompletelyHidden,
    isToolbarVisible: modeState.isToolbarVisible,
    navigationLockEnabled: modeState.navigationLockEnabled,
    pendingAutoStartCapture: modeState.pendingAutoStartCapture,
    queueAutoStartCapture: modeState.queueAutoStartCapture,
    saveDialogState: modeState.saveDialogState,
    setIsCompletelyHidden: modeState.setIsCompletelyHidden,
    setSaveDialogState: modeState.setSaveDialogState,
  };
}

export function buildContentQuickActionState(
  modeState: ContentAppModeStateValue
): ContentRuntimeQuickActionState {
  const captureAction = modeState.captureAction as ContentRuntimeQuickActionState['captureAction'];
  const captureActionRef =
    modeState.captureActionRef as ContentRuntimeQuickActionState['captureActionRef'];
  const quickActionOverlayRef =
    modeState.quickActionOverlayRef as ContentRuntimeQuickActionState['quickActionOverlayRef'];

  return {
    captureAction,
    captureActionRef,
    quickActionOverlayRef,
    setCaptureAction: modeState.setCaptureAction,
    setQuickActionOverlay: modeState.setQuickActionOverlay,
    setQuickActionToastCountdown: modeState.setQuickActionToastCountdown,
    setTimerDelay: modeState.setTimerDelay,
    timerDelay: modeState.timerDelay,
  };
}

export function buildContentViewportState(
  modeState: ContentAppModeStateValue
): ContentAppViewportState {
  return {
    currentViewport: modeState.currentViewport,
    setCurrentViewport: modeState.setCurrentViewport,
  };
}

export function buildRuntimeMessageBridgeParams(
  params: ContentRuntimeBridgeParams,
  diagnosticsController: DiagnosticLoggerController | null,
  disableAiPickMode: () => void
) {
  return {
    diagnostics: {
      disableDiagnosticLogger: () => diagnosticsController?.disable(),
      enableDiagnosticLogger: (recordingId: string) => diagnosticsController?.enable(recordingId),
    },
    dialogs: {
      setSaveDialogState: params.visibilityState.setSaveDialogState,
    },
    modeControls: {
      disableAiPickMode,
      disableHighlighterMode,
      disableQuickEditMode,
      setAiPickMode: params.modeControls.setAiPickMode,
      setHighlighterMode: params.modeControls.setHighlighterMode,
      setIsToolbarVisible: params.modeControls.setIsToolbarVisible,
      setNavigationLockEnabled: params.modeControls.setNavigationLockEnabled,
      setQuickEditDocumentMode: params.modeControls.setQuickEditDocumentMode,
      setQuickEditMode: params.modeControls.setQuickEditMode,
      setScreenshotMode: params.modeControls.setScreenshotMode,
    },
    modeState: {
      aiPickMode: params.modeFlags.aiPickMode,
      highlighterMode: params.modeFlags.highlighterMode,
      isToolbarVisible: params.visibilityState.isToolbarVisible,
      quickEditMode: params.modeFlags.quickEditMode,
      screenshotMode: params.modeFlags.screenshotMode,
    },
    quickAction: {
      captureAction: params.quickActionState.captureAction,
      captureActionRef: params.quickActionState.captureActionRef,
      quickActionOverlayRef: params.quickActionState.quickActionOverlayRef,
      setCaptureAction: params.quickActionState.setCaptureAction,
      setQuickActionOverlay: params.quickActionState.setQuickActionOverlay,
      setQuickActionToastCountdown: params.quickActionState.setQuickActionToastCountdown,
      setTimerDelay: params.quickActionState.setTimerDelay,
    },
    viewport: {
      clearPendingAutoStartCapture: params.visibilityState.clearPendingAutoStartCapture,
      handleTakeScreenshot: params.handleTakeScreenshot,
      invalidateScreenshotRuns: params.invalidateScreenshotRuns,
      queueAutoStartCapture: params.visibilityState.queueAutoStartCapture,
      setCurrentViewport: params.viewportState.setCurrentViewport,
    },
  };
}
