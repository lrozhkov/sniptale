import { flushEditorFreehandCompletion } from '../draw-workflow/released';
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
    flushEditorFreehandCompletion(this.canvas);
    this.cropSelectionMouseEnabled = enabled;
  }

  clearCropSelection() {
    flushEditorFreehandCompletion(this.canvas);
    clearCropSelectionForController(this.getControllerInstance());
  }

  previewCanvasSize(width: number, height: number) {
    flushEditorFreehandCompletion(this.canvas);
    previewCanvasSizeForController(this.getControllerInstance(), width, height);
  }

  clearCanvasSizePreview() {
    flushEditorFreehandCompletion(this.canvas);
    clearCanvasSizePreviewForController(this.getControllerInstance());
  }

  cancelCropMode() {
    flushEditorFreehandCompletion(this.canvas);
    cancelCropModeForController(this.getControllerInstance());
  }

  async applyCropSelection() {
    flushEditorFreehandCompletion(this.canvas);
    await applyCropSelectionForController(this.getControllerInstance());
  }
}
