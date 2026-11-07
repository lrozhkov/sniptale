import type {
  BrowserFrameState,
  EditorFrameSettings,
} from '../../../../features/editor/document/types';
import type { RelayoutOptions } from '../../public-actions/scene/helpers';
import { applyEditorFrameSceneSettings, resizeEditorCanvasScene } from '../../public-actions';
import { createEditorSceneMutationCallbacks } from './callbacks';
import { prepareEditorBackgroundLayer } from '../../background/sync';
import type { FrameSceneMutationOptions } from '../../public-actions/scene/resize/types';
import type { EditorSceneCanvasResizeApi, EditorSceneResizeApi } from './contracts';
import { createEditorSceneStoreBridge } from './store';
import { getSourceObject } from '../../document/layers';
import { enqueueEditorSceneMutation } from './scene-mutation-queue';

function createEditorSceneResizeArgs(controller: EditorSceneResizeApi) {
  return {
    canvas: controller.canvas,
    source: controller.source,
    store: createEditorSceneStoreBridge(),
    zoomLevel: controller.zoomLevel,
    viewportDevicePixelRatioBaseline: controller.viewportDevicePixelRatioBaseline,
    getCanvasDocumentSize: () => controller.canvasDocumentSize,
    relayoutScene: (
      frame: EditorFrameSettings,
      browserFrame: BrowserFrameState,
      options?: RelayoutOptions
    ) => controller.relayoutScene(frame, browserFrame, options),
    ...createEditorSceneMutationCallbacks(controller),
  };
}

export function resizeEditorControllerCanvas(
  controller: EditorSceneCanvasResizeApi,
  width: number,
  height: number
): void {
  resizeEditorCanvasScene({
    width,
    height,
    setCanvasDocumentSize: (size) => controller.setCanvasDocumentSize(size),
    ...createEditorSceneResizeArgs(controller),
  });
}

export function applyEditorControllerFrame(
  controller: EditorSceneResizeApi,
  frame: EditorFrameSettings,
  options: FrameSceneMutationOptions = {}
): Promise<boolean> {
  const canvas = controller.canvas;
  const sourceObject = getSourceObject(canvas);
  return enqueueEditorSceneMutation(canvas, () => {
    const isCurrent = () =>
      controller.canvas === canvas &&
      getSourceObject(canvas) === sourceObject &&
      !options.signal?.aborted;
    return applyEditorFrameSceneSettings({
      frame,
      ...createEditorSceneResizeArgs(controller),
      ...options,
      isCurrent,
      prepareBackground: (canvasSize) =>
        prepareEditorBackgroundLayer({
          canvas,
          canvasSize,
          frame,
          preview: options.preview === true && options.quality !== 'final',
          prepareObject: (object) => controller.prepareObject(object),
          isCurrent,
        }),
    });
  });
}
