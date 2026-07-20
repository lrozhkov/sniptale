// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AutoBlurController } from '../auto-blur/controller';
import { ContentToolbarShell } from './toolbar';
import type { ContentAppLayoutScenarioProps, ContentAppLayoutToolbarProps } from './types';

const { preloadContentScenarioRecorderSidebarMock, toolbarMock } = vi.hoisted(() => ({
  preloadContentScenarioRecorderSidebarMock: vi.fn(async () => undefined),
  toolbarMock: vi.fn((props: { scenario?: unknown }) => (
    <div data-ui="content.toolbar.mock">{JSON.stringify(props.scenario ?? null)}</div>
  )),
}));

vi.mock('../toolbar/view', () => ({
  Toolbar: (props: Record<string, unknown>) => toolbarMock(props),
}));

vi.mock('./sidebar-lazy', () => ({
  preloadContentScenarioRecorderSidebar: preloadContentScenarioRecorderSidebarMock,
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({
    warn: vi.fn(),
  }),
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

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
    handleTakeScreenshot: vi.fn(async () => undefined),
    isCompletelyHidden: false,
    isCursorMode: true,
    isToolbarVisible: true,
    modeController: {
      handleClearHighlights: vi.fn(),
      handleEnableCursorMode: vi.fn(),
      handleHideToolbar: vi.fn(),
      handleToggleHighlighterMode: vi.fn(),
      handleToggleNavigationLock: vi.fn(),
      handleToggleQuickEditDocumentMode: vi.fn(),
      handleToggleQuickEditMode: vi.fn(),
      handleToggleScreenshotMode: vi.fn(),
    },
    modes: {
      aiPickMode: true,
      highlighterMode: false,
      quickEditDocumentMode: false,
      quickEditMode: false,
      screenshotMode: true,
    },
    pinToTab: false,
    setCaptureAction: vi.fn(),
    setCurrentViewport: vi.fn(),
    setPinToTab: vi.fn(),
    setTimerDelay: vi.fn(),
    timerDelay: 0,
  };
}

function createProps(): {
  scenario: ContentAppLayoutScenarioProps;
  toolbar: ContentAppLayoutToolbarProps;
} {
  return {
    scenario: createScenarioProps(),
    toolbar: createToolbarProps(),
  };
}

async function renderShell(props: ReturnType<typeof createProps>) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<ContentToolbarShell {...props} />);
  });
}

function useContentToolbarShellTestScope() {
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

async function verifiesByClickModeSync() {
  const props = createProps();

  await renderShell(props);
  expect(props.scenario.actions.setCaptureMode).toHaveBeenCalledWith('manual');

  props.toolbar.modes.aiPickMode = false;
  props.scenario.state.scenarioCaptureMode = 'manual';
  await renderShell(props);

  expect(props.scenario.actions.setCaptureMode).toHaveBeenNthCalledWith(2, 'by-click');
}

async function verifiesScreenshotDisableAndVisibility() {
  const props = createProps();
  await renderShell(props);

  const lastToolbarProps = toolbarMock.mock.calls.at(-1)?.[0] as {
    onToggleScreenshotMode: (enabled: boolean) => void;
  };
  lastToolbarProps.onToggleScreenshotMode(false);
  await Promise.resolve();

  expect(props.toolbar.modeController.handleToggleScreenshotMode).toHaveBeenCalledWith(false);
  expect(props.scenario.actions.handleScreenshotModeDisabled).toHaveBeenCalledTimes(1);

  props.toolbar.isToolbarVisible = false;
  await renderShell(props);

  expect(container?.textContent).toBe('');
}

async function verifiesToolbarUsesModeStateCaptureAction() {
  const props = createProps();
  props.scenario.state.captureAction = 'copy';
  props.toolbar.captureAction = 'download_default';

  await renderShell(props);

  const lastToolbarProps = toolbarMock.mock.calls.at(-1)?.[0] as {
    captureAction: string;
  };

  expect(lastToolbarProps.captureAction).toBe('download_default');
}

async function verifiesToolbarForwardsQuickEditDocumentMode() {
  const props = createProps();
  props.toolbar.modes.quickEditMode = true;
  props.toolbar.modes.quickEditDocumentMode = true;

  await renderShell(props);

  const lastToolbarProps = toolbarMock.mock.calls.at(-1)?.[0] as {
    onToggleQuickEditDocumentMode: (enabled: boolean) => void;
    quickEditDocumentMode: boolean;
  };

  expect(lastToolbarProps.quickEditDocumentMode).toBe(true);
  expect(lastToolbarProps.onToggleQuickEditDocumentMode).toBe(
    props.toolbar.modeController.handleToggleQuickEditDocumentMode
  );
}

async function verifiesScenarioSidebarPreloadOnIntent() {
  const props = createProps();
  await renderShell(props);

  const lastToolbarProps = toolbarMock.mock.calls.at(-1)?.[0] as {
    scenario: {
      onCaptureActionSelected: (action: 'scenario' | 'copy') => Promise<void> | void;
      onToggleSidebar: () => Promise<void> | void;
    };
  };

  await lastToolbarProps.scenario.onCaptureActionSelected('scenario');
  expect(preloadContentScenarioRecorderSidebarMock).toHaveBeenCalledTimes(1);

  props.scenario.state.sidebarVisible = false;
  await renderShell(props);
  const rerenderedToolbarProps = toolbarMock.mock.calls.at(-1)?.[0] as {
    scenario: {
      onToggleSidebar: () => Promise<void> | void;
    };
  };

  await rerenderedToolbarProps.scenario.onToggleSidebar();
  expect(preloadContentScenarioRecorderSidebarMock).toHaveBeenCalledTimes(2);
}

describe('ContentToolbarShell', () => {
  useContentToolbarShellTestScope();

  it(
    'forces manual mode when by-click capture is blocked and restores it after blockers clear',
    verifiesByClickModeSync
  );
  it(
    'wires screenshot disable through the scenario controller and hides itself when toolbar visibility is off',
    verifiesScreenshotDisableAndVisibility
  );
  it(
    'preloads the scenario recorder sidebar when scenario intent would reveal it',
    verifiesScenarioSidebarPreloadOnIntent
  );
  it(
    'renders the toolbar capture action from mode state instead of stale scenario state',
    verifiesToolbarUsesModeStateCaptureAction
  );
  it(
    'forwards quick-edit document submode state and handler into the toolbar',
    verifiesToolbarForwardsQuickEditDocumentMode
  );
});
