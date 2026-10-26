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
import {
  registerContentRuntimeCleanup,
  disposeExistingContentRuntime,
} from '../../../runtime/entrypoint/lifecycle';
import { requestFullContentRuntimeRelease } from '../../../runtime/entrypoint/markers';
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
    quickActionOverlayRef: { current: null },
    pinToTabConfirmed: false,
    designReviewMode: false,
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
    videoRecordingMode: true,
    sessionActivePresetId: null,
    setCaptureAction: vi.fn(),
    setCurrentViewport: vi.fn(),
    setPinToTab: vi.fn(),
    setSaveDialogState: vi.fn(),
    setSessionActivePresetId: vi.fn(),
    setTimerDelay: vi.fn(),
    setVideoRecordingMode: vi.fn(),
    timerDelay: 5,
  };
}

function createScenarioController() {
  return {
    setRecorderPanelVisible: vi.fn(async () => true),
    captureAction: 'download_default' as const,
    createProject: vi.fn(async () => undefined),
    deleteRecentStep: vi.fn(async () => undefined),
    finishRecording: vi.fn(async () => undefined),
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
    videoRecordingController: { kind: 'video-recording-controller' },
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
    disposeExistingContentRuntime();
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
  expect(firstCall?.[0].toolbar.videoRecording).toBe(viewModel.videoRecordingController);
  expect(firstCall?.[0].toolbar.modes.videoRecordingMode).toBe(true);
  expect(firstCall?.[0].toolbar.setVideoRecordingMode).toBe(
    viewModel.modeState.setVideoRecordingMode
  );
}

describe('App', () => {
  useAppTestScope();

  it('passes grouped layout props into ContentAppLayout', verifiesGroupedLayoutProps);
});

describe('App release decisions after React commits', () => {
  useAppTestScope();
  it('refuses active work then evaluates a queued close against committed state', async () => {
    const model = createViewModel();
    const cleanup = vi.fn();
    registerContentRuntimeCleanup(cleanup);
    useContentAppViewModelMock.mockReturnValue(model);
    await renderApp();
    let refused!: Promise<boolean>;
    await act(async () => {
      refused = requestFullContentRuntimeRelease();
    });
    expect(await refused).toBe(false);
    model.modeState.screenshotMode = false;
    model.modeState.videoRecordingMode = false;
    model.frameManager.frames = [];
    let accepted!: Promise<boolean>;
    await act(async () => {
      root?.render(<App />);
      accepted = requestFullContentRuntimeRelease();
    });
    expect(await accepted).toBe(true);
    expect(cleanup).toHaveBeenCalledOnce();
  });
  it('refuses retained frames, pin, capture, scenario and editing work', async () => {
    const model = createViewModel();
    model.modeState.screenshotMode = false;
    model.modeState.videoRecordingMode = false;
    model.frameManager.frames = [];
    registerContentRuntimeCleanup(vi.fn());
    useContentAppViewModelMock.mockReturnValue(model);
    await renderApp();
    for (const field of [
      'pinToTab',
      'pinToTabConfirmed',
      'isCompletelyHidden',
      'drawingMode',
      'designReviewMode',
      'screenshotMode',
      'videoRecordingMode',
      'highlighterMode',
      'quickEditMode',
      'quickEditDocumentMode',
      'aiPickMode',
    ] as const) {
      model.modeState[field] = true;
      let result!: Promise<boolean>;
      await act(async () => {
        root?.render(<App />);
        result = requestFullContentRuntimeRelease();
      });
      expect(await result).toBe(false);
      model.modeState[field] = false;
    }
    const blockers = [
      () => {
        model.scenarioController.scenarioEnabled = true;
        return () => {
          model.scenarioController.scenarioEnabled = false;
        };
      },
      () => {
        model.screenshotController.countdown = 2;
        return () => {
          model.screenshotController.countdown = null;
        };
      },
      () => {
        model.modeState.saveDialogState = {
          dataUrl: 'data:image/png;base64,proof',
          filename: 'proof.png',
        };
        return () => {
          model.modeState.saveDialogState = null;
        };
      },
      () => {
        model.modeState.quickActionOverlayRef.current = {
          afterCapture: 'copy',
          imageFormat: 'png',
          imageQuality: 100,
          exitAfterCapture: true,
        };
        return () => {
          model.modeState.quickActionOverlayRef.current = null;
        };
      },
      () => {
        model.aiController.isAIModalOpen = true;
        return () => {
          model.aiController.isAIModalOpen = false;
        };
      },
      () => {
        model.frameManager.frames = createViewModel().frameManager.frames;
        return () => {
          model.frameManager.frames = [];
        };
      },
    ];
    for (const block of blockers) {
      const reset = block();
      let result!: Promise<boolean>;
      await act(async () => {
        root?.render(<App />);
        result = requestFullContentRuntimeRelease();
      });
      expect(await result).toBe(false);
      reset();
    }
  });
});
