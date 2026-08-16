// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

type ScreenshotControllerMockArgs = {
  editingModes: Record<'disableAiPickMode' | 'disableQuickEditMode', () => void> & {
    restoreEditingMode: (mode: 'ai-pick' | 'drawing') => void;
  };
};
type ToolbarModeControllerMockArgs = { disableAiPickMode: () => void };

const mocks = vi.hoisted(() => ({
  disableAiPickMode: vi.fn(),
  disableHighlighterMode: vi.fn(),
  disableQuickEditDocumentMode: vi.fn(),
  disableQuickEditMode: vi.fn(),
  disableDrawing: vi.fn(),
  drawingController: {
    finalizeInteraction: vi.fn(),
    prepareActivation: vi.fn(() => true),
    session: { dispose: vi.fn() },
  },
  scenarioController: {
    buildManualCapturePayload: vi.fn(),
    refreshSession: vi.fn(),
    saveSelectionCapture: vi.fn(),
  },
  screenshotController: {
    countdown: null,
    handleCancelCountdown: vi.fn(),
    handleTakeScreenshot: vi.fn(async () => undefined),
  },
  handleAiPickContentStart: vi.fn(),
  handleEnableAiPickMode: vi.fn(),
  useAiPickController: vi.fn(() => ({
    kind: 'ai-controller',
    handleAiPickContentStart: mocks.handleAiPickContentStart,
    handleEnableAiPickMode: mocks.handleEnableAiPickMode,
  })),
  useContentDrawingController: vi.fn(() => mocks.drawingController),
  useDrawingModeIntegration: vi.fn(() => ({
    disableDrawing: mocks.disableDrawing,
    modeController: { kind: 'drawing-mode-controller', handleToggleDrawingMode: vi.fn() },
  })),
  useContentScreenshotAutoStart: vi.fn(),
  useScenarioController: vi.fn(() => ({
    buildManualCapturePayload: mocks.scenarioController.buildManualCapturePayload,
    refreshSession: mocks.scenarioController.refreshSession,
    saveSelectionCapture: mocks.scenarioController.saveSelectionCapture,
  })),
  useScreenshotController: vi.fn(
    (_args: ScreenshotControllerMockArgs) => mocks.screenshotController
  ),
  useToolbarModeController: vi.fn((_args: ToolbarModeControllerMockArgs) => ({
    kind: 'mode-controller',
  })),
  videoRecordingController: { kind: 'video-recording-controller' },
  useVideoRecordingSurfaceController: vi.fn(
    (_args: { onModeRequested: (enabled: boolean) => void; onToolbarRequested: () => void }) =>
      mocks.videoRecordingController
  ),
  preloadAIModal: vi.fn(async () => undefined),
}));

vi.mock('../../ai/pick/runtime/lazy', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../ai/pick/runtime/lazy')>()),
  disableAiPickModeIfLoaded: mocks.disableAiPickMode,
}));

vi.mock('../../../selection/quick-edit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../selection/quick-edit')>()),
  disableQuickEditDocumentMode: mocks.disableQuickEditDocumentMode,
  disableQuickEditMode: mocks.disableQuickEditMode,
}));

vi.mock('../../../selection/highlighter', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../selection/highlighter')>()),
  disableHighlighterMode: mocks.disableHighlighterMode,
}));

vi.mock('../../ai/pick/controller', () => ({
  useAiPickController: mocks.useAiPickController,
}));

vi.mock('../../screenshot/auto-start', () => ({
  useContentScreenshotAutoStart: mocks.useContentScreenshotAutoStart,
}));

vi.mock('../../scenario/controller', () => ({
  useScenarioController: mocks.useScenarioController,
}));

vi.mock('../../screenshot/controller', () => ({
  useScreenshotController: mocks.useScreenshotController,
}));

vi.mock('../../toolbar/mode-controller', () => ({
  useToolbarModeController: mocks.useToolbarModeController,
}));

vi.mock('../../../drawing/controller', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../drawing/controller')>()),
  useContentDrawingController: mocks.useContentDrawingController,
}));

vi.mock('../../../drawing/mode', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../drawing/mode')>()),
  useDrawingModeIntegration: mocks.useDrawingModeIntegration,
}));

vi.mock('../../video-recording/session/controller', () => ({
  useVideoRecordingSurfaceController: mocks.useVideoRecordingSurfaceController,
}));

import { useContentAppControllers } from '.';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
type ContentAppControllersModeState = Parameters<typeof useContentAppControllers>[0];
let currentModeState: ReturnType<typeof createModeState> | null = null;
let latestControllers: ReturnType<typeof useContentAppControllers> | null = null;

function createModeState(): ContentAppControllersModeState {
  return {
    aiPickMode: true,
    captureAction: 'download_default',
    captureActionRef: { current: 'download_default' as const },
    clearPendingAutoStartCapture: vi.fn(),
    currentViewport: null,
    designReviewMode: false,
    drawingMode: false,
    highlighterMode: false,
    isCompletelyHidden: false,
    isToolbarVisible: true,
    navigationLockEnabled: true,
    pendingAutoStartCapture: { type: 'selection' },
    pinToTab: false,
    pinToTabAvailable: true,
    quickActionToastCountdown: null,
    quickActionOverlayRef: { current: null },
    quickEditDocumentMode: false,
    quickEditMode: true,
    queueAutoStartCapture: vi.fn(),
    saveDialogState: null,
    screenshotMode: true,
    videoRecordingMode: false,
    sessionActivePresetId: 'preset-1',
    setAiPickMode: vi.fn(),
    setCaptureAction: vi.fn(),
    setCurrentViewport: vi.fn(),
    setDesignReviewMode: vi.fn(),
    setDrawingMode: vi.fn(),
    setHighlighterMode: vi.fn(),
    setIsCompletelyHidden: vi.fn(),
    setIsToolbarVisible: vi.fn(),
    setNavigationLockEnabled: vi.fn(),
    setPinToTab: vi.fn(),
    setPinnedToolbarVisible: vi.fn(),
    setQuickActionOverlay: vi.fn(),
    setQuickActionToastCountdown: vi.fn(),
    setQuickEditDocumentMode: vi.fn(),
    setQuickEditMode: vi.fn(),
    setSaveDialogState: vi.fn(),
    setSessionActivePresetId: vi.fn(),
    setScreenshotMode: vi.fn(),
    setTimerDelay: vi.fn(),
    setVideoRecordingMode: vi.fn(),
    timerDelay: 5,
  };
}

function Harness() {
  latestControllers = useContentAppControllers(currentModeState ?? createModeState(), {
    preloadAIModal: mocks.preloadAIModal,
  });
  return null;
}

async function renderHarness(modeState = createModeState()) {
  currentModeState = modeState;

  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<Harness />);
  });

  return modeState;
}

function expectScenarioControllerArgs(modeState: ReturnType<typeof createModeState>) {
  expect(mocks.useScenarioController).toHaveBeenCalledWith({
    autoClickBlocked: true,
    captureActionRef: modeState.captureActionRef,
    navigationLockEnabled: true,
    screenshotMode: true,
    setCaptureAction: modeState.setCaptureAction,
    setIsCompletelyHidden: modeState.setIsCompletelyHidden,
    setIsToolbarVisible: modeState.setIsToolbarVisible,
    setNavigationLockEnabled: modeState.setNavigationLockEnabled,
    setScreenshotMode: modeState.setScreenshotMode,
  });
}

function expectAiAndToolbarControllerArgs(modeState: ReturnType<typeof createModeState>) {
  expect(mocks.useAiPickController).toHaveBeenCalledWith({
    aiPickMode: true,
    preloadAIModal: mocks.preloadAIModal,
    setAiPickMode: modeState.setAiPickMode,
    setHighlighterMode: modeState.setHighlighterMode,
    setQuickEditDocumentMode: modeState.setQuickEditDocumentMode,
    setQuickEditMode: modeState.setQuickEditMode,
  });
  expect(mocks.useToolbarModeController).toHaveBeenCalledWith({
    aiPickMode: true,
    designReviewMode: false,
    disableAiPickMode: expect.any(Function),
    highlighterMode: false,
    quickEditMode: true,
    setAiPickMode: modeState.setAiPickMode,
    setDesignReviewMode: modeState.setDesignReviewMode,
    setHighlighterMode: modeState.setHighlighterMode,
    setIsToolbarVisible: modeState.setIsToolbarVisible,
    setNavigationLockEnabled: modeState.setNavigationLockEnabled,
    setQuickEditDocumentMode: modeState.setQuickEditDocumentMode,
    setQuickEditMode: modeState.setQuickEditMode,
    setScreenshotMode: modeState.setScreenshotMode,
  });
}

function expectScreenshotControllerArgs(modeState: ReturnType<typeof createModeState>) {
  expect(mocks.useScreenshotController).toHaveBeenCalledWith({
    captureActionRef: modeState.captureActionRef,
    editingModes: expect.objectContaining({
      aiPickMode: true,
      disableAiPickMode: expect.any(Function),
      disableHighlighterMode: mocks.disableHighlighterMode,
      highlighterMode: false,
      quickEditMode: true,
      setHighlighterMode: modeState.setHighlighterMode,
    }),
    navigationLockEnabled: true,
    quickActionOverlayRef: modeState.quickActionOverlayRef,
    timerDelay: 5,
    capturePersistence: {
      sessionActivePresetId: 'preset-1',
      setSaveDialogState: modeState.setSaveDialogState,
    },
    scenario: {
      buildCapturePayload: mocks.scenarioController.buildManualCapturePayload,
      refreshSession: mocks.scenarioController.refreshSession,
      saveSelectionCapture: mocks.scenarioController.saveSelectionCapture,
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

function expectAutoStartArgs(modeState: ReturnType<typeof createModeState>) {
  expect(mocks.useContentScreenshotAutoStart).toHaveBeenCalledWith({
    clearPendingAutoStartCapture: modeState.clearPendingAutoStartCapture,
    handleTakeScreenshot: mocks.screenshotController.handleTakeScreenshot,
    pendingAutoStartCapture: { type: 'selection' },
    screenshotMode: true,
  });
}

function expectControllerResult() {
  expect(latestControllers?.aiController).toEqual({
    kind: 'ai-controller',
    handleAiPickContentStart: expect.any(Function),
    handleEnableAiPickMode: expect.any(Function),
  });
  expect(latestControllers?.drawingController).toBe(mocks.drawingController);
  expect(latestControllers?.modeController).toEqual({
    kind: 'drawing-mode-controller',
    handleToggleDrawingMode: expect.any(Function),
  });
  expect(latestControllers?.screenshotController).toBe(mocks.screenshotController);
  expect(latestControllers?.videoRecordingController).toBe(mocks.videoRecordingController);
}

function expectVideoRecordingControllerArgs(modeState: ReturnType<typeof createModeState>) {
  expect(mocks.useVideoRecordingSurfaceController).toHaveBeenCalledOnce();
  const args = mocks.useVideoRecordingSurfaceController.mock.calls[0]?.[0];
  args?.onModeRequested(true);
  args?.onToolbarRequested();
  expect(modeState.setVideoRecordingMode).toHaveBeenCalledWith(true);
  expect(modeState.setIsToolbarVisible).toHaveBeenCalledWith(true);
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.clearAllMocks();
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  currentModeState = null;
  latestControllers = null;
  vi.unstubAllGlobals();
});

async function expectControllerOwnerGrouping() {
  const modeState = await renderHarness();

  expectScenarioControllerArgs(modeState);
  expectAiAndToolbarControllerArgs(modeState);
  expectScreenshotControllerArgs(modeState);
  expectAutoStartArgs(modeState);
  expectVideoRecordingControllerArgs(modeState);
  expectControllerResult();
}

async function expectDisableAiPickDeferredWiring() {
  const modeState = await renderHarness();
  const toolbarArgs = mocks.useToolbarModeController.mock.calls[0]?.[0];
  const screenshotArgs = mocks.useScreenshotController.mock.calls[0]?.[0];

  toolbarArgs?.disableAiPickMode();
  screenshotArgs?.editingModes?.disableAiPickMode();

  expect(modeState.setAiPickMode).not.toHaveBeenCalled();
  expect(mocks.disableAiPickMode).toHaveBeenCalledTimes(2);
}

async function expectScreenshotQuickEditDisableResetsDocumentMode() {
  const modeState = await renderHarness();
  const screenshotArgs = mocks.useScreenshotController.mock.calls[0]?.[0];

  screenshotArgs?.editingModes?.disableQuickEditMode?.();

  expect(mocks.disableQuickEditDocumentMode).toHaveBeenCalledOnce();
  expect(mocks.disableQuickEditMode).toHaveBeenCalledOnce();
  expect(mocks.disableQuickEditDocumentMode.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.disableQuickEditMode.mock.invocationCallOrder[0] ?? 0
  );
  expect(modeState.setQuickEditDocumentMode).toHaveBeenCalledWith(false);
}

async function expectDrawingModeWiring() {
  const modeState = await renderHarness();

  expect(mocks.useContentDrawingController).toHaveBeenCalledOnce();
  expect(mocks.useDrawingModeIntegration).toHaveBeenCalledWith({
    baseModeController: { kind: 'mode-controller' },
    controller: mocks.drawingController,
    modeState,
  });
  expect(mocks.useScreenshotController).toHaveBeenCalledWith(
    expect.objectContaining({
      editingModes: expect.objectContaining({
        drawingMode: false,
        disableDrawingMode: expect.any(Function),
        setDrawingMode: modeState.setDrawingMode,
      }),
    })
  );
}

async function expectDrawingModeRestorationPreservesTool() {
  const modeState = await renderHarness();
  const screenshotArgs = mocks.useScreenshotController.mock.calls[0]?.[0];

  screenshotArgs?.editingModes.restoreEditingMode('drawing');

  expect(mocks.drawingController.prepareActivation).toHaveBeenCalledOnce();
  expect(modeState.setDrawingMode).toHaveBeenCalledWith(true);
  expect(modeState.setNavigationLockEnabled).toHaveBeenCalledWith(false);
  expect(mocks.drawingController.finalizeInteraction).not.toHaveBeenCalled();
}

async function expectAiModeRestorationUsesEnableAction() {
  await renderHarness();
  const screenshotArgs = mocks.useScreenshotController.mock.calls[0]?.[0];

  screenshotArgs?.editingModes.restoreEditingMode('ai-pick');

  expect(mocks.handleEnableAiPickMode).toHaveBeenCalledOnce();
  expect(mocks.handleAiPickContentStart).not.toHaveBeenCalled();
}

it(
  'groups controller ownership seams from mode-state into canonical controller hooks',
  expectControllerOwnerGrouping
);
it(
  'routes deferred AI disable requests through the shared logic seam',
  expectDisableAiPickDeferredWiring
);
it(
  'resets quick-edit document mode when screenshot capture disables quick edit',
  expectScreenshotQuickEditDisableResetsDocumentMode
);
it('connects Drawing to the primary content runtime controller graph', expectDrawingModeWiring);
it(
  'restores Drawing after area selection without resetting its active tool',
  expectDrawingModeRestorationPreservesTool
);
it('restores AI pick through its enable action', expectAiModeRestorationUsesEnableAction);
