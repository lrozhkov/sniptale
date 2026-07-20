import { ImageEditorControllerBase } from './base';
import {
  applyCropSelectionForController,
  cancelCropModeForController,
  clearCanvasSizePreviewForController,
  clearCropSelectionForController,
  previewCanvasSizeForController,
} from '../instance/actions/crop';

export abstract class ImageEditorControllerCropActions extends ImageEditorControllerBase {
  setCropSelectionMouseEnabled(enabled: boolean) {
    this.cropSelectionMouseEnabled = enabled;
  }

  clearCropSelection() {
    clearCropSelectionForController(this.getControllerInstance());
  }

  previewCanvasSize(width: number, height: number) {
    previewCanvasSizeForController(this.getControllerInstance(), width, height);
  }

  clearCanvasSizePreview() {
    clearCanvasSizePreviewForController(this.getControllerInstance());
  }

  cancelCropMode() {
    cancelCropModeForController(this.getControllerInstance());
  }

  async applyCropSelection() {
    await applyCropSelectionForController(this.getControllerInstance());
  }
}
