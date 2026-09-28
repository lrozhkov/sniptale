import type { EditorDocument } from '../../../../features/editor/document/types';
import { closeEditorControllerDocument } from '../../document/lifecycle/close/run';
import { openEditorControllerImage } from '../../document/lifecycle/open/image/run';
import { openLoadedEditorControllerDocument } from '../../document/lifecycle/open/load/run';
import type { ApplyDocumentOptions, OpenImageOptions } from '../../core/types';
import { useEditorStore } from '../../../state/useEditorStore';
import { EditorCanvas } from '../../viewport/render-region';
import type {
  EditorDocumentCloseLifecycleController,
  EditorDocumentOpenLifecycleController,
} from './lifecycle-controller';

async function applyNewDocumentWithOutsideHidden(
  controller: EditorDocumentOpenLifecycleController,
  document: EditorDocument,
  options: ApplyDocumentOptions
): Promise<void> {
  const store = useEditorStore.getState();
  const canvas = controller.canvas;

  if (canvas instanceof EditorCanvas) canvas.setShowOutsideCanvas(false);
  store.setShowOutsideCanvas(false);
  store.setCanvasCropMode('crop');
  // A failed load can leave partially replaced canvas objects behind. Keep the outside
  // region hidden until the user explicitly enables it again.
  await controller.applyDocument(document, options);
}

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
    applyDocument: (document, applyOptions) =>
      applyNewDocumentWithOutsideHidden(controller, document, applyOptions),
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
      applyNewDocumentWithOutsideHidden(controller, nextDocument, applyOptions),
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
