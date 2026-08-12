import { useCallback, useEffect, useMemo } from 'react';
import { useAiPickController } from '../../../content/overlay/ai/pick/controller';
import { preloadAIModal } from '../../../content/overlay/ai/modal/shell/lazy';
import { disableAiPickModeIfLoaded } from '../../../content/overlay/ai/pick/runtime/lazy';
import { useAutoBlurController } from '../../../content/overlay/auto-blur/controller';
import { ContentAppLayout } from '../../../content/overlay/app-layout';
import { useContentAppBindings } from '../../../content/overlay/app/bindings';
import { useContentModeFlags } from '../../../content/overlay/app/content-mode/state/flags';
import { useContentSurfaceState } from '../../../content/overlay/app/content-mode/state/surface';
import type { ContentAppModeState } from '../../../content/overlay/app/mode';
import {
  buildContentModeControls,
  buildContentModeFlags,
  buildContentVisibilityState,
} from '../../../content/overlay/app/view-state/helpers';
import { useScenarioController } from '../../../content/overlay/scenario/controller';
import { useContentScreenshotAutoStart } from '../../../content/overlay/screenshot/auto-start';
import { useScreenshotController } from '../../../content/overlay/screenshot/controller';
import { useToolbarModeController } from '../../../content/overlay/toolbar/mode-controller';
import {
  useContentDrawingController,
  type ContentDrawingController,
} from '../../../content/drawing/controller';
import { useDrawingModeIntegration } from '../../../content/drawing/mode';
import { useVideoRecordingSurfaceController } from '../../../content/overlay/video-recording/session/controller';
import {
  disableHighlighterMode,
  registerFrameCallbacks,
} from '../../../content/selection/highlighter';
import type { useFrameManager } from '../../../content/selection/frame-runtime/react/useFrameManager';
import { InteractiveFrame } from '../../../content/selection/interactive-frame';
import { disableQuickEditMode } from '../../../content/selection/quick-edit';
import { disableDesignReviewMode } from '../../../content/selection/design-review';
import {
  createPreparationLayoutProjection,
  type PreparationSurfaceControllers,
} from './layout-props';
import { usePreparationSurfacePortSync } from './port-sync';
import type {
  PreparationFrameSource,
  PreparationHostPorts,
  PreparationSurfaceProps,
} from './types';

export type {
  PreparationAiPickSourceAdapter,
  PreparationFrameSource,
  PreparationHostPorts,
  PreparationPageSnapshotSource,
  PreparationPopupSendResponse,
  PreparationSurfaceProps,
  ScreenshotCaptureAdapter,
} from './types';
export {
  createPreparationPopupExportController,
  handlePreparationPopupExportRequest,
} from './popup-export';
export { createPreparationScenarioAutoClickCaptureTransport } from './scenario-capture';
export { createPreparationSurfaceStyles } from './styles';

type FrameManager = ReturnType<typeof useFrameManager>;

function usePreparationFrameCallbacks(
  acceptsElement: (element: HTMLElement) => boolean,
  frameManager: FrameManager
): void {
  const addFrame = useCallback(
    (element: HTMLElement) => {
      if (acceptsElement(element)) {
        frameManager.addFrame(element);
      }
    },
    [acceptsElement, frameManager]
  );
  const hasFrameForElement = useCallback(
    (element: HTMLElement) => {
      if (!acceptsElement(element)) {
        return true;
      }

      return frameManager.hasFrameForElement(element);
    },
    [acceptsElement, frameManager]
  );
  const addFreeFrame = useCallback(
    (
      input: import('../../../features/highlighter/contracts').FreeFrameInput,
      sourceElement: HTMLElement
    ) => {
      if (acceptsElement(sourceElement)) {
        frameManager.addFreeFrame(input);
      }
    },
    [acceptsElement, frameManager]
  );

  useEffect(() => {
    registerFrameCallbacks(
      addFrame,
      addFreeFrame,
      frameManager.removeFrame,
      frameManager.clearFrames,
      hasFrameForElement
    );
  }, [
    addFrame,
    addFreeFrame,
    frameManager.clearFrames,
    frameManager.removeFrame,
    hasFrameForElement,
  ]);
}

function usePreparationFrameManager(modeState: ContentAppModeState): FrameManager {
  return useContentAppBindings({
    countdownActive: false,
    InteractiveFrameComponent: InteractiveFrame,
    modeControls: buildContentModeControls(modeState),
    modeFlags: buildContentModeFlags(modeState),
    visibilityState: buildContentVisibilityState(modeState),
  });
}

function usePreparationScreenshotController(
  captureAdapter: ReturnType<PreparationHostPorts['createCaptureAdapter']>,
  modeState: ContentAppModeState,
  aiController: PreparationSurfaceControllers['aiController'],
  scenarioController: PreparationSurfaceControllers['scenarioController'],
  drawingController: ContentDrawingController
): PreparationSurfaceControllers['screenshotController'] {
  return useScreenshotController({
    captureAdapter,
    captureActionRef: modeState.captureActionRef,
    editingModes: {
      aiPickMode: modeState.aiPickMode,
      designReviewMode: modeState.designReviewMode,
      ...(modeState.drawingMode === undefined ? {} : { drawingMode: modeState.drawingMode }),
      disableDrawingMode: () => {
        drawingController.finalizeInteraction();
        modeState.setDrawingMode?.(false);
      },
      disableAiPickMode: aiController.handleDisableAiPickMode,
      disableDesignReviewMode,
      disableHighlighterMode: () => {
        disableHighlighterMode();
        modeState.setHighlighterMode(false);
      },
      disableQuickEditMode: () => {
        disableQuickEditMode();
        modeState.setQuickEditDocumentMode(false);
      },
      highlighterMode: modeState.highlighterMode,
      quickEditMode: modeState.quickEditMode,
      setAiPickMode: modeState.setAiPickMode,
      setDesignReviewMode: modeState.setDesignReviewMode,
      ...(modeState.setDrawingMode === undefined
        ? {}
        : { setDrawingMode: modeState.setDrawingMode }),
      setHighlighterMode: modeState.setHighlighterMode,
      setQuickEditMode: modeState.setQuickEditMode,
    },
    navigationLockEnabled: modeState.navigationLockEnabled,
    quickActionOverlayRef: modeState.quickActionOverlayRef,
    timerDelay: modeState.timerDelay,
    capturePersistence: {
      sessionActivePresetId: modeState.sessionActivePresetId,
      setSaveDialogState: modeState.setSaveDialogState,
    },
    scenario: {
      buildCapturePayload: scenarioController.buildManualCapturePayload,
      ensureCaptureReady: scenarioController.ensureCaptureReady,
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

function usePreparationCaptureAdapter(
  ports: PreparationHostPorts,
  frameManager: FrameManager
): ReturnType<PreparationHostPorts['createCaptureAdapter']> {
  const frameSource = useMemo<PreparationFrameSource>(
    () => ({
      getFrames: () => frameManager.frames,
    }),
    [frameManager]
  );
  return useMemo(() => ports.createCaptureAdapter(frameSource), [frameSource, ports]);
}

function usePreparationAiController(
  modeState: ContentAppModeState,
  ports: PreparationHostPorts
): PreparationSurfaceControllers['aiController'] {
  return useAiPickController({
    aiPickSource: ports.resolveAiPickSource,
    aiPickMode: modeState.aiPickMode,
    preloadAIModal,
    setAiPickMode: modeState.setAiPickMode,
    setHighlighterMode: modeState.setHighlighterMode,
    setQuickEditDocumentMode: modeState.setQuickEditDocumentMode,
    setQuickEditMode: modeState.setQuickEditMode,
  });
}

function usePreparationScenarioController(args: {
  captureAdapter: ReturnType<PreparationHostPorts['createCaptureAdapter']>;
  modeState: ContentAppModeState;
  ports: PreparationHostPorts;
}): PreparationSurfaceControllers['scenarioController'] {
  const { captureAdapter, modeState, ports } = args;
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
    sourceAdapter: ports.createScenarioCaptureSourceAdapter(),
    autoClickCaptureTransport: ports.createScenarioAutoClickCaptureTransport(captureAdapter),
    registerAutoClickListeners: ports.createScenarioAutoClickListenerRegistry(),
  });
}

function usePreparationControllers(
  modeState: ContentAppModeState,
  frameManager: FrameManager,
  ports: PreparationHostPorts,
  drawingController: ContentDrawingController
): PreparationSurfaceControllers {
  const captureAdapter = usePreparationCaptureAdapter(ports, frameManager);
  const aiController = usePreparationAiController(modeState, ports);
  const scenarioController = usePreparationScenarioController({
    captureAdapter,
    modeState,
    ports,
  });
  const screenshotController = usePreparationScreenshotController(
    captureAdapter,
    modeState,
    aiController,
    scenarioController,
    drawingController
  );
  const autoBlurController = useAutoBlurController({
    autoApplyAllowed: false,
    frameManager,
    highlighterMode: modeState.highlighterMode,
  });
  const baseModeController = useToolbarModeController({
    ...buildContentModeControls(modeState),
    aiPickMode: modeState.aiPickMode,
    designReviewMode: modeState.designReviewMode,
    disableAiPickMode: disableAiPickModeIfLoaded,
    highlighterMode: modeState.highlighterMode,
    quickEditMode: modeState.quickEditMode,
  });
  const { disableDrawing, modeController } = useDrawingModeIntegration({
    baseModeController,
    controller: drawingController,
    modeState,
  });
  const drawingAwareAiController = {
    ...aiController,
    handleAiPickContentStart: (
      ...args: Parameters<typeof aiController.handleAiPickContentStart>
    ) => {
      disableDrawing();
      return aiController.handleAiPickContentStart(...args);
    },
  };
  const videoRecordingController = useVideoRecordingSurfaceController({
    onModeRequested: (enabled) => modeState.setVideoRecordingMode?.(enabled),
    onToolbarRequested: () => modeState.setIsToolbarVisible(true),
  });

  return {
    aiController: drawingAwareAiController,
    autoBlurController,
    drawingController,
    modeController,
    scenarioController,
    screenshotController,
    videoRecordingController,
  };
}

function usePreparationCaptureSync(
  modeState: ContentAppModeState,
  modeController: PreparationSurfaceControllers['modeController'],
  screenshotController: PreparationSurfaceControllers['screenshotController'],
  ports: PreparationHostPorts
): void {
  useContentScreenshotAutoStart({
    clearPendingAutoStartCapture: modeState.clearPendingAutoStartCapture,
    handleTakeScreenshot: screenshotController.handleTakeScreenshot,
    pendingAutoStartCapture: modeState.pendingAutoStartCapture,
    screenshotMode: modeState.screenshotMode,
  });
  usePreparationSurfacePortSync(
    modeState,
    modeController,
    screenshotController.handleTakeScreenshot,
    screenshotController.invalidateScreenshotRuns,
    ports.connectPort,
    ports.onPopupExportRequest
  );
}

function usePreparationModeState(): ContentAppModeState {
  const { controls, flags } = useContentModeFlags();
  return {
    ...flags,
    ...controls,
    ...useContentSurfaceState(),
  };
}

export function PreparationSurface(props: PreparationSurfaceProps) {
  const modeState = usePreparationModeState();
  const drawingController = useContentDrawingController();
  const frameManager = usePreparationFrameManager(modeState);
  const controllers = usePreparationControllers(
    modeState,
    frameManager,
    props.ports,
    drawingController
  );
  const layout = createPreparationLayoutProjection({
    controllers,
    frameManager,
    modeState,
    ports: props.ports,
  });

  usePreparationCaptureSync(
    modeState,
    controllers.modeController,
    controllers.screenshotController,
    props.ports
  );
  usePreparationFrameCallbacks(props.ports.acceptsElement, frameManager);
  usePreparationViewportSync(modeState.currentViewport, props.onViewportChange);

  return (
    <ContentAppLayout
      dialogs={layout.dialogs}
      scenario={layout.scenario}
      toolbar={layout.toolbar}
    />
  );
}

function usePreparationViewportSync(
  viewport: { width: number; height: number } | null,
  onViewportChange: ((viewport: { width: number; height: number } | null) => void) | undefined
): void {
  useEffect(() => {
    onViewportChange?.(viewport);
  }, [onViewportChange, viewport]);
}
