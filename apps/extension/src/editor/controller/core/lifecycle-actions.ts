import { flushEditorFreehandCompletion } from '../draw-workflow/released';
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
import type { OpenImageOptions, EditorDocumentOpenOptions } from './types';
import { renderEditorControllerForExport } from '../public-api';
import { runEditorDocumentTransition } from '../history/transition-queue';

export abstract class ImageEditorControllerLifecycleActions extends ImageEditorControllerLayerActions {
  protected abstract getDocumentCommandService(): EditorDocumentCommandService;

  mount(canvas: HTMLCanvasElement, viewport: HTMLElement, stage: HTMLElement) {
    flushEditorFreehandCompletion(this.canvas);
    mountEditorController(this.getControllerInstance(), canvas, viewport, stage);
  }

  dispose() {
    flushEditorFreehandCompletion(this.canvas);
    disposeEditorController(this.getControllerInstance());
  }

  async openImage(dataUrl: string, name: string | null = null, options: OpenImageOptions = {}) {
    flushEditorFreehandCompletion(this.canvas);
    const controller = this.getControllerInstance();
    await runEditorDocumentTransition(controller.canvas ?? controller.history ?? controller, () =>
      this.getDocumentCommandService().openImage(controller, dataUrl, name, options)
    );
  }

  async loadDocument(document: EditorDocument, options?: EditorDocumentOpenOptions) {
    flushEditorFreehandCompletion(this.canvas);
    const controller = this.getControllerInstance();
    await runEditorDocumentTransition(controller.canvas ?? controller.history ?? controller, () =>
      options
        ? this.getDocumentCommandService().loadDocument(controller, document, options)
        : this.getDocumentCommandService().loadDocument(controller, document)
    );
  }

  closeDocument() {
    flushEditorFreehandCompletion(this.canvas);
    this.getDocumentCommandService().closeDocument(this.getControllerInstance());
  }

  exportDocument() {
    flushEditorFreehandCompletion(this.canvas);
    return this.getDocumentCommandService().exportDocument(this.getControllerInstance());
  }

  isDocumentReadyForExport() {
    const controller = this.getControllerInstance();
    return controller.canvas !== null && controller.source !== null;
  }

  renderToDataUrl(options: EditorRenderToDataUrlOptions) {
    flushEditorFreehandCompletion(this.canvas);
    return this.getDocumentCommandService().renderToDataUrl(this.getControllerInstance(), options);
  }

  async renderForExport(
    options: EditorRenderToDataUrlOptions,
    draftPolicy: 'finalize' | 'committed' = 'finalize'
  ) {
    flushEditorFreehandCompletion(this.canvas);
    return renderEditorControllerForExport(this.getControllerInstance(), options, draftPolicy);
  }

  async copyRenderedImage(options?: EditorRenderedImageOptions) {
    flushEditorFreehandCompletion(this.canvas);
    await this.getDocumentCommandService().copyRenderedImage(this.getControllerInstance(), options);
  }

  setActiveTool(tool: EditorTool) {
    flushEditorFreehandCompletion(this.canvas);
    setActiveToolForController(this.getControllerInstance(), tool);
  }

  clearSelection() {
    flushEditorFreehandCompletion(this.canvas);
    clearSelectionForController(this.getControllerInstance());
  }

  suspendToolMode() {
    flushEditorFreehandCompletion(this.canvas);
    suspendToolModeForController(this.getControllerInstance());
  }
}
