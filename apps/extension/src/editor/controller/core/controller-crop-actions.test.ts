import { describe, expect, it, vi } from 'vitest';

const cropMocks = vi.hoisted(() => ({
  applyCropSelectionForController: vi.fn(async () => undefined),
  cancelCropModeForController: vi.fn(),
  clearCanvasSizePreviewForController: vi.fn(),
  clearCropSelectionForController: vi.fn(),
  previewCanvasSizeForController: vi.fn(),
}));

vi.mock('../instance/actions/crop', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../instance/actions/crop')>()),
  ...cropMocks,
}));

import { createImageEditorController, ImageEditorController } from './controller';

describe('ImageEditorControllerCropActions', () => {
  it('creates the concrete editor controller with the controller instance seam', () => {
    expect(createImageEditorController()).toBeInstanceOf(ImageEditorController);
  });

  it('delegates crop and canvas preview actions through the instance seam', async () => {
    const controller = new ImageEditorController();

    controller.setCropSelectionMouseEnabled(false);
    controller.clearCropSelection();
    controller.previewCanvasSize(320, 240);
    controller.clearCanvasSizePreview();
    controller.cancelCropMode();
    await controller.applyCropSelection();

    expect((controller as { cropSelectionMouseEnabled: boolean }).cropSelectionMouseEnabled).toBe(
      false
    );
    expect(cropMocks.clearCropSelectionForController).toHaveBeenCalledWith(controller);
    expect(cropMocks.previewCanvasSizeForController).toHaveBeenCalledWith(controller, 320, 240);
    expect(cropMocks.clearCanvasSizePreviewForController).toHaveBeenCalledWith(controller);
    expect(cropMocks.cancelCropModeForController).toHaveBeenCalledWith(controller);
    expect(cropMocks.applyCropSelectionForController).toHaveBeenCalledWith(controller);
  });
});
