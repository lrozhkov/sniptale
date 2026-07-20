// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { AutoBlurController } from '../auto-blur/controller';
import type { ContentAppLayoutProps } from './types';

const { contentDialogStackMock, contentToolbarShellMock, pageStyleInspectorSurfaceMock } =
  vi.hoisted(() => ({
    contentDialogStackMock: vi.fn(() => <div data-ui="content.layout.dialogs" />),
    contentToolbarShellMock: vi.fn(() => <div data-ui="content.layout.toolbar" />),
    pageStyleInspectorSurfaceMock: vi.fn(() => (
      <div data-ui="content.layout.page-style-inspector" />
    )),
  }));

vi.mock('./dialogs', () => ({
  ContentDialogStack: () => contentDialogStackMock(),
}));

vi.mock('./sidebar-lazy', () => ({
  LazyContentScenarioRecorderSidebar: () => <div data-ui="content.layout.sidebar" />,
  preloadContentScenarioRecorderSidebar: vi.fn(),
}));

vi.mock('./toolbar', () => ({
  ContentToolbarShell: () => contentToolbarShellMock(),
}));

vi.mock('../page-style-inspector/view', () => ({
  PageStyleInspectorSurface: () => pageStyleInspectorSurfaceMock(),
  usePageStyleInspectorController: () => ({
    actions: {},
    inspectorOpen: false,
    toggleInspector: vi.fn(),
    viewState: { selection: null },
  }),
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
    blurSettings: { amount: 10, blurType: 'solid' as const, showBorder: false },
    close: vi.fn(),
    errorMessage: null,
    isApplying: false,
    isOpen: false,
    matches: [],
    open: vi.fn(),
    reset: vi.fn(),
    selectedCategories: new Set(),
    selectedMatchIds: new Set<string>(),
    selectedTargetCount: 0,
    setBlurSettings: vi.fn(),
    status: 'idle' as const,
    toggleAllSelection: vi.fn(),
    toggleAutoApply: vi.fn(async () => undefined),
    toggleCategory: vi.fn(),
    toggleMatch: vi.fn(),
  };
}

function createDialogProps(
  aiController: ReturnType<typeof createAiController>,
  autoBlurController: AutoBlurController
): ContentAppLayoutProps['dialogs'] {
  return {
    aiController,
    autoBlurController,
    countdown: 3,
    handleCancelCountdown: vi.fn(),
    quickActionToastCountdown: null,
    saveDialogState: null,
    setSaveDialogState: vi.fn(),
    setSessionActivePresetId: vi.fn(),
  };
}

function createScenarioProps(): ContentAppLayoutProps['scenario'] {
  return {
    actions: {
      applyCaptureAction: vi.fn(async () => undefined),
      createProject: vi.fn(async () => undefined),
      deleteRecentStep: vi.fn(async () => undefined),
      handleScreenshotModeDisabled: vi.fn(async () => undefined),
      moveRecentStep: vi.fn(async () => undefined),
      openEditor: vi.fn(async () => undefined),
      selectProject: vi.fn(async () => undefined),
      setCaptureMode: vi.fn(async () => undefined),
      setSidebarVisible: vi.fn(),
    },
    state: {
      captureAction: 'download_default',
      pendingProjectSelection: false,
      projects: [],
      recentStepHighlightToken: 0,
      recentSteps: [],
      scenarioCaptureMode: 'manual',
      scenarioEnabled: false,
      scenarioProjectId: null,
      scenarioProjectName: null,
      sidebarVisible: false,
    },
  };
}

function createToolbarProps(
  aiController: ReturnType<typeof createAiController>,
  autoBlurController: AutoBlurController
): ContentAppLayoutProps['toolbar'] {
  return {
    aiController,
    autoBlurController,
    captureAction: 'download_default',
    currentViewport: null,
    frameCount: 0,
    handleTakeScreenshot: vi.fn(async () => undefined),
    isCompletelyHidden: true,
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
      aiPickMode: false,
      highlighterMode: false,
      quickEditDocumentMode: true,
      quickEditMode: true,
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

function createControllerProps(): ContentAppLayoutProps {
  const aiController = createAiController();
  const autoBlurController = createAutoBlurController();

  return {
    dialogs: {
      ...createDialogProps(aiController, autoBlurController),
    },
    scenario: createScenarioProps(),
    toolbar: createToolbarProps(aiController, autoBlurController),
  };
}

async function renderLayout(props: ContentAppLayoutProps): Promise<void> {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<ContentAppLayout {...props} />);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

it('hides dialog and inspector app chrome while capture UI is completely hidden', async () => {
  const props = createControllerProps();

  await renderLayout(props);

  expect(contentDialogStackMock).not.toHaveBeenCalled();
  expect(pageStyleInspectorSurfaceMock).not.toHaveBeenCalled();
  expect(container?.querySelector('[data-ui="content.layout.dialogs"]')).toBeNull();
  expect(container?.querySelector('[data-ui="content.layout.page-style-inspector"]')).toBeNull();

  await renderLayout({
    ...props,
    toolbar: {
      ...props.toolbar,
      isCompletelyHidden: false,
    },
  });

  expect(contentDialogStackMock).toHaveBeenCalledTimes(1);
  expect(pageStyleInspectorSurfaceMock).toHaveBeenCalledTimes(1);
  expect(container?.querySelector('[data-ui="content.layout.dialogs"]')).not.toBeNull();
  expect(
    container?.querySelector('[data-ui="content.layout.page-style-inspector"]')
  ).not.toBeNull();
});
