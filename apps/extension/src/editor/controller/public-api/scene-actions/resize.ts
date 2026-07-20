import type {
  BrowserFrameState,
  EditorFrameSettings,
} from '../../../../features/editor/document/types';
import type { RelayoutOptions } from '../../public-actions/scene/helpers';
import { applyEditorFrameSceneSettings, resizeEditorCanvasScene } from '../../public-actions';
import { createEditorSceneMutationCallbacks } from './callbacks';
import type { EditorSceneCanvasResizeApi, EditorSceneResizeApi } from './contracts';
import { createEditorSceneStoreBridge } from './store';

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
  frame: EditorFrameSettings
): void {
  applyEditorFrameSceneSettings({
    frame,
    ...createEditorSceneResizeArgs(controller),
  });
}
