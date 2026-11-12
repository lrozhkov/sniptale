import { Point, util, type Control } from 'fabric';
import { isDrawingControlCaptured } from '../../drawing/object/controls/chrome';
import { renderCanvasSelectionHandle } from '../../../ui/drawing-tools/selection-chrome';

const EDITOR_EDGE_CONTROL_HIT_SIZE = 22;

export const DEFAULT_EDGE_CONTROLS = ['mt', 'mr', 'mb', 'ml'] as const;

type ControlActivationTarget = Parameters<Control['shouldActivate']>[1];
type EdgeControlKey = (typeof DEFAULT_EDGE_CONTROLS)[number];
type ScenePoint = { x: number; y: number };

function renderHiddenEdgeControl(): void {
  // Edge resize remains targetable through Fabric controls, but the visual language stays corner-only.
}

export function isEditorHiddenEdgeControl(control: Control | undefined): boolean {
  return control?.render === renderHiddenEdgeControl;
}

function distanceBetweenPoints(first: ScenePoint, second: ScenePoint): number {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

function getEdgeSegment(
  controlKey: EdgeControlKey,
  coords: ScenePoint[]
): [ScenePoint, ScenePoint] | null {
  const [topLeft, topRight, bottomRight, bottomLeft] = coords;

  if (!topLeft || !topRight || !bottomRight || !bottomLeft) {
    return null;
  }

  switch (controlKey) {
    case 'mt':
      return [topLeft, topRight];
    case 'mr':
      return [topRight, bottomRight];
    case 'mb':
      return [bottomLeft, bottomRight];
    case 'ml':
      return [topLeft, bottomLeft];
  }
}

function isPointOnResizableBorder(
  controlKey: EdgeControlKey,
  object: ControlActivationTarget,
  point: ScenePoint
): boolean {
  const segment = getEdgeSegment(controlKey, object.getCoords());

  if (!segment) {
    return false;
  }

  const center = { x: (segment[0].x + segment[1].x) / 2, y: (segment[0].y + segment[1].y) / 2 };
  const transform = object.canvas?.viewportTransform;
  const canvasZoom = transform ? Math.hypot(transform[0], transform[1]) : 1;
  const canvas = object.canvas;
  const cssScale =
    canvas && canvas.getWidth?.() > 0
      ? (canvas.upperCanvasEl?.getBoundingClientRect().width || canvas.getWidth()) /
        canvas.getWidth()
      : 1;
  const hitDistance = distanceBetweenPoints(point, center);
  const corners = object.getCoords();
  const candidates = [
    ...corners,
    ...corners.map((corner, index) => {
      const next = corners[(index + 1) % corners.length]!;
      return { x: (corner.x + next.x) / 2, y: (corner.y + next.y) / 2 };
    }),
  ];
  return (
    hitDistance <= 11 / (canvasZoom * cssScale) &&
    candidates.every((candidate) => hitDistance <= distanceBetweenPoints(point, candidate) + 1e-6)
  );
}

function createEdgeControlShouldActivate(controlKey: EdgeControlKey): Control['shouldActivate'] {
  return (_controlKey, object, pointer) => {
    const canvas = object.canvas;
    if (!canvas || canvas.getActiveObject() !== object || !object.isControlVisible(controlKey)) {
      return false;
    }
    const scenePoint = new Point(pointer.x, pointer.y).transform(
      util.invertTransform(canvas.viewportTransform)
    );
    return isPointOnResizableBorder(controlKey, object, scenePoint);
  };
}

export function patchEdgeControl(
  control: Control | undefined,
  key: EdgeControlKey,
  hidden = false
): void {
  if (!control) {
    return;
  }

  control.sizeX = EDITOR_EDGE_CONTROL_HIT_SIZE;
  control.sizeY = EDITOR_EDGE_CONTROL_HIT_SIZE;
  control.shouldActivate = createEdgeControlShouldActivate(key);
  control.render = hidden
    ? renderHiddenEdgeControl
    : function (ctx, left, top, _override, object) {
        renderCanvasSelectionHandle(
          ctx,
          left,
          top,
          key === 'ml' || key === 'mr' ? 'vertical' : 'horizontal',
          {
            color: object.cornerStrokeColor || '#2563eb',
            active: isDrawingControlCaptured(object, key),
          }
        );
      };
}
