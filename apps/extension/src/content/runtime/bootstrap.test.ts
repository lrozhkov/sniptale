import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';

const browserRuntimeMocks = vi.hoisted(() => ({
  subscribeToMessages: vi.fn(),
}));

const runtimeMessagingMocks = vi.hoisted(() => ({
  sendRuntimeMessage: vi.fn(),
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

const contentRuntimeBridgeMocks = vi.hoisted(() => ({
  createContentRuntimeMessageListener: vi.fn(),
}));

const runtimeCleanupMocks = vi.hoisted(() => ({
  disableAiPickModeIfLoaded: vi.fn(),
  disableHighlighterMode: vi.fn(),
  disableQuickEditMode: vi.fn(),
  disableSelectionMode: vi.fn(),
  disableVideoAnnotations: vi.fn(),
  disableVideoTelemetry: vi.fn(),
  disposePageStyleRuntime: vi.fn(),
  hideVideoCountdown: vi.fn(),
  initializePageStyleRuntime: vi.fn(),
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
  clearFrameTooltipVisible: vi.fn(),
  disableHighlighterMode: runtimeCleanupMocks.disableHighlighterMode,
  enableHighlighterMode: vi.fn(),
  invalidateFrameCache: vi.fn(),
  isHighlighterEnabled: vi.fn(),
  isHighlighterPausedState: vi.fn(),
  pauseHighlighter: vi.fn(),
  registerFrameCallbacks: vi.fn(),
  resumeHighlighter: vi.fn(),
  setFrameEditing: vi.fn(),
  setFrameTooltipVisible: vi.fn(),
}));

vi.mock('../overlay/ai/pick/runtime/lazy', () => ({
  disableAiPickModeIfLoaded: runtimeCleanupMocks.disableAiPickModeIfLoaded,
  enableAiPickModeDeferred: vi.fn(),
  preloadAiPickRuntime: vi.fn(),
}));

vi.mock('../selection/quick-edit', () => ({
  disableQuickEditMode: runtimeCleanupMocks.disableQuickEditMode,
  disableQuickEditDocumentMode: vi.fn(),
  enableQuickEditDocumentMode: vi.fn(),
  enableQuickEditMode: vi.fn(),
  isQuickEditDocumentModeEnabled: vi.fn(),
}));

vi.mock('../selection/quick-edit/page-style', () => ({
  disposePageStyleRuntime: runtimeCleanupMocks.disposePageStyleRuntime,
  getPageStyleCurrentRuleSummary: vi.fn(),
  initializePageStyleRuntime: runtimeCleanupMocks.initializePageStyleRuntime,
  openPageStyleInspector: vi.fn(),
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

vi.mock('./bridge', () => ({
  createContentRuntimeMessageListener:
    contentRuntimeBridgeMocks.createContentRuntimeMessageListener,
}));

beforeEach(() => {
  vi.clearAllMocks();
  browserRuntimeMocks.subscribeToMessages.mockReturnValue(vi.fn());
  regionSelectorControllerMocks.createRegionSelectorController.mockReturnValue(
    regionSelectorControllerMocks.controller
  );
  contentRuntimeBridgeMocks.createContentRuntimeMessageListener.mockReturnValue(vi.fn());
  runtimeMessagingMocks.sendRuntimeMessage.mockResolvedValue({ success: false });
});

function createRuntimeServices() {
  return {
    contentActionIntent: {
      attachContentActionIntent: async <TMessage>(message: TMessage) => message,
      createBackgroundAutoStartContentActionIntentSource: vi.fn(),
      createTrustedContentActionIntentSource: vi.fn(),
    },
    messaging: {
      sendRuntimeMessage: runtimeMessagingMocks.sendRuntimeMessage,
      sendTabMessage: vi.fn(),
    },
  };
}

async function expectBootstrapSubscribesTopLevelListener() {
  const getViewportInfo = vi.fn();

  const { initializeTopLevelContentRuntime } = await import('./bootstrap');
  const cleanup = initializeTopLevelContentRuntime(getViewportInfo);

  expect(contentRuntimeBridgeMocks.createContentRuntimeMessageListener).toHaveBeenCalledWith(
    getViewportInfo,
    {
      regionSelectorController: regionSelectorControllerMocks.controller,
    }
  );
  expect(browserRuntimeMocks.subscribeToMessages).toHaveBeenCalledTimes(1);
  expect(cleanup).toBeTypeOf('function');
}

async function expectBootstrapRestoresTabCropOverlay() {
  runtimeMessagingMocks.sendRuntimeMessage
    .mockResolvedValueOnce({
      success: true,
      state: {
        captureMode: CaptureMode.TAB_CROP,
        captureSource: {
          cropRegion: { x: 10, y: 20, width: 300, height: 200 },
        },
      },
    })
    .mockResolvedValueOnce({
      success: true,
      isCurrentTab: true,
    });

  const { initializeTopLevelContentRuntime } = await import('./bootstrap');
  initializeTopLevelContentRuntime(vi.fn(), createRuntimeServices());

  await Promise.resolve();
  await Promise.resolve();

  expect(runtimeMessagingMocks.sendRuntimeMessage).toHaveBeenNthCalledWith(1, {
    type: VideoMessageType.GET_RECORDING_STATE,
  });
  expect(runtimeMessagingMocks.sendRuntimeMessage).toHaveBeenNthCalledWith(2, {
    type: VideoMessageType.GET_RECORDING_TAB_ID,
  });
  expect(regionSelectorControllerMocks.controller.showRecordingOverlay).toHaveBeenCalledWith({
    x: 10,
    y: 20,
    width: 300,
    height: 200,
  });
}

async function expectBootstrapSkipsOverlayForNonMatchingSession() {
  runtimeMessagingMocks.sendRuntimeMessage
    .mockResolvedValueOnce({
      success: true,
      state: {
        captureMode: CaptureMode.TAB,
        captureSource: {
          cropRegion: { x: 1, y: 2, width: 3, height: 4 },
        },
      },
    })
    .mockResolvedValueOnce({
      success: true,
      isCurrentTab: false,
    });

  const { initializeTopLevelContentRuntime } = await import('./bootstrap');
  initializeTopLevelContentRuntime(vi.fn(), createRuntimeServices());

  await Promise.resolve();
  await Promise.resolve();

  expect(regionSelectorControllerMocks.controller.showRecordingOverlay).not.toHaveBeenCalled();
}

async function expectBootstrapSkipsStaleOverlayRestoreAfterCleanup() {
  let resolveState: (value: unknown) => void = () => undefined;
  let resolveTab: (value: unknown) => void = () => undefined;
  runtimeMessagingMocks.sendRuntimeMessage
    .mockReturnValueOnce(
      new Promise((resolve) => {
        resolveState = resolve;
      })
    )
    .mockReturnValueOnce(
      new Promise((resolve) => {
        resolveTab = resolve;
      })
    );

  const { initializeTopLevelContentRuntime } = await import('./bootstrap');
  const cleanup = initializeTopLevelContentRuntime(vi.fn(), createRuntimeServices());
  cleanup();

  resolveState({
    success: true,
    state: {
      captureMode: CaptureMode.TAB_CROP,
      captureSource: {
        cropRegion: { x: 10, y: 20, width: 300, height: 200 },
      },
    },
  });
  resolveTab({
    success: true,
    isCurrentTab: true,
  });

  await Promise.resolve();
  await Promise.resolve();

  expect(regionSelectorControllerMocks.controller.showRecordingOverlay).not.toHaveBeenCalled();
}

describe('initializeTopLevelContentRuntime', () => {
  it(
    'subscribes the top-level content runtime listener through the browser runtime seam',
    expectBootstrapSubscribesTopLevelListener
  );
  it(
    'restores the TAB_CROP overlay for the current tab on bootstrap',
    expectBootstrapRestoresTabCropOverlay
  );
  it(
    'skips overlay restoration for non-matching recording sessions',
    expectBootstrapSkipsOverlayForNonMatchingSession
  );
  it(
    'skips stale overlay restoration after cleanup',
    expectBootstrapSkipsStaleOverlayRestoreAfterCleanup
  );
});
