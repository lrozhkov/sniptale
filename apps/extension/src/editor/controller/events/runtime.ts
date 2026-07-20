import {
  createRuntimeDoubleClickHandler,
  createRuntimeWindowBlurHandler,
  createRuntimeWindowKeyDownHandler,
  createRuntimeWindowKeyUpHandler,
} from './runtime.window';
import { createBeforeRenderHandler } from './runtime.canvas';
import { createAfterRenderHandler } from './runtime.render';
import { createSelectionChangeHandler } from './runtime.selection';
import { createObjectMovingHandler } from './runtime.object-moving';
import { createObjectModifiedHandler } from './runtime.object-modified';
import { createObjectScalingHandler } from './runtime.object-scaling';
import { createMouseMoveBeforeHandler } from './runtime.hover';
import type { EditorControllerEventBindings, EditorControllerEventHandlers } from './types';

export function createRuntimeEventHandlers(
  bindings: EditorControllerEventBindings
): Pick<
  EditorControllerEventHandlers,
  | 'handleCanvasBeforeRender'
  | 'handleCanvasAfterRender'
  | 'handleSelectionChange'
  | 'handleMouseMoveBefore'
  | 'handleObjectMoving'
  | 'handleObjectResizing'
  | 'handleObjectScaling'
  | 'handleObjectModified'
  | 'handleDoubleClick'
  | 'handleWindowKeyDown'
  | 'handleWindowKeyUp'
  | 'handleWindowBlur'
> {
  return {
    handleCanvasBeforeRender: createBeforeRenderHandler(bindings),
    handleCanvasAfterRender: createAfterRenderHandler(bindings),
    handleSelectionChange: createSelectionChangeHandler(bindings),
    handleMouseMoveBefore: createMouseMoveBeforeHandler(bindings),
    handleObjectMoving: createObjectMovingHandler(bindings),
    handleObjectResizing: createObjectScalingHandler(bindings),
    handleObjectScaling: createObjectScalingHandler(bindings),
    handleObjectModified: createObjectModifiedHandler(bindings),
    handleDoubleClick: createRuntimeDoubleClickHandler(bindings),
    handleWindowKeyDown: createRuntimeWindowKeyDownHandler(bindings),
    handleWindowKeyUp: createRuntimeWindowKeyUpHandler(bindings),
    handleWindowBlur: createRuntimeWindowBlurHandler(bindings),
  };
}
