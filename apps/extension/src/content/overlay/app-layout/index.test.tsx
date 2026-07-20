// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AutoBlurController } from '../auto-blur/controller';
import type { ContentAppLayoutDialogsProps, ContentAppLayoutProps } from './types';

const { contentDialogStackMock, contentScenarioRecorderSidebarMock, contentToolbarShellMock } =
  vi.hoisted(() => ({
    contentDialogStackMock: vi.fn((props: { dialogs: ContentAppLayoutDialogsProps }) => (
      <div data-ui="content.layout.dialogs">{String(Boolean(props.dialogs))}</div>
    )),
    contentScenarioRecorderSidebarMock: vi.fn((_props: Record<string, unknown>) => (
      <div data-ui="content.layout.sidebar" />
    )),
    contentToolbarShellMock: vi.fn((_props: Record<string, unknown>) => (
      <div data-ui="content.layout.toolbar" />
    )),
  }));

vi.mock('./dialogs', () => ({
  ContentDialogStack: (props: { dialogs: ContentAppLayoutDialogsProps }) =>
    contentDialogStackMock(props),
}));

vi.mock('./sidebar-lazy', () => ({
  LazyContentScenarioRecorderSidebar: (props: Record<string, unknown>) =>
    contentScenarioRecorderSidebarMock(props),
}));

vi.mock('./toolbar', () => ({
  ContentToolbarShell: (props: Record<string, unknown>) => contentToolbarShellMock(props),
}));

import { ContentAppLayout } from '.';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createAiController() {
  return {
    handleAiPickContentStart: vi.fn(),
    handleCloseAIModal: vi.fn(),
    handleDisableAiPickMode: vi.fn(),
    handleSubmitAIPrompt: vi.fn(async () => undefined),
    isAILoading: false,
    isAIModalOpen: false,
    treeData: null,
  };
}

function createAutoBlurController(): AutoBlurController {
  return {
    apply: vi.fn(async () => undefined),
    applyOnce: vi.fn(async () => undefined),
    autoApplyAllowed: true,
    autoApplyEnabled: false,
    blurSettings: {
      amount: 10,
      blurType: 'solid',
      showBorder: false,
    },
    close: vi.fn(),
    errorMessage: null,
    isApplying: false,
    isOpen: false,
    matches: [],
    open: vi.fn(),
    reset: vi.fn(),
    selectedCategories: new Set(),
    selectedMatchIds: new Set(),
    selectedTargetCount: 0,
    setBlurSettings: vi.fn(),
    status: 'idle',
    toggleAllSelection: vi.fn(),
    toggleAutoApply: vi.fn(async () => undefined),
    toggleCategory: vi.fn(),
    toggleMatch: vi.fn(),
  };
}

function createModeController() {
  return {
    handleClearHighlights: vi.fn(),
    handleEnableCursorMode: vi.fn(),
    handleHideToolbar: vi.fn(),
    handleToggleHighlighterMode: vi.fn(),
    handleToggleNavigationLock: vi.fn(),
    handleToggleQuickEditDocumentMode: vi.fn(),
    handleToggleQuickEditMode: vi.fn(),
    handleToggleScreenshotMode: vi.fn(),
  };
}

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
    projects: [],
    recentStepHighlightToken: 0,
    recentSteps: [],
    rememberProjectSelection: false,
    restoreRecentStep: vi.fn(async () => undefined),
    scenarioCaptureMode: 'manual' as const,
    scenarioEnabled: false,
    scenarioProjectId: null,
    scenarioProjectName: null,
    selectProject: vi.fn(async () => undefined),
    setCaptureMode: vi.fn(async () => undefined),
    setEnabled: vi.fn(async () => undefined),
    setRememberProjectSelection: vi.fn(),
    setSidebarVisible: vi.fn(),
    sidebarVisible: false,
    trashedSteps: [],
  };
}

function createScenarioProps() {
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

function createProps() {
  return {
    dialogs: {
      aiController: createAiController(),
      autoBlurController: createAutoBlurController(),
      countdown: null,
      handleCancelCountdown: vi.fn(),
      quickActionToastCountdown: null,
      saveDialogState: null,
      setSaveDialogState: vi.fn(),
      setSessionActivePresetId: vi.fn(),
    },
    scenario: {
      ...createScenarioProps(),
    },
    toolbar: {
      aiController: createAiController(),
      autoBlurController: createAutoBlurController(),
      captureAction: 'download_default',
      currentViewport: null,
      frameCount: 0,
      handleTakeScreenshot: vi.fn(async () => undefined),
      isCompletelyHidden: false,
      isCursorMode: true,
      isToolbarVisible: true,
      modeController: createModeController(),
      modes: {
        aiPickMode: false,
        highlighterMode: false,
        quickEditDocumentMode: false,
        quickEditMode: false,
        screenshotMode: false,
      },
      pinToTab: false,
      setCaptureAction: vi.fn(),
      setCurrentViewport: vi.fn(),
      setPinToTab: vi.fn(),
      setTimerDelay: vi.fn(),
      timerDelay: 0,
    },
  } satisfies ContentAppLayoutProps;
}

async function renderLayout(props: ReturnType<typeof createProps>) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<ContentAppLayout {...props} />);
  });
}

function useContentAppLayoutTestScope() {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    root = null;
    container?.remove();
    container = null;
    vi.unstubAllGlobals();
  });
}

async function verifiesLayoutComposition() {
  const props = createProps();
  props.scenario.state.scenarioEnabled = true;
  props.scenario.state.sidebarVisible = true;
  await renderLayout(props);

  const toolbarCall = contentToolbarShellMock.mock.calls[0];
  const sidebarCall = contentScenarioRecorderSidebarMock.mock.calls[0];
  const dialogsCall = contentDialogStackMock.mock.calls[0];

  expect(container?.querySelector('[data-ui="content.layout.toolbar"]')).not.toBeNull();
  expect(container?.querySelector('[data-ui="content.layout.sidebar"]')).not.toBeNull();
  expect(container?.querySelector('[data-ui="content.layout.dialogs"]')).not.toBeNull();
  expect(toolbarCall?.[0]).toEqual({
    scenario: props.scenario,
    toolbar: props.toolbar,
  });
  expect(sidebarCall?.[0]).toEqual({
    isCompletelyHidden: props.toolbar.isCompletelyHidden,
    modeController: props.toolbar.modeController,
    scenario: props.scenario,
  });
  expect(dialogsCall?.[0]).toEqual({ dialogs: props.dialogs });
}

async function verifiesSidebarSlotSkipsHiddenStates() {
  const props = createProps();
  await renderLayout(props);

  expect(contentScenarioRecorderSidebarMock).not.toHaveBeenCalled();
}

describe('ContentAppLayout', () => {
  useContentAppLayoutTestScope();

  it(
    'composes the split toolbar, sidebar, and dialog stacks with the grouped layout props',
    verifiesLayoutComposition
  );
  it(
    'skips rendering the lazy sidebar slot while scenario sidebar visibility is inactive',
    verifiesSidebarSlotSkipsHiddenStates
  );
});
