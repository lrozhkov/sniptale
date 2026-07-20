import { handleEditorWindowBlur } from '../../input';
import type { EditorControllerEventCommandBindings } from '../types';

export function createRuntimeWindowBlurHandler(
  bindings: Pick<EditorControllerEventCommandBindings, 'finalizeSelectionNudge'>
) {
  return () => {
    handleEditorWindowBlur({
      finalizeSelectionNudge: () => bindings.finalizeSelectionNudge?.(),
    });
  };
}
