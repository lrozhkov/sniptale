import {
  Control,
  Path,
  Point,
  util,
  type FabricObject,
  type ObjectEvents,
  type PathProps,
  type SerializedPathProps,
} from 'fabric';
import {
  updateCreatedDrawingObject,
  type DrawingObject,
} from '../../../../features/drawing/public';
import { readEditorDrawingObject, writeEditorDrawingObject } from '../metadata';
import { createEditorDrawingFabricObject } from '../vector';
import { DRAWING_SELECTION_ACCENT } from './chrome';

type DrawingArrow = Extract<DrawingObject, { kind: 'arrow' }>;
type ArrowEndpoint = 'start' | 'end';
const arrowControlAnchors = new WeakMap<FabricObject, Record<ArrowEndpoint, Point>>();

export function syncDrawingArrowControlAnchors(object: FabricObject, drawing: DrawingArrow): void {
  const sceneToObject = util.invertTransform(object.calcTransformMatrix());
  arrowControlAnchors.set(object, {
    start: new Point(drawing.start.x, drawing.start.y).transform(sceneToObject),
    end: new Point(drawing.end.x, drawing.end.y).transform(sceneToObject),
  });
}

function toViewportPoint<
  Props extends Partial<PathProps>,
  SerializedProps extends SerializedPathProps,
  Events extends ObjectEvents,
>(
  object: Path<Props, SerializedProps, Events>,
  endpoint: ArrowEndpoint,
  point: { x: number; y: number }
): Point {
  const anchor = arrowControlAnchors.get(object)?.[endpoint];
  return (anchor ?? new Point(point.x, point.y).subtract(object.pathOffset)).transform(
    util.multiplyTransformMatrices(object.getViewportTransform(), object.calcTransformMatrix())
  );
}

function updateArrowPathInPlace<
  Props extends Partial<PathProps>,
  SerializedProps extends SerializedPathProps,
  Events extends ObjectEvents,
>(object: Path<Props, SerializedProps, Events>, next: DrawingArrow): void {
  const geometry = createEditorDrawingFabricObject(next, 1);
  if (!(geometry instanceof Path)) return;
  object.set({
    fill: geometry.fill,
    height: geometry.height,
    left: geometry.left,
    path: geometry.path,
    pathOffset: geometry.pathOffset,
    stroke: geometry.stroke,
    strokeLineCap: geometry.strokeLineCap,
    strokeLineJoin: geometry.strokeLineJoin,
    strokeWidth: geometry.strokeWidth,
    top: geometry.top,
    width: geometry.width,
  });
  writeEditorDrawingObject(object, next);
  object.setCoords();
  syncDrawingArrowControlAnchors(object, next);
  object.canvas?.requestRenderAll();
}

function resolveMovedArrow(
  drawing: DrawingArrow,
  endpoint: ArrowEndpoint,
  point: Point,
  event: MouseEvent | PointerEvent
): DrawingArrow {
  if (endpoint === 'end') {
    return updateCreatedDrawingObject({
      arrowFreeAngle: true,
      modifiers: { ctrlKey: event.ctrlKey, shiftKey: event.shiftKey },
      object: drawing,
      point,
      start: drawing.start,
      timestamp: event.timeStamp,
    }) as DrawingArrow;
  }
  const reversed: DrawingArrow = { ...drawing, start: drawing.end, end: drawing.start };
  const updated = updateCreatedDrawingObject({
    arrowFreeAngle: true,
    modifiers: { ctrlKey: event.ctrlKey, shiftKey: event.shiftKey },
    object: reversed,
    point,
    start: reversed.start,
    timestamp: event.timeStamp,
  }) as DrawingArrow;
  return { ...drawing, start: updated.end };
}

function renderEndpoint(
  ctx: CanvasRenderingContext2D,
  left: number,
  top: number,
  _styleOverride: unknown,
  object: FabricObject
): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(left, top, object.__corner ? 7 : 5.5, 0, Math.PI * 2);
  ctx.fillStyle = '#f8fafc';
  ctx.strokeStyle = object.cornerStrokeColor || object.borderColor || DRAWING_SELECTION_ACCENT;
  ctx.lineWidth = 1.6;
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function createArrowEndpointControl(endpoint: ArrowEndpoint): Control {
  return new Control({
    actionName: 'modifyDrawingArrow',
    cursorStyle: 'grab',
    mouseDownHandler: (_event, transform) => {
      transform.target.canvas?.setCursor('grabbing');
      return true;
    },
    sizeX: 20,
    sizeY: 20,
    touchSizeX: 28,
    touchSizeY: 28,
    positionHandler: (_dimensions, _matrix, object) => {
      const drawing = readEditorDrawingObject(object as FabricObject);
      return object instanceof Path && drawing?.kind === 'arrow'
        ? toViewportPoint(object, endpoint, drawing[endpoint])
        : new Point(0, 0);
    },
    actionHandler: (event, transform, x, y) => {
      const object = transform.target;
      object.canvas?.setCursor('grabbing');
      const drawing = readEditorDrawingObject(object);
      if (!(object instanceof Path) || drawing?.kind !== 'arrow') return false;
      const next = resolveMovedArrow(
        drawing,
        endpoint,
        new Point(x, y),
        event as MouseEvent | PointerEvent
      );
      updateArrowPathInPlace(object, next);
      return true;
    },
    render: renderEndpoint as Control['render'],
  });
}

export function createDrawingArrowControls(): Record<string, Control> {
  return {
    start: createArrowEndpointControl('start'),
    end: createArrowEndpointControl('end'),
  };
}
