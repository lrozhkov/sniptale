import { useEffect, useRef } from 'react';
import { disableAiPickModeIfLoaded } from '../../ai/pick/runtime/lazy';
import { disableHighlighterMode } from '../../../selection/highlighter';
import { disableQuickEditDocumentMode, disableQuickEditMode } from '../../../selection/quick-edit';
import { disableDesignReviewMode } from '../../../selection/design-review';
import type { ContentAppModeState } from '../mode';
import { useAiPickController } from '../../ai/pick/controller';
import type { ContentCoreControllers } from '../view-state/types';
import { useContentScreenshotAutoStart } from '../../screenshot/auto-start';
import { useScenarioController } from '../../scenario/controller';
import type { ScreenshotControllerParams } from '../../screenshot/bridge';
import { restoreScreenshotEditingMode } from '../../screenshot/mode';
import type { ScreenshotEditingMode } from '../../screenshot/types';
import { useScreenshotController } from '../../screenshot/controller';
import { useToolbarModeController } from '../../toolbar/mode-controller';
import {
  useContentDrawingController,
  type ContentDrawingController,
} from '../../../drawing/controller';
import { useDrawingModeIntegration } from '../../../drawing/mode';
import { useVideoRecordingSurfaceController } from '../../video-recording/session/controller';

function disableAiPickModeDeferred() {
  disableAiPickModeIfLoaded();
}

type ContentAppModeStateValue = ContentAppModeState;

interface ContentAppControllerDependencies {
  preloadAIModal: () => Promise<void>;
}

function useContentScenarioController(modeState: ContentAppModeStateValue) {
  return useScenarioController({
    autoClickBlocked:
      modeState.aiPickMode ||
      modeState.designReviewMode ||
      modeState.drawingMode ||
      modeState.highlighterMode ||
      modeState.quickEditMode,
    captureActionRef: modeState.captureActionRef,
    navigationLockEnabled: modeState.navigationLockEnabled,
    screenshotMode: modeState.screenshotMode,
    setCaptureAction: modeState.setCaptureAction,
    setIsCompletelyHidden: modeState.setIsCompletelyHidden,
    setIsToolbarVisible: modeState.setIsToolbarVisible,
    setNavigationLockEnabled: modeState.setNavigationLockEnabled,
    setScreenshotMode: modeState.setScreenshotMode,
  });
}

function useContentAiController(
  modeState: ContentAppModeStateValue,
  dependencies: ContentAppControllerDependencies
) {
  return useAiPickController({
    aiPickMode: modeState.aiPickMode,
    preloadAIModal: dependencies.preloadAIModal,
    setAiPickMode: modeState.setAiPickMode,
    setHighlighterMode: modeState.setHighlighterMode,
    setQuickEditDocumentMode: modeState.setQuickEditDocumentMode,
    setQuickEditMode: modeState.setQuickEditMode,
  });
}

function useContentToolbarModeController(modeState: ContentAppModeStateValue) {
  return useToolbarModeController({
    aiPickMode: modeState.aiPickMode,
    designReviewMode: modeState.designReviewMode,
    disableAiPickMode: disableAiPickModeDeferred,
    highlighterMode: modeState.highlighterMode,
    quickEditMode: modeState.quickEditMode,
    setAiPickMode: modeState.setAiPickMode,
    setDesignReviewMode: modeState.setDesignReviewMode,
    setHighlighterMode: modeState.setHighlighterMode,
    setIsToolbarVisible: modeState.setIsToolbarVisible,
    setNavigationLockEnabled: modeState.setNavigationLockEnabled,
    setQuickEditDocumentMode: modeState.setQuickEditDocumentMode,
    setQuickEditMode: modeState.setQuickEditMode,
    setScreenshotMode: modeState.setScreenshotMode,
  });
}

function useContentScreenshotController(
  modeState: ContentAppModeStateValue,
  scenarioController: ReturnType<typeof useScenarioController>,
  drawingController: ContentDrawingController,
  restoreEditingMode: (mode: ScreenshotEditingMode) => void
) {
  const captureActionRef =
    modeState.captureActionRef as ScreenshotControllerParams['captureActionRef'];
  const quickActionOverlayRef =
    modeState.quickActionOverlayRef as ScreenshotControllerParams['quickActionOverlayRef'];

  return useScreenshotController({
    captureActionRef,
    editingModes: {
      aiPickMode: modeState.aiPickMode,
      designReviewMode: modeState.designReviewMode,
      ...(modeState.drawingMode === undefined ? {} : { drawingMode: modeState.drawingMode }),
      disableDrawingMode: () => {
        drawingController.finalizeInteraction();
        modeState.setDrawingMode?.(false);
      },
      disableAiPickMode: disableAiPickModeDeferred,
      disableDesignReviewMode,
      disableHighlighterMode,
      disableQuickEditMode: () => {
        disableQuickEditDocumentMode();
        disableQuickEditMode();
        modeState.setQuickEditDocumentMode(false);
      },
      highlighterMode: modeState.highlighterMode,
      quickEditMode: modeState.quickEditMode,
      restoreEditingMode,
      setAiPickMode: modeState.setAiPickMode,
      setDesignReviewMode: modeState.setDesignReviewMode,
      ...(modeState.setDrawingMode === undefined
        ? {}
        : { setDrawingMode: modeState.setDrawingMode }),
      setHighlighterMode: modeState.setHighlighterMode,
      setQuickEditMode: modeState.setQuickEditMode,
    },
    navigationLockEnabled: modeState.navigationLockEnabled,
    quickActionOverlayRef,
    timerDelay: modeState.timerDelay,
    capturePersistence: {
      sessionActivePresetId: modeState.sessionActivePresetId,
      setSaveDialogState: modeState.setSaveDialogState,
    },
    scenario: {
      buildCapturePayload: scenarioController.buildManualCapturePayload,
      refreshSession: scenarioController.refreshSession,
      saveSelectionCapture: scenarioController.saveSelectionCapture,
    },
    setCaptureAction: modeState.setCaptureAction,
    setIsCompletelyHidden: modeState.setIsCompletelyHidden,
    setIsToolbarVisible: modeState.setIsToolbarVisible,
    setNavigationLockEnabled: modeState.setNavigationLockEnabled,
    setQuickActionOverlay: modeState.setQuickActionOverlay,
    setScreenshotMode: modeState.setScreenshotMode,
    setTimerDelay: modeState.setTimerDelay,
  });
}

function useContentScreenshotAutoStartEffect(
  modeState: ContentAppModeStateValue,
  screenshotController: ReturnType<typeof useScreenshotController>
) {
  useContentScreenshotAutoStart({
    clearPendingAutoStartCapture: modeState.clearPendingAutoStartCapture,
    handleTakeScreenshot: screenshotController.handleTakeScreenshot,
    pendingAutoStartCapture: modeState.pendingAutoStartCapture,
    screenshotMode: modeState.screenshotMode,
  });
}

function hasConflictingNonVideoMode(modeState: ContentAppModeStateValue): boolean {
  return Boolean(
    modeState.aiPickMode ||
    modeState.designReviewMode ||
    modeState.drawingMode ||
    modeState.highlighterMode ||
    modeState.quickEditMode
  );
}

function useVideoRecordingModeConflictRecovery(args: {
  disableDrawing: () => void;
  modeController: ReturnType<typeof useToolbarModeController>;
  modeState: ContentAppModeStateValue;
  videoRecordingController: ReturnType<typeof useVideoRecordingSurfaceController>;
}) {
  const { disableDrawing, modeController, modeState, videoRecordingController } = args;
  const recoveryPendingRef = useRef(false);
  useEffect(() => {
    if (!modeState.videoRecordingMode || !hasConflictingNonVideoMode(modeState)) {
      recoveryPendingRef.current = false;
      return;
    }
    if (
      videoRecordingController.state.phase === 'idle' ||
      videoRecordingController.state.phase === 'error'
    ) {
      if (recoveryPendingRef.current) return;
      recoveryPendingRef.current = true;
      void videoRecordingController
        .onDeactivate()
        .catch(() => undefined)
        .finally(() => {
          recoveryPendingRef.current = false;
        });
      return;
    }
    disableDrawing();
    modeController.handleToggleDesignReviewMode(false);
    modeController.handleToggleHighlighterMode(false);
    modeController.handleToggleQuickEditMode(false);
    modeState.setAiPickMode(false);
  }, [disableDrawing, modeController, modeState, videoRecordingController]);
}

export function useContentAppControllers(
  modeState: ContentAppModeStateValue,
  dependencies: ContentAppControllerDependencies
): ContentCoreControllers {
  const drawingController = useContentDrawingController();
  const scenarioController = useContentScenarioController(modeState);
  const baseAiController = useContentAiController(modeState, dependencies);
  const baseModeController = useContentToolbarModeController(modeState);
  const { disableDrawing, modeController } = useDrawingModeIntegration({
    baseModeController,
    controller: drawingController,
    modeState,
  });
  const aiController = {
    ...baseAiController,
    handleAiPickContentStart: (
      ...args: Parameters<typeof baseAiController.handleAiPickContentStart>
    ) => {
      disableDrawing();
      return baseAiController.handleAiPickContentStart(...args);
    },
  };
  const screenshotController = useContentScreenshotController(
    modeState,
    scenarioController,
    drawingController,
    (mode) =>
      restoreScreenshotEditingMode(mode, {
        'ai-pick': aiController.handleEnableAiPickMode,
        'design-review': () => modeController.handleToggleDesignReviewMode(true),
        drawing: () => {
          if (!drawingController.prepareActivation()) return;
          modeState.setDrawingMode?.(true);
          modeState.setNavigationLockEnabled(false);
        },
        highlighter: () => modeController.handleToggleHighlighterMode(true),
        'quick-edit': () => modeController.handleToggleQuickEditMode(true),
      })
  );
  const videoRecordingController = useVideoRecordingSurfaceController({
    onModeRequested: (enabled) => modeState.setVideoRecordingMode?.(enabled),
    onToolbarRequested: () => modeState.setIsToolbarVisible(true),
  });
  useVideoRecordingModeConflictRecovery({
    disableDrawing,
    modeController,
    modeState,
    videoRecordingController,
  });
  useContentScreenshotAutoStartEffect(modeState, screenshotController);

  return {
    aiController,
    drawingController,
    modeController,
    scenarioController,
    screenshotController,
    videoRecordingController,
  };
}
