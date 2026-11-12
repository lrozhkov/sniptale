import type { Control, FabricObject } from 'fabric';
import { renderCanvasRotationHandle } from '../../../../ui/drawing-tools/selection-chrome';
import { DRAWING_SELECTION_ACCENT } from '../../../drawing/object/controls/chrome';

type ControlStyleOverride = Parameters<Control['render']>[3];

function renderRotateControl(
  this: Control,
  ctx: CanvasRenderingContext2D,
  left: number,
  top: number,
  _styleOverride: ControlStyleOverride | undefined,
  object: FabricObject
): void {
  renderCanvasRotationHandle(ctx, left, top, object.cornerStrokeColor || DRAWING_SELECTION_ACCENT);
}

export function patchRotateControl(control: Control | undefined): void {
  if (!control) {
    return;
  }

  control.sizeX = 28;
  control.sizeY = 28;
  control.x = 0.5;
  control.y = -0.5;
  control.offsetX = 20;
  control.offsetY = -20;
  control.withConnection = false;
  control.render = renderRotateControl;
}
