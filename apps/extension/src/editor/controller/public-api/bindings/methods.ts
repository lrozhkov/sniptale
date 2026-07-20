import type { FabricObject } from 'fabric';
import type {
  BrowserFrameState,
  EditorDocument,
  EditorFrameSettings,
  EditorObjectType,
} from '../../../../features/editor/document/types';
import type { ApplyDocumentOptions } from '../../core/types';
import type {
  EditorRenderedImageOptions,
  EditorRenderToDataUrlOptions,
} from '../../../document/model/render-options';
import type { EditorControllerInstance } from '../../instance/types';

export function createEditorControllerPublicApiMethods(controller: EditorControllerInstance) {
  return {
    prepareObject: (object: FabricObject) => controller.prepareObject(object),
    nextLabelIndex: (type: EditorObjectType) => controller.nextLabelIndex(type),
    commitHistory: () => controller.commitHistory(),
    syncRuntimeState: () => controller.syncRuntimeState(),
    ensureObjectReachable: (object: FabricObject) => controller.ensureObjectReachable(object),
    focusObjectInViewport: (object: FabricObject) => controller.focusObjectInViewport(object),
    ensureReachableObjects: () => controller.ensureReachableObjects(),
    rebuildFrameDecorations: () => controller.rebuildFrameDecorations(),
    sendFrameObjectsToBack: () => controller.sendFrameObjectsToBack(),
    ensureBrowserFrameOnTop: () => controller.ensureBrowserFrameOnTop(),
    logBrowserFrame: (stage: string, payload?: Record<string, unknown>) =>
      controller.logBrowserFrame(stage, payload),
    relayoutScene: (
      frame: EditorFrameSettings,
      browserFrame: BrowserFrameState,
      options?: {
        canvasSize?: { width: number; height: number };
        sourceSize?: { width: number; height: number };
        preserveCanvasSize?: boolean;
        fitSourceToContent?: boolean;
      }
    ) => controller.relayoutScene(frame, browserFrame, options),
    scheduleZoomToFit: () => controller.scheduleZoomToFit(),
    applyDocument: (document: EditorDocument, options: ApplyDocumentOptions) =>
      controller.applyDocument(document, options),
    renderToDataUrl: (options: EditorRenderToDataUrlOptions) => controller.renderToDataUrl(options),
    copyRenderedImage: (options?: EditorRenderedImageOptions) =>
      controller.copyRenderedImage(options),
    switchToSelectTool: () => controller.switchToSelectTool(),
    clearSelection: () => controller.clearSelection(),
    clearCropSelection: () => controller.clearCropSelection(),
  };
}
