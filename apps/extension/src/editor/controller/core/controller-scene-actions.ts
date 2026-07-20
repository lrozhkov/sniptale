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

export abstract class ImageEditorControllerSceneActions extends ImageEditorControllerSelectionActions {
  resizeCanvas(width: number, height: number) {
    resizeCanvasForController(this.getControllerInstance(), width, height);
  }

  resizeImage(width: number, height: number) {
    resizeImageForController(this.getControllerInstance(), width, height);
  }

  applyFrameSettings(frame: EditorFrameSettings) {
    applyFrameSettingsForController(this.getControllerInstance(), frame);
  }

  async applyBrowserFrame(browserFrame: BrowserFrameState) {
    await applyBrowserFrameForController(this.getControllerInstance(), browserFrame);
  }

  async previewBrowserFrame(browserFrame: BrowserFrameState) {
    await previewBrowserFrameForController(this.getControllerInstance(), browserFrame);
  }

  async removeBrowserFrame() {
    await removeBrowserFrameForController(this.getControllerInstance());
  }

  async previewRemoveBrowserFrame() {
    await previewRemoveBrowserFrameForController(this.getControllerInstance());
  }

  zoomIn() {
    zoomInForController(this.getControllerInstance());
  }

  zoomOut() {
    zoomOutForController(this.getControllerInstance());
  }

  zoomToFit() {
    zoomToFitForController(this.getControllerInstance());
  }

  resetZoom() {
    resetZoomForController(this.getControllerInstance());
  }

  setZoom(value: number) {
    setZoomForController(this.getControllerInstance(), value);
  }

  setZoomAtViewportPoint(value: number, point: { clientX: number; clientY: number }) {
    setZoomAtViewportPointForController(this.getControllerInstance(), value, point);
  }

  navigateViewportTo(relativeX: number, relativeY: number) {
    navigateViewportForController(this.getControllerInstance(), relativeX, relativeY);
  }
}
