// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContentAppLayoutProps } from '../../app-layout/types';
import type { ContentAppViewModel } from '../view-state/types';
import { DEFAULT_BORDER_PRESET } from '../../../../features/highlighter/style/defaults';

const {
  contentAppLayoutMock,
  InteractiveFrameMock,
  preloadAIModalMock,
  useContentAppViewModelMock,
} = vi.hoisted(() => ({
  contentAppLayoutMock: vi.fn((_props: ContentAppLayoutProps) => (
    <div data-ui="content.app-layout" />
  )),
  InteractiveFrameMock: vi.fn(() => null),
  preloadAIModalMock: vi.fn(async () => undefined),
  useContentAppViewModelMock: vi.fn(),
}));

vi.mock('../../app-layout', () => ({
  ContentAppLayout: (props: ContentAppLayoutProps) => contentAppLayoutMock(props),
}));

vi.mock('../../../selection/interactive-frame', () => ({
  InteractiveFrame: InteractiveFrameMock,
}));

vi.mock('../../ai/modal/shell/lazy', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../ai/modal/shell/lazy')>()),
  preloadAIModal: preloadAIModalMock,
}));

vi.mock('../view-state/hook', () => ({
  useContentAppViewModel: useContentAppViewModelMock,
}));

import { App } from '.';
import { buildContentAppLayoutProps } from '../../app-layout/props';

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

function createModeController() {
  return {
    handleClearHighlights: vi.fn(),
    handleEnableCursorMode: vi.fn(),
    handleHideToolbar: vi.fn(),
    handleToggleHighlighterMode: vi.fn(),
    handleToggleDrawingMode: vi.fn(),
    handleToggleNavigationLock: vi.fn(),
    handleToggleQuickEditDocumentMode: vi.fn(),
    handleToggleQuickEditMode: vi.fn(),
    handleToggleScreenshotMode: vi.fn(),
  };
}

function createModeState() {
  return {
    aiPickMode: false,
    captureAction: 'download_default' as const,
    currentViewport: null,
    highlighterMode: false,
    drawingMode: false,
    isCompletelyHidden: false,
    isToolbarVisible: true,
    pinToTab: false,
    pinToTabAvailable: true,
    quickActionToastCountdown: 3,
    quickEditDocumentMode: false,
    quickEditMode: false,
    saveDialogState: null,
    screenshotMode: true,
    sessionActivePresetId: null,
    setCaptureAction: vi.fn(),
    setCurrentViewport: vi.fn(),
    setPinToTab: vi.fn(),
    setSaveDialogState: vi.fn(),
    setSessionActivePresetId: vi.fn(),
    setTimerDelay: vi.fn(),
    timerDelay: 5,
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

function createScreenshotController() {
  return {
    countdown: null,
    handleCancelCountdown: vi.fn(),
    handleTakeScreenshot: vi.fn(async () => undefined),
  };
}

function createViewModel() {
  const futureFrameStyle = {
    blurSettings: { amount: 8, blurType: 'gaussian' as const, showBorder: true },
    borderSettings: DEFAULT_BORDER_PRESET,
    effectMode: 'border' as const,
    focusSettings: { opacity: 0.5, showBorder: false },
  };
  return {
    aiController: createAiController(),
    drawingController: { kind: 'drawing-controller' },
    frameManager: {
      frames: [{ id: 'frame-1' }, { id: 'frame-2' }],
      getFutureFrameStyle: vi.fn(() => futureFrameStyle),
      setFutureFrameEffectMode: vi.fn(),
    },
    modeController: createModeController(),
    modeState: createModeState(),
    scenarioController: createScenarioController(),
    screenshotController: createScreenshotController(),
  } as unknown as ContentAppViewModel;
}

async function renderApp() {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<App />);
  });
}

function useAppTestScope() {
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

async function verifiesGroupedLayoutProps() {
  const viewModel = createViewModel();
  useContentAppViewModelMock.mockReturnValue(viewModel);

  await renderApp();

  const firstCall = contentAppLayoutMock.mock.calls[0];
  expect(useContentAppViewModelMock).toHaveBeenCalledWith({
    InteractiveFrameComponent: InteractiveFrameMock,
    preloadAIModal: preloadAIModalMock,
  });
  expect(contentAppLayoutMock).toHaveBeenCalledTimes(1);
  expect(firstCall?.[0]).toEqual(buildContentAppLayoutProps(viewModel));
  expect(firstCall?.[0].toolbar.futureFrameStyle).toBe(
    viewModel.frameManager.getFutureFrameStyle()
  );
  expect(firstCall?.[0].toolbar.setFutureFrameEffectMode).toBe(
    viewModel.frameManager.setFutureFrameEffectMode
  );
  expect(firstCall?.[0].toolbar.drawingController).toBe(viewModel.drawingController);
  expect(firstCall?.[0].toolbar.modes.drawingMode).toBe(false);
  expect(firstCall?.[0].toolbar.modeController.handleToggleDrawingMode).toBe(
    viewModel.modeController.handleToggleDrawingMode
  );
}

describe('App', () => {
  useAppTestScope();

  it('passes grouped layout props into ContentAppLayout', verifiesGroupedLayoutProps);
});
