import { EditorCanvas } from '../../../document/canvas-surface/render-region';
import { handleEditorWindowBlur } from '../../input';
import { endEditorCanvasTransform } from '../../input/canvas-actions';
import type { EditorControllerEventCommandBindings } from '../types';
import type { EditorTransformCanvas } from '../../input/canvas-actions/transform';

export function createRuntimeWindowBlurHandler(
  bindings: Pick<
    EditorControllerEventCommandBindings,
    'cancelTransientInteraction' | 'finalizeSelectionNudge' | 'syncRuntimeState'
  > & { getCanvas(): EditorTransformCanvas | null }
) {
  return () => {
    let restoredTransform = false;
    handleEditorWindowBlur({
      cancelTransientInteraction: () =>
        restoredTransform ? false : bindings.cancelTransientInteraction('window-blur'),
      endCurrentTransform: () => {
        const canvas = bindings.getCanvas();
        restoredTransform = canvas instanceof EditorCanvas && Boolean(canvas._currentTransform);
        endEditorCanvasTransform(canvas);
        if (restoredTransform) bindings.syncRuntimeState();
      },
      finalizeSelectionNudge: () => bindings.finalizeSelectionNudge?.(),
    });
  };
}
