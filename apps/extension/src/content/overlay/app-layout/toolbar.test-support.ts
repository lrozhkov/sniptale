import { vi } from 'vitest';
import type { AutoBlurController } from '../auto-blur/controller';
import type { ContentAppLayoutScenarioProps, ContentAppLayoutToolbarProps } from './types';
import { DEFAULT_BORDER_PRESET } from '../../../features/highlighter/style/defaults';

function createScenarioController() {
  return {
    applyCaptureAction: vi.fn(async () => undefined),
    captureAction: 'download_default' as const,
    createProject: vi.fn(async () => undefined),
    deleteRecentStep: vi.fn(async () => undefined),
    handleScreenshotModeDisabled: vi.fn(async () => undefined),
    moveRecentStep: vi.fn(async () => undefined),
    openEditor: vi.fn(async () => undefined),
    pendingProjectSelection: false,
    projects: [{ id: 'project-1', name: 'Project' }],
    recentStepHighlightToken: 0,
    recentSteps: [],
    rememberProjectSelection: false,
    restoreRecentStep: vi.fn(async () => undefined),
    scenarioCaptureMode: 'by-click' as const,
    scenarioEnabled: true,
    scenarioProjectId: 'project-1',
    scenarioProjectName: 'Project',
    selectProject: vi.fn(async () => undefined),
    setCaptureMode: vi.fn(async () => undefined),
    setEnabled: vi.fn(async () => undefined),
    setRememberProjectSelection: vi.fn(),
    setSidebarVisible: vi.fn(),
    sidebarVisible: true,
    trashedSteps: [],
  };
}

function createScenarioProps(): ContentAppLayoutScenarioProps {
  const controller = createScenarioController();

  return {
    actions: {
      applyCaptureAction: controller.applyCaptureAction,
      createProject: controller.createProject,
      deleteRecentStep: controller.deleteRecentStep,
      handleScreenshotModeDisabled: controller.handleScreenshotModeDisabled,
      moveRecentStep: controller.moveRecentStep,
      openEditor: controller.openEditor,
      selectProject: controller.selectProject,
      setCaptureMode: controller.setCaptureMode,
      setRememberProjectSelection: controller.setRememberProjectSelection,
      setSidebarVisible: controller.setSidebarVisible,
    },
    state: {
      captureAction: controller.captureAction,
      pendingProjectSelection: controller.pendingProjectSelection,
      projects: controller.projects,
      recentStepHighlightToken: controller.recentStepHighlightToken,
      recentSteps: controller.recentSteps,
      rememberProjectSelection: controller.rememberProjectSelection,
      scenarioCaptureMode: controller.scenarioCaptureMode,
      scenarioEnabled: controller.scenarioEnabled,
      scenarioProjectId: controller.scenarioProjectId,
      scenarioProjectName: controller.scenarioProjectName,
      sidebarVisible: controller.sidebarVisible,
    },
  };
}

function createToolbarProps(): ContentAppLayoutToolbarProps {
  return {
    aiController: {
      handleAiPickContentStart: vi.fn(),
      handleCloseAIModal: vi.fn(),
      handleDisableAiPickMode: vi.fn(),
      handleSubmitAIPrompt: vi.fn(async () => undefined),
      isAILoading: false,
      isAIModalOpen: false,
      treeData: null,
    },
    autoBlurController: { open: vi.fn() } as unknown as AutoBlurController,
    captureAction: 'download_default',
    currentViewport: null,
    frameCount: 2,
    futureFrameStyle: {
      blurSettings: { amount: 8, blurType: 'gaussian', showBorder: true },
      borderSettings: DEFAULT_BORDER_PRESET,
      effectMode: 'border',
      focusSettings: { opacity: 0.5, showBorder: false },
    },
    handleTakeScreenshot: vi.fn(async () => undefined),
    isCompletelyHidden: false,
    isCursorMode: true,
    isToolbarVisible: true,
    modeController: {
      handleClearHighlights: vi.fn(),
      handleEnableCursorMode: vi.fn(),
      handleHideToolbar: vi.fn(),
      handleToggleDesignReviewMode: vi.fn(),
      handleToggleDrawingMode: vi.fn(),
      handleToggleHighlighterMode: vi.fn(),
      handleToggleNavigationLock: vi.fn(),
      handleToggleQuickEditDocumentMode: vi.fn(),
      handleToggleQuickEditMode: vi.fn(),
      handleToggleScreenshotMode: vi.fn(),
    },
    modes: {
      aiPickMode: true,
      designReviewMode: false,
      highlighterMode: false,
      quickEditDocumentMode: false,
      quickEditMode: false,
      screenshotMode: true,
    },
    pinToTab: false,
    pinToTabAvailable: true,
    setFutureFrameEffectMode: vi.fn(),
    setCaptureAction: vi.fn(),
    setCurrentViewport: vi.fn(),
    setPinToTab: vi.fn(),
    setPinnedToolbarVisible: vi.fn(),
    setTimerDelay: vi.fn(),
    timerDelay: 0,
  };
}

export function createProps(): {
  designReview: { panel: { open: boolean; toggle: () => void } };
  scenario: ContentAppLayoutScenarioProps;
  toolbar: ContentAppLayoutToolbarProps;
} {
  return {
    designReview: { panel: { open: false, toggle: vi.fn() } },
    scenario: createScenarioProps(),
    toolbar: createToolbarProps(),
  };
}
