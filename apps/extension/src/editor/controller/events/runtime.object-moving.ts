import { syncCropGuideInteraction } from './runtime.crop-guide';
import { syncSourceState } from './runtime.source-sync';
import type {
  EditorControllerEventCommandBindings,
  EditorControllerEventCropBindings,
  EditorControllerEventObjectBindings,
  EditorControllerEventStateBindings,
} from './types';

type CanvasObject = import('fabric').FabricObject;

export function createObjectMovingHandler(
  bindings: EditorControllerEventStateBindings &
    EditorControllerEventCropBindings &
    Pick<EditorControllerEventObjectBindings, 'applyGridSnap' | 'ensureObjectReachable'> &
    Pick<EditorControllerEventCommandBindings, 'syncRuntimeState'>
) {
  return (event: { target?: CanvasObject }) => {
    if (!event.target) {
      return;
    }

    bindings.applyGridSnap(event.target);
    if (syncCropGuideInteraction(bindings, event.target)) {
      bindings.getCanvas()?.requestRenderAll();
      bindings.syncRuntimeState();
      return;
    }

    if (bindings.ensureObjectReachable(event.target)) {
      syncSourceState(bindings, event.target);
      bindings.getCanvas()?.requestRenderAll();
    }
  };
}
