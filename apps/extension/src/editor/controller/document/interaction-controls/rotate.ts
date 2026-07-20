import type { Control, FabricObject } from 'fabric';
import { EDITOR_ROTATE_CONTROL_SIZE, EDITOR_ROTATE_CONTROL_SIZE_HOVER } from './constants';
import { isActiveControl } from './base';

type ControlStyleOverride = Parameters<Control['render']>[3];

function renderRotateControl(
  this: Control,
  ctx: CanvasRenderingContext2D,
  left: number,
  top: number,
  _styleOverride: ControlStyleOverride | undefined,
  object: FabricObject
): void {
  const size = isActiveControl(object, 'mtr')
    ? EDITOR_ROTATE_CONTROL_SIZE_HOVER
    : EDITOR_ROTATE_CONTROL_SIZE;
  const iconScale = size / 24;
  const strokeColor = object.cornerStrokeColor || object.borderColor || '#f97316';

  ctx.save();
  ctx.translate(left, top);
  ctx.scale(iconScale, iconScale);
  ctx.translate(-12, -12);
  ctx.lineWidth = 2;
  ctx.strokeStyle = strokeColor;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.arc(12, 12, 9, Math.PI, Math.PI * 1.75);
  ctx.lineTo(21, 8);
  ctx.moveTo(21, 3);
  ctx.lineTo(21, 8);
  ctx.lineTo(16, 8);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(12, 12, 9, 0, Math.PI * 0.75);
  ctx.lineTo(3, 16);
  ctx.moveTo(8, 16);
  ctx.lineTo(3, 16);
  ctx.lineTo(3, 21);
  ctx.lineTo(8, 16);
  ctx.stroke();
  ctx.restore();
}

export function patchRotateControl(control: Control | undefined): void {
  if (!control) {
    return;
  }

  control.sizeX = EDITOR_ROTATE_CONTROL_SIZE_HOVER;
  control.sizeY = EDITOR_ROTATE_CONTROL_SIZE_HOVER;
  control.offsetY = -32;
  control.withConnection = false;
  control.render = renderRotateControl;
}
