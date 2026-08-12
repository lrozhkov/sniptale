import { Control, controlsUtils, type FabricObject } from 'fabric';

export const DRAWING_SELECTION_ACCENT = '#2563eb';
const DRAWING_SELECTION_SURFACE = '#ffffff';

export function applyDrawingSelectionChrome(
  object: FabricObject,
  options: { controls?: boolean } = {}
): void {
  object.set({
    borderColor: DRAWING_SELECTION_ACCENT,
    borderDashArray: [4, 3],
    cornerColor: DRAWING_SELECTION_SURFACE,
    cornerStrokeColor: DRAWING_SELECTION_ACCENT,
    hasBorders: true,
    hasControls: options.controls ?? true,
    lockRotation: false,
    transparentCorners: false,
  });
}

export function renderDrawingBoxHandle(
  ctx: CanvasRenderingContext2D,
  left: number,
  top: number,
  _styleOverride: unknown,
  object: FabricObject
): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(left, top, 4, 0, Math.PI * 2);
  ctx.fillStyle = object.cornerColor || DRAWING_SELECTION_SURFACE;
  ctx.strokeStyle = object.cornerStrokeColor || object.borderColor || DRAWING_SELECTION_ACCENT;
  ctx.lineWidth = 1.6;
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function renderDrawingRotationHandle(
  ctx: CanvasRenderingContext2D,
  left: number,
  top: number,
  _styleOverride: unknown,
  object: FabricObject
): void {
  const stroke = object.cornerStrokeColor || object.borderColor || DRAWING_SELECTION_ACCENT;
  ctx.save();
  ctx.translate(left, top);
  ctx.scale(0.65, 0.65);
  ctx.translate(-12, -12);
  ctx.lineWidth = 2;
  ctx.strokeStyle = stroke;
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
  ctx.stroke();
  ctx.restore();
}

function rotateWithDrawingModifiers(
  event: Parameters<typeof controlsUtils.rotationWithSnapping>[0],
  transform: Parameters<typeof controlsUtils.rotationWithSnapping>[1],
  x: number,
  y: number
): boolean {
  const { target } = transform;
  const previousAngle = target.snapAngle;
  const previousThreshold = target.snapThreshold;
  target.snapAngle = event.ctrlKey ? 0 : event.shiftKey ? 15 : 45;
  target.snapThreshold = event.shiftKey ? 15 : 5;
  try {
    return controlsUtils.rotationWithSnapping(event, transform, x, y);
  } finally {
    if (previousAngle === undefined) delete target.snapAngle;
    else target.snapAngle = previousAngle;
    if (previousThreshold === undefined) delete target.snapThreshold;
    else target.snapThreshold = previousThreshold;
  }
}

export function createDrawingRotationControl(): Control {
  return new Control({
    actionHandler: rotateWithDrawingModifiers,
    actionName: 'rotate',
    cursorStyle: 'grab',
    cursorStyleHandler: controlsUtils.rotationStyleHandler,
    offsetX: 14,
    offsetY: -14,
    render: renderDrawingRotationHandle as Control['render'],
    sizeX: 22,
    sizeY: 22,
    withConnection: false,
    x: 0.5,
    y: -0.5,
  });
}
