import type { EditorControllerEventStateBindings } from './types';

export function createBeforeRenderHandler(
  bindings: Pick<EditorControllerEventStateBindings, 'getCanvas'>
) {
  return () => {
    const canvas = bindings.getCanvas();
    const contextTop = canvas?.contextTop;
    if (!canvas || !contextTop) {
      return;
    }

    canvas.clearContext(contextTop);
  };
}
