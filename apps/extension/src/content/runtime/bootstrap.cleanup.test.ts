import { beforeEach, expect, it, vi } from 'vitest';

const browserRuntimeMocks = vi.hoisted(() => ({
  subscribeToMessages: vi.fn(),
}));

const regionSelectorControllerMocks = vi.hoisted(() => ({
  controller: {
    dispose: vi.fn(),
    hideRecordingOverlay: vi.fn(),
    hideRegionSelector: vi.fn(),
    showRecordingOverlay: vi.fn(),
    showRegionSelector: vi.fn(),
  },
  createRegionSelectorController: vi.fn(),
}));

const runtimeCleanupMocks = vi.hoisted(() => ({
  disableAiPickModeIfLoaded: vi.fn(),
  disableHighlighterMode: vi.fn(),
  disableQuickEditMode: vi.fn(),
  disableSelectionMode: vi.fn(),
  disableVideoAnnotations: vi.fn(),
  disableVideoTelemetry: vi.fn(),
  disposeViewportCursorProjection: vi.fn(),
  hideVideoCountdown: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/runtime')>()),
  browserRuntime: {
    subscribeToMessages: browserRuntimeMocks.subscribeToMessages,
  },
}));

vi.mock('../selection/region-selector', () => ({
  createRegionSelectorController: regionSelectorControllerMocks.createRegionSelectorController,
}));

vi.mock('../selection/highlighter', () => ({
  clearAllHighlights: vi.fn(),
  clearFrameEditing: vi.fn(),
  disableHighlighterMode: runtimeCleanupMocks.disableHighlighterMode,
  enableHighlighterMode: vi.fn(),
  invalidateFrameCache: vi.fn(),
  isHighlighterEnabled: vi.fn(),
  isHighlighterPausedState: vi.fn(),
  pauseHighlighter: vi.fn(),
  registerFrameCallbacks: vi.fn(),
  resumeHighlighter: vi.fn(),
  setFrameEditing: vi.fn(),
}));

vi.mock('../overlay/ai/pick/runtime/lazy', () => ({
  disableAiPickModeIfLoaded: runtimeCleanupMocks.disableAiPickModeIfLoaded,
  enableAiPickModeDeferred: vi.fn(),
  preloadAiPickRuntime: vi.fn(),
}));

vi.mock('../selection/quick-edit', () => ({
  disableQuickEditDocumentMode: vi.fn(),
  disableQuickEditMode: runtimeCleanupMocks.disableQuickEditMode,
  enableQuickEditDocumentMode: vi.fn(),
  enableQuickEditMode: vi.fn(),
  isQuickEditDocumentModeEnabled: vi.fn(),
}));

vi.mock('../selection/selection-mode', () => ({
  disableSelectionMode: runtimeCleanupMocks.disableSelectionMode,
  enableSelectionMode: vi.fn(),
}));

vi.mock('../overlay/video-countdown', () => ({
  hideVideoCountdown: runtimeCleanupMocks.hideVideoCountdown,
  showVideoCountdown: vi.fn(),
}));

vi.mock('../overlay/video-annotations', () => ({
  VideoAnnotationsController: undefined,
  VideoAnnotationsControllerDeps: undefined,
  createVideoAnnotationsController: vi.fn(),
  disableVideoAnnotations: runtimeCleanupMocks.disableVideoAnnotations,
  enableVideoAnnotations: vi.fn(),
}));

vi.mock('../overlay/video-telemetry', () => ({
  disableVideoTelemetry: runtimeCleanupMocks.disableVideoTelemetry,
  enableVideoTelemetry: vi.fn(),
  pauseVideoTelemetry: vi.fn(),
  resumeVideoTelemetry: vi.fn(),
}));

vi.mock('../overlay/viewport-cursor-projection', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../overlay/viewport-cursor-projection')>()),
  disposeViewportCursorProjection: runtimeCleanupMocks.disposeViewportCursorProjection,
}));

vi.mock('./bridge', () => ({
  createContentRuntimeMessageListener: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  browserRuntimeMocks.subscribeToMessages.mockReturnValue(vi.fn());
  regionSelectorControllerMocks.createRegionSelectorController.mockReturnValue(
    regionSelectorControllerMocks.controller
  );
});

function createRuntimeServices() {
  return {
    contentActionIntent: {
      attachContentActionIntent: async <TMessage>(message: TMessage) => message,
      createBackgroundAutoStartContentActionIntentSource: vi.fn(),
      createTrustedContentActionIntentSource: vi.fn(),
    },
    messaging: {
      sendRuntimeMessage: vi.fn().mockResolvedValue({ success: false }),
      sendTabMessage: vi.fn(),
    },
  };
}

function expectRuntimeDisposersRan(): void {
  expect(runtimeCleanupMocks.disableHighlighterMode).toHaveBeenCalledTimes(1);
  expect(runtimeCleanupMocks.disableQuickEditMode).toHaveBeenCalledTimes(1);
  expect(runtimeCleanupMocks.disableAiPickModeIfLoaded).toHaveBeenCalledTimes(1);
  expect(runtimeCleanupMocks.disableSelectionMode).toHaveBeenCalledTimes(1);
  expect(runtimeCleanupMocks.hideVideoCountdown).toHaveBeenCalledTimes(1);
  expect(runtimeCleanupMocks.disableVideoAnnotations).toHaveBeenCalledTimes(1);
  expect(runtimeCleanupMocks.disableVideoTelemetry).toHaveBeenCalledTimes(1);
  expect(runtimeCleanupMocks.disposeViewportCursorProjection).toHaveBeenCalledTimes(1);
  expect(regionSelectorControllerMocks.controller.dispose).toHaveBeenCalledTimes(1);
}

it('cleans up the runtime listener and singleton content resources', async () => {
  const unsubscribe = vi.fn();
  browserRuntimeMocks.subscribeToMessages.mockReturnValue(unsubscribe);

  const { initializeTopLevelContentRuntime } = await import('./bootstrap');
  const cleanup = initializeTopLevelContentRuntime(vi.fn(), createRuntimeServices());
  cleanup();

  expect(unsubscribe).toHaveBeenCalledTimes(1);
  expectRuntimeDisposersRan();
});

it('continues cleanup when a runtime disposer throws', async () => {
  const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const unsubscribe = vi.fn();
  browserRuntimeMocks.subscribeToMessages.mockReturnValue(unsubscribe);
  runtimeCleanupMocks.disableHighlighterMode.mockImplementationOnce(() => {
    throw new Error('highlighter cleanup failed');
  });

  try {
    const { initializeTopLevelContentRuntime } = await import('./bootstrap');
    const cleanup = initializeTopLevelContentRuntime(vi.fn(), createRuntimeServices());

    expect(() => cleanup()).not.toThrow();
  } finally {
    consoleWarn.mockRestore();
  }

  expect(unsubscribe).toHaveBeenCalledTimes(1);
  expectRuntimeDisposersRan();
});
