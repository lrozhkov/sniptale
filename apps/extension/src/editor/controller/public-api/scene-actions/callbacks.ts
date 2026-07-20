import type { FabricObject } from 'fabric';
import { useEditorStore } from '../../../state/useEditorStore';
import { syncEditorBackgroundLayer } from '../../background';
import type { EditorSceneMutationCallbackApi } from './contracts';

type EditorSceneMutationCallbacks = {
  commitHistory: () => void;
  ensureReachableObjects: () => boolean;
  rebuildFrameDecorations: () => Promise<void>;
  syncRuntimeState: () => void;
};

export function createEditorSceneMutationCallbacks(
  controller: EditorSceneMutationCallbackApi
): EditorSceneMutationCallbacks {
  return {
    commitHistory: () => controller.commitHistory(),
    ensureReachableObjects: () => controller.ensureReachableObjects(),
    rebuildFrameDecorations: async () => {
      await syncEditorBackgroundLayer({
        canvas: controller.canvas,
        canvasSize: controller.canvasDocumentSize,
        frame: useEditorStore.getState().frame,
        prepareObject: (object: FabricObject) => controller.prepareObject(object),
        createMutationToken: controller.createLayerMutationToken,
        isMutationTokenCurrent: controller.isLayerMutationTokenCurrent,
      });
      await controller.rebuildFrameDecorations();
    },
    syncRuntimeState: () => controller.syncRuntimeState(),
  };
}
