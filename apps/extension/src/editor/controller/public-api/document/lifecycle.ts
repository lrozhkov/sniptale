import type { EditorDocument } from '../../../../features/editor/document/types';
import { closeEditorControllerDocument } from '../../document/lifecycle/close/run';
import { openEditorControllerImage } from '../../document/lifecycle/open/image/run';
import { openLoadedEditorControllerDocument } from '../../document/lifecycle/open/load/run';
import type { OpenImageOptions } from '../../core/types';
import type {
  EditorDocumentCloseLifecycleController,
  EditorDocumentOpenLifecycleController,
} from './lifecycle-controller';

export async function openEditorImageViaController(
  controller: EditorDocumentOpenLifecycleController,
  dataUrl: string,
  sourceName: string | null = null,
  options: OpenImageOptions = {}
): Promise<void> {
  await openEditorControllerImage({
    dataUrl,
    sourceName,
    openOptions: options,
    applyDocument: (document, applyOptions) => controller.applyDocument(document, applyOptions),
    scheduleZoomToFit: () => controller.scheduleZoomToFit(),
  });
}

export async function loadEditorDocumentViaController(
  controller: EditorDocumentOpenLifecycleController,
  document: EditorDocument
): Promise<void> {
  await openLoadedEditorControllerDocument({
    document,
    applyDocument: (nextDocument, applyOptions) =>
      controller.applyDocument(nextDocument, applyOptions),
    scheduleZoomToFit: () => controller.scheduleZoomToFit(),
  });
}

export function closeEditorDocumentViaController(
  controller: EditorDocumentCloseLifecycleController
): void {
  closeEditorControllerDocument({
    canvas: controller.canvas,
    zoomLevel: controller.zoomLevel,
    viewportDevicePixelRatioBaseline: controller.viewportDevicePixelRatioBaseline,
    setCanvasDocumentSize: (size) => controller.setCanvasDocumentSize(size),
    setDrawSession: (session) => controller.setDrawSession(session),
    setCropState: (cropGuide, cropSelection) => controller.setCropState(cropGuide, cropSelection),
    setSource: (source) => controller.setSource(source),
    setOriginalDocument: (document) => controller.setOriginalDocument(document),
    setHistory: (document) => controller.setHistory(document),
    setActiveTool: (tool) => controller.setActiveTool(tool),
    setZoomLevel: (zoomLevel) => controller.setZoomLevel(zoomLevel),
    setPanSession: (session) => controller.setPanSession(session),
  });
}
