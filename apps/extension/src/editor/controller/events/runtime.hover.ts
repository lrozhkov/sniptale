import type { EditorControllerEventStateBindings } from './types';

type CanvasObject = import('fabric').FabricObject;

export function createMouseMoveBeforeHandler(
  bindings: Pick<EditorControllerEventStateBindings, 'getCanvas'>
) {
  return (_event: { e: import('fabric').TPointerEvent; target?: CanvasObject }) => {
    const canvas = bindings.getCanvas();
    if (!canvas) {
      return;
    }

    canvas.defaultCursor = 'default';
  };
}
