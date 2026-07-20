import type { EditorFrameSettings } from '../../../../features/editor/document/types';
import { syncEditorBackgroundLayer } from '../../background';
import type { EditorControllerInstance } from '../types';

export async function syncBackgroundLayerForController(
  controller: EditorControllerInstance,
  frame: EditorFrameSettings,
  canvasSize: { width: number; height: number }
): Promise<void> {
  await syncEditorBackgroundLayer({
    canvas: controller.canvas,
    canvasSize,
    frame,
    prepareObject: (object) => controller.prepareObject(object),
    createMutationToken: () => {
      controller.layerMutationToken += 1;
      return controller.layerMutationToken;
    },
    isMutationTokenCurrent: (token) => controller.layerMutationToken === token,
  });
}
