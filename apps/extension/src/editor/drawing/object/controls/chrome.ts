import { Control, controlsUtils, type FabricObject } from 'fabric';
import { DEFAULT_COLOR_CANVAS_SELECTION } from '@sniptale/ui/default-colors/constants';
import {
  renderCanvasSelectionHandle,
  renderCanvasRotationHandle,
} from '../../../../ui/drawing-tools/selection-chrome';

export const DRAWING_SELECTION_ACCENT = DEFAULT_COLOR_CANVAS_SELECTION;
const DRAWING_SELECTION_SURFACE = '#ffffff';

/** Capture identity is stable even when Fabric updates its hover control. */
export function isDrawingControlCaptured(
  object: Pick<FabricObject, 'canvas'>,
  key: string | undefined
): boolean {
  const transform = object.canvas?._currentTransform;
  return Boolean(key && transform?.target === object && transform.corner === key);
}

export function applyDrawingSelectionChrome(
  object: FabricObject,
  options: { controls?: boolean } = {}
): void {
  object.set({
    borderColor: DRAWING_SELECTION_ACCENT,
    borderDashArray: null,
    cornerColor: DRAWING_SELECTION_SURFACE,
    cornerStrokeColor: DRAWING_SELECTION_ACCENT,
    hasBorders: true,
    hasControls: options.controls ?? true,
    lockRotation: false,
    transparentCorners: false,
  });
}

export function renderDrawingBoxHandle(
  this: Control,
  ctx: CanvasRenderingContext2D,
  left: number,
  top: number,
  _styleOverride: unknown,
  object: FabricObject
): void {
  const kind = this.x === 0 ? 'horizontal' : this.y === 0 ? 'vertical' : 'corner';
  renderCanvasSelectionHandle(ctx, left, top, kind, {
    color: object.cornerStrokeColor || DRAWING_SELECTION_ACCENT,
    active: isDrawingControlCaptured(
      object,
      Object.keys(object.controls).find((key) => object.controls[key] === this)
    ),
  });
}

function renderDrawingRotationHandle(
  ctx: CanvasRenderingContext2D,
  left: number,
  top: number,
  _styleOverride: unknown,
  object: FabricObject
): void {
  renderCanvasRotationHandle(ctx, left, top, object.cornerStrokeColor || DRAWING_SELECTION_ACCENT);
}

function rotateWithDrawingModifiers(
  event: Parameters<typeof controlsUtils.rotationWithSnapping>[0],
  transform: Parameters<typeof controlsUtils.rotationWithSnapping>[1],
  x: number,
  y: number
): boolean {
  const { target } = transform;
  target.canvas?.setCursor('grabbing');
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
    mouseDownHandler: (_event, transform) => {
      if (!transform.target.lockRotation) transform.target.canvas?.setCursor('grabbing');
      return true;
    },
    offsetX: 20,
    offsetY: -20,
    render: renderDrawingRotationHandle as Control['render'],
    sizeX: 28,
    sizeY: 28,
    withConnection: false,
    x: 0.5,
    y: -0.5,
  });
}
