import type {
  BrowserFrameState,
  EditorFrameSettings,
} from '../../../../features/editor/document/types';
import { relayoutEditorControllerScene } from '../../browser-frame/document';
import type { EditorControllerInstance } from '../types';

export function relayoutSceneForController(
  controller: EditorControllerInstance,
  frame: EditorFrameSettings,
  browserFrame: BrowserFrameState,
  options: {
    canvasSize?: { width: number; height: number };
    sourceSize?: { width: number; height: number };
    preserveCanvasSize?: boolean;
    fitSourceToContent?: boolean;
  } = {}
): void {
  const nextScene = relayoutEditorControllerScene({
    canvas: controller.canvas,
    source: controller.source,
    canvasDocumentSize: controller.canvasDocumentSize,
    frame,
    browserFrame,
    sceneOptions: options,
  });
  if (!nextScene) {
    return;
  }

  controller.source = nextScene.source;
  controller.canvasDocumentSize = nextScene.canvasSize;
}
