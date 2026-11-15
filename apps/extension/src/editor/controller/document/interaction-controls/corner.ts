import type { Control, FabricObject } from 'fabric';
import { createCornerCursorStyleHandler } from '../../../drawing/object/controls/corner-cursor';
import { DEFAULT_CORNER_CONTROLS } from './constants';
import {
  DRAWING_SELECTION_ACCENT,
  isDrawingControlCaptured,
} from '../../../drawing/object/controls/chrome';
import { renderCanvasSelectionHandle } from '../../../../ui/drawing-tools/selection-chrome';

type ControlStyleOverride = Parameters<Control['render']>[3];
const patchedCornerCursors = new WeakSet<Control>();

function createCornerControlRender(controlKey: string): Control['render'] {
  return function renderCornerControl(
    ctx: CanvasRenderingContext2D,
    left: number,
    top: number,
    _styleOverride: ControlStyleOverride | undefined,
    object: FabricObject
  ): void {
    renderCanvasSelectionHandle(ctx, left, top, 'corner', {
      color: object.cornerStrokeColor || DRAWING_SELECTION_ACCENT,
      active: isDrawingControlCaptured(object, controlKey),
    });
  };
}

export function patchCornerControl(control: Control | undefined, key: string): void {
  if (!control) {
    return;
  }

  control.sizeX = 22;
  control.sizeY = 22;
  if (!patchedCornerCursors.has(control)) {
    control.cursorStyleHandler = createCornerCursorStyleHandler(control.cursorStyleHandler);
    patchedCornerCursors.add(control);
  }
  control.render = createCornerControlRender(key);
}

export function hasDefaultBoxControls(object: FabricObject): boolean {
  return DEFAULT_CORNER_CONTROLS.every((key) => Boolean(object.controls?.[key]));
}
