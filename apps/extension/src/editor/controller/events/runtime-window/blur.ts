import { handleEditorWindowBlur } from '../../input';
import { endEditorCanvasTransform } from '../../input/canvas-actions';
import type { EditorControllerEventCommandBindings } from '../types';
import type { EditorTransformCanvas } from '../../input/canvas-actions/transform';

export function createRuntimeWindowBlurHandler(
  bindings: Pick<
    EditorControllerEventCommandBindings,
    'cancelTransientInteraction' | 'finalizeSelectionNudge'
  > & { getCanvas(): EditorTransformCanvas | null }
) {
  return () => {
    handleEditorWindowBlur({
      cancelTransientInteraction: bindings.cancelTransientInteraction,
      endCurrentTransform: () => endEditorCanvasTransform(bindings.getCanvas()),
      finalizeSelectionNudge: () => bindings.finalizeSelectionNudge?.(),
    });
  };
}
