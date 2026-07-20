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
  disableHighlighterMode,
  registerFrameCallbacks,
} from '../../../content/selection/highlighter';
import type { useFrameManager } from '../../../content/selection/frame-runtime/react/useFrameManager';
import { InteractiveFrame } from '../../../content/selection/interactive-frame';
import { disableQuickEditMode } from '../../../content/selection/quick-edit';
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

  useEffect(() => {
    registerFrameCallbacks(
      addFrame,
      frameManager.removeFrame,
      frameManager.clearFrames,
      hasFrameForElement
    );
  }, [addFrame, frameManager.clearFrames, frameManager.removeFrame, hasFrameForElement]);
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
  scenarioController: PreparationSurfaceControllers['scenarioController']
): PreparationSurfaceControllers['screenshotController'] {
  return useScreenshotController({
    captureAdapter,
    captureActionRef: modeState.captureActionRef,
    editingModes: {
      aiPickMode: modeState.aiPickMode,
      disableAiPickMode: aiController.handleDisableAiPickMode,
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
    autoClickBlocked: modeState.aiPickMode || modeState.highlighterMode || modeState.quickEditMode,
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
  ports: PreparationHostPorts
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
    scenarioController
  );
  const autoBlurController = useAutoBlurController({
    autoApplyAllowed: false,
    frameManager,
    highlighterMode: modeState.highlighterMode,
  });
  const modeController = useToolbarModeController({
    ...buildContentModeControls(modeState),
    aiPickMode: modeState.aiPickMode,
    disableAiPickMode: disableAiPickModeIfLoaded,
    highlighterMode: modeState.highlighterMode,
    quickEditMode: modeState.quickEditMode,
  });

  return {
    aiController,
    autoBlurController,
    modeController,
    scenarioController,
    screenshotController,
  };
}

function usePreparationCaptureSync(
  modeState: ContentAppModeState,
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
    screenshotController.handleTakeScreenshot,
    screenshotController.invalidateScreenshotRuns,
    ports.connectPort,
    ports.onPopupExportRequest
  );
}

function usePreparationModeState(): ContentAppModeState {
  return {
    ...useContentModeFlags(),
    ...useContentSurfaceState(),
  };
}

export function PreparationSurface(props: PreparationSurfaceProps) {
  const modeState = usePreparationModeState();
  const frameManager = usePreparationFrameManager(modeState);
  const controllers = usePreparationControllers(modeState, frameManager, props.ports);
  const layout = createPreparationLayoutProjection({ controllers, frameManager, modeState });

  usePreparationCaptureSync(modeState, controllers.screenshotController, props.ports);
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
