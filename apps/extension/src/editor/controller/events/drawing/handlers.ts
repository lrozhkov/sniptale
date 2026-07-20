import type { EditorControllerEventHandlers as Handlers } from '../types';
import { createMouseDownBeforeHandler, createMouseDownHandler } from './mouse-down';
import { createMouseMoveHandler } from './mouse-move';
import { createMouseUpHandler } from './mouse-up';
import { createPathCreatedHandler } from './path-created';
import type { DrawingEventBindings } from './types';

export function createDrawingEventHandlers(
  bindings: DrawingEventBindings
): Pick<
  Handlers,
  | 'handlePathCreated'
  | 'handleMouseDownBefore'
  | 'handleMouseDown'
  | 'handleMouseMove'
  | 'handleMouseUp'
> {
  return {
    handlePathCreated: createPathCreatedHandler(bindings),
    handleMouseDownBefore: createMouseDownBeforeHandler(bindings),
    handleMouseDown: createMouseDownHandler(bindings),
    handleMouseMove: createMouseMoveHandler(bindings),
    handleMouseUp: createMouseUpHandler(bindings),
  };
}
