import { getEditorMovePosition, type EditorMoveEvent } from '../magnet/move-axis';
import { syncCropGuideInteraction } from './runtime.crop-guide';
import { syncSourceState } from './runtime.source-sync';
import type {
  EditorControllerEventCommandBindings,
  EditorControllerEventCropBindings,
  EditorControllerEventObjectBindings,
  EditorControllerEventStateBindings,
} from './types';

export function createObjectMovingHandler(
  bindings: EditorControllerEventStateBindings &
    EditorControllerEventCropBindings &
    Pick<EditorControllerEventObjectBindings, 'applyGridSnap'> &
    Pick<EditorControllerEventCommandBindings, 'syncRuntimeState'>
) {
  return (event: EditorMoveEvent) => {
    if (!event.target) {
      return;
    }

    const move = bindings.getCropGuide() === null ? getEditorMovePosition(event) : null;
    bindings.applyGridSnap(event.target);
    if (move?.lockedAxis) event.target.set(move.lockedAxis, move[move.lockedAxis]);
    if (syncCropGuideInteraction(bindings, event.target, 'move')) {
      bindings.getCanvas()?.requestRenderAll();
      bindings.syncRuntimeState();
      return;
    }

    syncSourceState(bindings, event.target);
  };
}
