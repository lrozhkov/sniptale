import type {
  ContentAppLayoutDialogsProps,
  ContentAppLayoutScenarioProps,
  ContentAppLayoutToolbarProps,
} from '../../../content/overlay/app-layout/types';
import type { ContentAppModeState } from '../../../content/overlay/app/mode';
import type { useAiPickController } from '../../../content/overlay/ai/pick/controller';
import type { useAutoBlurController } from '../../../content/overlay/auto-blur/controller';
import type { useScenarioController } from '../../../content/overlay/scenario/controller';
import type { useScreenshotController } from '../../../content/overlay/screenshot/controller';
import type { useToolbarModeController } from '../../../content/overlay/toolbar/mode-controller';
import type { useFrameManager } from '../../../content/selection/frame-runtime/react/useFrameManager';

type FrameManager = ReturnType<typeof useFrameManager>;

export type PreparationSurfaceControllers = {
  aiController: ReturnType<typeof useAiPickController>;
  autoBlurController: ReturnType<typeof useAutoBlurController>;
  modeController: ReturnType<typeof useToolbarModeController>;
  scenarioController: ReturnType<typeof useScenarioController>;
  screenshotController: ReturnType<typeof useScreenshotController>;
};

type PreparationLayoutProjectionArgs = {
  controllers: PreparationSurfaceControllers;
  frameManager: FrameManager;
  modeState: ContentAppModeState;
};

type PreparationLayoutProjection = {
  dialogs: ContentAppLayoutDialogsProps;
  scenario: ContentAppLayoutScenarioProps;
  toolbar: ContentAppLayoutToolbarProps;
};

function projectPreparationDialogs(
  controllers: PreparationSurfaceControllers,
  modeState: ContentAppModeState
): ContentAppLayoutDialogsProps {
  return {
    aiController: controllers.aiController,
    autoBlurController: controllers.autoBlurController,
    countdown: controllers.screenshotController.countdown,
    handleCancelCountdown: controllers.screenshotController.handleCancelCountdown,
    quickActionToastCountdown: modeState.quickActionToastCountdown,
    saveDialogState: modeState.saveDialogState,
    setSaveDialogState: modeState.setSaveDialogState,
    setSessionActivePresetId: modeState.setSessionActivePresetId,
  };
}

export function projectPreparationScenario(
  scenarioController: PreparationSurfaceControllers['scenarioController']
): ContentAppLayoutScenarioProps {
  return {
    actions: {
      applyCaptureAction: scenarioController.applyCaptureAction,
      createProject: scenarioController.createProject,
      deleteRecentStep: scenarioController.deleteRecentStep,
      handleScreenshotModeDisabled: scenarioController.handleScreenshotModeDisabled,
      moveRecentStep: scenarioController.moveRecentStep,
      openEditor: scenarioController.openEditor,
      selectProject: scenarioController.selectProject,
      setCaptureMode: scenarioController.setCaptureMode,
      setSidebarVisible: scenarioController.setSidebarVisible,
    },
    state: {
      captureAction: scenarioController.captureAction,
      pendingProjectSelection: scenarioController.pendingProjectSelection,
      projects: scenarioController.projects,
      recentStepHighlightToken: scenarioController.recentStepHighlightToken,
      recentSteps: scenarioController.recentSteps,
      scenarioCaptureMode: scenarioController.scenarioCaptureMode,
      scenarioEnabled: scenarioController.scenarioEnabled,
      scenarioProjectId: scenarioController.scenarioProjectId,
      scenarioProjectName: scenarioController.scenarioProjectName,
      sidebarVisible: scenarioController.sidebarVisible,
    },
  };
}

function projectPreparationToolbar(
  args: PreparationLayoutProjectionArgs
): ContentAppLayoutToolbarProps {
  const { controllers, frameManager, modeState } = args;
  return {
    aiController: controllers.aiController,
    autoBlurController: controllers.autoBlurController,
    captureAction: modeState.captureAction,
    currentViewport: modeState.currentViewport,
    frameCount: frameManager.frames.length,
    handleTakeScreenshot: controllers.screenshotController.handleTakeScreenshot,
    isCompletelyHidden: modeState.isCompletelyHidden,
    isCursorMode: !modeState.highlighterMode && !modeState.quickEditMode && !modeState.aiPickMode,
    isToolbarVisible: modeState.isToolbarVisible,
    modeController: controllers.modeController,
    modes: {
      aiPickMode: modeState.aiPickMode,
      highlighterMode: modeState.highlighterMode,
      quickEditDocumentMode: modeState.quickEditDocumentMode,
      quickEditMode: modeState.quickEditMode,
      screenshotMode: modeState.screenshotMode,
    },
    pinToTab: modeState.pinToTab,
    setCaptureAction: modeState.setCaptureAction,
    setCurrentViewport: modeState.setCurrentViewport,
    setPinToTab: modeState.setPinToTab,
    setTimerDelay: modeState.setTimerDelay,
    timerDelay: modeState.timerDelay,
  };
}

export function createPreparationLayoutProjection(
  args: PreparationLayoutProjectionArgs
): PreparationLayoutProjection {
  return {
    dialogs: projectPreparationDialogs(args.controllers, args.modeState),
    scenario: projectPreparationScenario(args.controllers.scenarioController),
    toolbar: projectPreparationToolbar(args),
  };
}
