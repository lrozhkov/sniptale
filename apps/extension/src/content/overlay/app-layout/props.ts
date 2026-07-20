import type { ContentAppViewModel } from '../app/view-state';
import type {
  ContentAppLayoutDialogsProps,
  ContentAppLayoutProps,
  ContentAppLayoutScenarioProps,
  ContentAppLayoutToolbarProps,
} from './types';

type ContentAppScenarioLayoutViewModel = Pick<ContentAppViewModel, 'scenarioController'>;
type ContentAppToolbarLayoutViewModel = Pick<
  ContentAppViewModel,
  | 'aiController'
  | 'autoBlurController'
  | 'frameManager'
  | 'modeController'
  | 'modeState'
  | 'screenshotController'
>;
type ContentAppDialogsLayoutViewModel = Pick<
  ContentAppViewModel,
  'aiController' | 'autoBlurController' | 'modeState' | 'screenshotController'
>;

function createScenarioLayoutSection(
  viewModel: ContentAppScenarioLayoutViewModel
): ContentAppLayoutScenarioProps {
  return {
    actions: {
      applyCaptureAction: viewModel.scenarioController.applyCaptureAction,
      createProject: viewModel.scenarioController.createProject,
      deleteRecentStep: viewModel.scenarioController.deleteRecentStep,
      handleScreenshotModeDisabled: viewModel.scenarioController.handleScreenshotModeDisabled,
      moveRecentStep: viewModel.scenarioController.moveRecentStep,
      openEditor: viewModel.scenarioController.openEditor,
      selectProject: viewModel.scenarioController.selectProject,
      setCaptureMode: viewModel.scenarioController.setCaptureMode,
      setSidebarVisible: viewModel.scenarioController.setSidebarVisible,
    },
    state: {
      captureAction: viewModel.scenarioController.captureAction,
      pendingProjectSelection: viewModel.scenarioController.pendingProjectSelection,
      projects: viewModel.scenarioController.projects,
      recentStepHighlightToken: viewModel.scenarioController.recentStepHighlightToken,
      recentSteps: viewModel.scenarioController.recentSteps,
      scenarioCaptureMode: viewModel.scenarioController.scenarioCaptureMode,
      scenarioEnabled: viewModel.scenarioController.scenarioEnabled,
      scenarioProjectId: viewModel.scenarioController.scenarioProjectId,
      scenarioProjectName: viewModel.scenarioController.scenarioProjectName,
      sidebarVisible: viewModel.scenarioController.sidebarVisible,
    },
  };
}

function createToolbarLayoutSection(
  viewModel: ContentAppToolbarLayoutViewModel
): ContentAppLayoutToolbarProps {
  return {
    aiController: viewModel.aiController,
    autoBlurController: viewModel.autoBlurController,
    captureAction: viewModel.modeState.captureAction,
    currentViewport: viewModel.modeState.currentViewport,
    frameCount: viewModel.frameManager.frames.length,
    handleTakeScreenshot: viewModel.screenshotController.handleTakeScreenshot,
    isCompletelyHidden: viewModel.modeState.isCompletelyHidden,
    isCursorMode:
      !viewModel.modeState.highlighterMode &&
      !viewModel.modeState.quickEditMode &&
      !viewModel.modeState.aiPickMode,
    isToolbarVisible: viewModel.modeState.isToolbarVisible,
    modeController: viewModel.modeController,
    modes: {
      aiPickMode: viewModel.modeState.aiPickMode,
      highlighterMode: viewModel.modeState.highlighterMode,
      quickEditDocumentMode: viewModel.modeState.quickEditDocumentMode,
      quickEditMode: viewModel.modeState.quickEditMode,
      screenshotMode: viewModel.modeState.screenshotMode,
    },
    pinToTab: viewModel.modeState.pinToTab,
    setCaptureAction: viewModel.modeState.setCaptureAction,
    setCurrentViewport: viewModel.modeState.setCurrentViewport,
    setPinToTab: viewModel.modeState.setPinToTab,
    setTimerDelay: viewModel.modeState.setTimerDelay,
    timerDelay: viewModel.modeState.timerDelay,
  };
}

function createDialogsLayoutSection(
  viewModel: ContentAppDialogsLayoutViewModel
): ContentAppLayoutDialogsProps {
  return {
    aiController: viewModel.aiController,
    autoBlurController: viewModel.autoBlurController,
    countdown: viewModel.screenshotController.countdown,
    handleCancelCountdown: viewModel.screenshotController.handleCancelCountdown,
    quickActionToastCountdown: viewModel.modeState.quickActionToastCountdown,
    saveDialogState: viewModel.modeState.saveDialogState,
    setSaveDialogState: viewModel.modeState.setSaveDialogState,
    setSessionActivePresetId: viewModel.modeState.setSessionActivePresetId,
  };
}

export function buildContentAppLayoutProps(viewModel: ContentAppViewModel): ContentAppLayoutProps {
  return {
    dialogs: createDialogsLayoutSection(viewModel),
    scenario: createScenarioLayoutSection(viewModel),
    toolbar: createToolbarLayoutSection(viewModel),
  };
}
