import { vi } from 'vitest';

const sceneMocks = vi.hoisted(() => ({
  applyBrowserFrameForController: vi.fn(async () => undefined),
  applyCropSelectionForController: vi.fn(async () => undefined),
  applyFrameSettingsForController: vi.fn(),
  cancelCropModeForController: vi.fn(),
  clearCropSelectionForController: vi.fn(),
  navigateViewportForController: vi.fn(),
  previewBrowserFrameForController: vi.fn(async () => undefined),
  previewRemoveBrowserFrameForController: vi.fn(async () => undefined),
  removeBrowserFrameForController: vi.fn(async () => undefined),
  resetZoomForController: vi.fn(),
  resizeCanvasForController: vi.fn(),
  resizeImageForController: vi.fn(),
  scheduleZoomToFitForController: vi.fn(),
  setZoomAtViewportPointForController: vi.fn(),
  setZoomForController: vi.fn(),
  zoomInForController: vi.fn(),
  zoomOutForController: vi.fn(),
}));

export function getSceneMocks() {
  return sceneMocks;
}

vi.mock('../../instance/actions/scene', () => ({
  applyBrowserFrameForController: sceneMocks.applyBrowserFrameForController,
  applyFrameSettingsForController: sceneMocks.applyFrameSettingsForController,
  navigateViewportForController: sceneMocks.navigateViewportForController,
  previewBrowserFrameForController: sceneMocks.previewBrowserFrameForController,
  previewRemoveBrowserFrameForController: sceneMocks.previewRemoveBrowserFrameForController,
  removeBrowserFrameForController: sceneMocks.removeBrowserFrameForController,
  resetZoomForController: sceneMocks.resetZoomForController,
  resizeCanvasForController: sceneMocks.resizeCanvasForController,
  resizeImageForController: sceneMocks.resizeImageForController,
  setZoomAtViewportPointForController: sceneMocks.setZoomAtViewportPointForController,
  setZoomCenteredForController: sceneMocks.setZoomForController,
  setZoomForController: sceneMocks.setZoomForController,
  zoomInForController: sceneMocks.zoomInForController,
  zoomOutForController: sceneMocks.zoomOutForController,
  zoomToFitForController: sceneMocks.scheduleZoomToFitForController,
}));

vi.mock('../../instance/actions/crop', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../instance/actions/crop')>()),
  applyCropSelectionForController: sceneMocks.applyCropSelectionForController,
  cancelCropModeForController: sceneMocks.cancelCropModeForController,
  clearCropSelectionForController: sceneMocks.clearCropSelectionForController,
}));
