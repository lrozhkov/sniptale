import { flushEditorFreehandCompletion } from '../draw-workflow/released';
import type { FrameSceneMutationOptions } from '../public-actions/scene/resize/types';
import type {
  BrowserFrameState,
  EditorFrameSettings,
} from '../../../features/editor/document/types';
import {
  applyBrowserFrameForController,
  applyFrameSettingsForController,
  navigateViewportForController,
  previewBrowserFrameForController,
  previewRemoveBrowserFrameForController,
  removeBrowserFrameForController,
  resetZoomForController,
  resizeCanvasForController,
  resizeImageForController,
  setZoomAtViewportPointForController,
  setZoomForController,
  zoomInForController,
  zoomOutForController,
  zoomToFitForController,
} from '../instance/actions/scene';
import { ImageEditorControllerSelectionActions } from './controller-selection-actions';
import { reportEditorActionFailure } from '../../runtime/async-actions';

export abstract class ImageEditorControllerSceneActions extends ImageEditorControllerSelectionActions {
  resizeCanvas(width: number, height: number) {
    flushEditorFreehandCompletion(this.canvas);
    resizeCanvasForController(this.getControllerInstance(), width, height);
  }

  resizeImage(width: number, height: number) {
    flushEditorFreehandCompletion(this.canvas);
    resizeImageForController(this.getControllerInstance(), width, height);
  }

  /** Resolve true after application; cancellation or authoritative scene replacement resolves false. */
  applyFrameSettings(
    frame: EditorFrameSettings,
    options?: FrameSceneMutationOptions
  ): Promise<boolean> {
    flushEditorFreehandCompletion(this.canvas);
    const mutation =
      options === undefined
        ? applyFrameSettingsForController(this.getControllerInstance(), frame)
        : applyFrameSettingsForController(this.getControllerInstance(), frame, options);
    if (options === undefined) {
      void Promise.resolve(mutation).catch((error) =>
        reportEditorActionFailure('scene-mutation', error)
      );
    }
    return mutation;
  }

  async applyBrowserFrame(browserFrame: BrowserFrameState) {
    flushEditorFreehandCompletion(this.canvas);
    await applyBrowserFrameForController(this.getControllerInstance(), browserFrame);
  }

  async previewBrowserFrame(browserFrame: BrowserFrameState) {
    flushEditorFreehandCompletion(this.canvas);
    await previewBrowserFrameForController(this.getControllerInstance(), browserFrame);
  }

  async removeBrowserFrame() {
    flushEditorFreehandCompletion(this.canvas);
    await removeBrowserFrameForController(this.getControllerInstance());
  }

  async previewRemoveBrowserFrame() {
    flushEditorFreehandCompletion(this.canvas);
    await previewRemoveBrowserFrameForController(this.getControllerInstance());
  }

  zoomIn() {
    flushEditorFreehandCompletion(this.canvas);
    zoomInForController(this.getControllerInstance());
  }

  zoomOut() {
    flushEditorFreehandCompletion(this.canvas);
    zoomOutForController(this.getControllerInstance());
  }

  zoomToFit() {
    flushEditorFreehandCompletion(this.canvas);
    zoomToFitForController(this.getControllerInstance());
  }

  resetZoom() {
    flushEditorFreehandCompletion(this.canvas);
    resetZoomForController(this.getControllerInstance());
  }

  setZoom(value: number) {
    flushEditorFreehandCompletion(this.canvas);
    setZoomForController(this.getControllerInstance(), value);
  }

  setZoomAtViewportPoint(value: number, point: { clientX: number; clientY: number }) {
    flushEditorFreehandCompletion(this.canvas);
    setZoomAtViewportPointForController(this.getControllerInstance(), value, point);
  }

  navigateViewportTo(relativeX: number, relativeY: number) {
    flushEditorFreehandCompletion(this.canvas);
    navigateViewportForController(this.getControllerInstance(), relativeX, relativeY);
  }
}
