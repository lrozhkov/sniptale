import type { EditorDocument, EditorTool } from '../../../features/editor/document/types';
import type { EditorDocumentCommandService } from '../document-commands';
import type {
  EditorRenderedImageOptions,
  EditorRenderToDataUrlOptions,
} from '../../document/model/render-options';
import { disposeEditorController } from '../instance/actions/lifecycle/dispose';
import { mountEditorController } from '../instance/actions/lifecycle/mount';
import {
  clearSelectionForController,
  setActiveToolForController,
  suspendToolModeForController,
} from '../instance/actions/lifecycle/tool-mode';
import { ImageEditorControllerLayerActions } from './controller-layer-actions';
import type { OpenImageOptions } from './types';

export abstract class ImageEditorControllerLifecycleActions extends ImageEditorControllerLayerActions {
  protected abstract getDocumentCommandService(): EditorDocumentCommandService;

  mount(canvas: HTMLCanvasElement, viewport: HTMLElement, stage: HTMLElement) {
    mountEditorController(this.getControllerInstance(), canvas, viewport, stage);
  }

  dispose() {
    disposeEditorController(this.getControllerInstance());
  }

  async openImage(dataUrl: string, name: string | null = null, options: OpenImageOptions = {}) {
    await this.getDocumentCommandService().openImage(
      this.getControllerInstance(),
      dataUrl,
      name,
      options
    );
  }

  async loadDocument(document: EditorDocument) {
    await this.getDocumentCommandService().loadDocument(this.getControllerInstance(), document);
  }

  closeDocument() {
    this.getDocumentCommandService().closeDocument(this.getControllerInstance());
  }

  exportDocument() {
    return this.getDocumentCommandService().exportDocument(this.getControllerInstance());
  }

  renderToDataUrl(options: EditorRenderToDataUrlOptions) {
    return this.getDocumentCommandService().renderToDataUrl(this.getControllerInstance(), options);
  }

  async copyRenderedImage(options?: EditorRenderedImageOptions) {
    await this.getDocumentCommandService().copyRenderedImage(this.getControllerInstance(), options);
  }

  setActiveTool(tool: EditorTool) {
    setActiveToolForController(this.getControllerInstance(), tool);
  }

  clearSelection() {
    clearSelectionForController(this.getControllerInstance());
  }

  suspendToolMode() {
    suspendToolModeForController(this.getControllerInstance());
  }
}
