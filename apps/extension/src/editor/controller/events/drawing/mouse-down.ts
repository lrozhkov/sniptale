import type { FabricObject, TPointerEvent as PointerEvent } from 'fabric';
import {
  clearActiveAnnotationSelection as clearSelection,
  isTargetInCurrentSelection as isSelectedTarget,
} from '../drawing.helpers';
import { handleDrawingMouseDownTool } from '../drawing-mouse-down/handler';
import type { DrawingMouseDownEvent } from '../drawing-mouse-down/types';
import { isSecondaryButton } from './secondary-button';
import type { DrawingEventBindings } from './types';

export function createMouseDownBeforeHandler(bindings: DrawingEventBindings) {
  return (event: { e: PointerEvent; target?: FabricObject }) => {
    const canvas = bindings.getCanvas();
    const source = bindings.getSource();
    if (!canvas || !source || isSecondaryButton(event.e)) {
      return;
    }

    const activeTool = bindings.getActiveTool();
    if (activeTool !== 'pencil' && activeTool !== 'highlighter') {
      return;
    }

    if (isSelectedTarget(canvas, event.target)) {
      return;
    }

    clearSelection(canvas, () => bindings.syncRuntimeState());
  };
}

export function createMouseDownHandler(bindings: DrawingEventBindings) {
  return (event: DrawingMouseDownEvent) => {
    const canvas = bindings.getCanvas();
    const source = bindings.getSource();
    if (!canvas || !source || isSecondaryButton(event.e)) {
      return;
    }

    handleDrawingMouseDownTool(bindings, canvas, event);
  };
}
