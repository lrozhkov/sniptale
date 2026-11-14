import { controlsUtils, type Control, type FabricObject } from 'fabric';
import { renderCanvasRotationHandle } from '../../../../ui/drawing-tools/selection-chrome';
import { DRAWING_SELECTION_ACCENT } from '../../../drawing/object/controls/chrome';

const patchedRotateCursors = new WeakSet<Control>();

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

  if (!patchedRotateCursors.has(control)) {
    const down = control.mouseDownHandler;
    const action = control.actionHandler;
    control.cursorStyle = 'grab';
    control.cursorStyleHandler = controlsUtils.rotationStyleHandler;
    control.mouseDownHandler = function (event, transform, x, y) {
      if (!transform.target.lockRotation) transform.target.canvas?.setCursor('grabbing');
      const result: unknown = down?.call(this, event, transform, x, y);
      return result ?? true;
    };
    if (action) {
      control.actionHandler = function (event, transform, x, y) {
        if (!transform.target.lockRotation) transform.target.canvas?.setCursor('grabbing');
        return action.call(this, event, transform, x, y);
      };
    }
    patchedRotateCursors.add(control);
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
