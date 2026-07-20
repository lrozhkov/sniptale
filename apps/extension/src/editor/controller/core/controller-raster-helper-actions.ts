import type { EditorRasterTargetReference } from '../raster/types';
import {
  applyRasterBitmapForController,
  clearRasterSelectionForController,
  renderRasterOverlayForController,
  subscribeRasterOverlayForController,
} from '../raster-tools/controller';
import { ImageEditorControllerInteractionHelperActions } from './controller-interaction-helper-actions';

export abstract class ImageEditorControllerRasterHelperActions extends ImageEditorControllerInteractionHelperActions {
  clearRasterSelection(): void {
    clearRasterSelectionForController(this);
  }

  subscribeRasterOverlay(listener: VoidFunction) {
    return subscribeRasterOverlayForController(this, listener);
  }

  renderRasterOverlay(context: CanvasRenderingContext2D, size: { width: number; height: number }) {
    renderRasterOverlayForController(this, context, size);
  }

  applyRasterBitmap(reference: EditorRasterTargetReference, bitmap: HTMLCanvasElement) {
    return applyRasterBitmapForController(this, reference, bitmap);
  }
}
