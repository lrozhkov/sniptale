import { beforeEach, describe, expect, it, vi } from 'vitest';

const handleCoreModeMessage = vi.fn();
const handleViewportMessage = vi.fn();
const handleRegionOverlayMessage = vi.fn();
const createRegionOverlayBridgeDeps = vi.fn();
const handleFullPageCaptureMessage = vi.fn();
const handleVideoRecordingSurfaceSnapshotMessage = vi.fn();

vi.mock('./core', () => ({
  handleCoreModeMessage,
}));

vi.mock('./viewport', () => ({
  handleViewportMessage,
}));

vi.mock('./region-overlay', () => ({
  createRegionOverlayBridgeDeps,
  handleRegionOverlayMessage,
}));

vi.mock('./full-page-capture', () => ({
  handleFullPageCaptureMessage,
}));

vi.mock('./video-recording-surface', () => ({
  handleVideoRecordingSurfaceSnapshotMessage,
}));

function createViewportInfo() {
  return {
    devicePixelRatio: 1,
    height: 720,
    outerHeight: 900,
    outerWidth: 1440,
    scrollX: 0,
    scrollY: 0,
    width: 1280,
    x: 0,
    y: 0,
  };
}

function createRegionSelectorController() {
  return {
    hideRecordingOverlay: vi.fn(),
    hideRegionSelector: vi.fn(),
    showRecordingOverlay: vi.fn(),
    showRegionSelector: vi.fn(),
  };
}

describe('createContentRuntimeMessageHandlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createRegionOverlayBridgeDeps.mockReturnValue({ overlay: 'deps' });
    handleVideoRecordingSurfaceSnapshotMessage.mockReturnValue(null);
  });

  it('creates handler closures that delegate to each bridge owner with shared deps', async () => {
    const { createContentRuntimeMessageHandlers } = await import('./router');
    const message = { type: 'SHOW_REGION_SELECTOR' } as never;
    const sendResponse = vi.fn();
    const getViewportInfo = vi.fn(createViewportInfo);
    const regionSelectorController = createRegionSelectorController();
    const fullPageCaptureAgent = { dispose: vi.fn(), handle: vi.fn() };

    const handlers = createContentRuntimeMessageHandlers(
      message,
      sendResponse,
      getViewportInfo,
      regionSelectorController,
      fullPageCaptureAgent
    );

    expect(handlers).toHaveLength(5);
    handlers.forEach((handler) => handler());

    expect(handleVideoRecordingSurfaceSnapshotMessage).toHaveBeenCalledWith(message, sendResponse);
    expect(handleCoreModeMessage).toHaveBeenCalledWith(message);
    expect(handleViewportMessage).toHaveBeenCalledWith(
      message,
      sendResponse,
      getViewportInfo,
      regionSelectorController
    );
    expect(createRegionOverlayBridgeDeps).toHaveBeenCalledWith(regionSelectorController);
    expect(handleRegionOverlayMessage).toHaveBeenCalledWith(message, sendResponse, {
      overlay: 'deps',
    });
    expect(handleFullPageCaptureMessage).toHaveBeenCalledWith(
      message,
      sendResponse,
      fullPageCaptureAgent
    );
  });
});
