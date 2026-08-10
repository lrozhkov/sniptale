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
import { updateCreatedDrawingObject, type DrawingObject } from '../../../features/drawing/public';
import { readEditorDrawingObject, writeEditorDrawingObject } from './metadata';
import { createEditorDrawingFabricObject } from './vector';

type DrawingArrow = Extract<DrawingObject, { kind: 'arrow' }>;
type ArrowEndpoint = 'start' | 'end';

function toViewportPoint<
  Props extends Partial<PathProps>,
  SerializedProps extends SerializedPathProps,
  Events extends ObjectEvents,
>(object: Path<Props, SerializedProps, Events>, point: { x: number; y: number }): Point {
  return new Point(point.x, point.y)
    .subtract(object.pathOffset)
    .transform(
      util.multiplyTransformMatrices(object.getViewportTransform(), object.calcTransformMatrix())
    );
}

function toGeometryPoint<
  Props extends Partial<PathProps>,
  SerializedProps extends SerializedPathProps,
  Events extends ObjectEvents,
>(object: Path<Props, SerializedProps, Events>, x: number, y: number): Point {
  return util
    .sendPointToPlane(new Point(x, y), undefined, object.calcOwnMatrix())
    .add(object.pathOffset);
}

function toParentPoint<
  Props extends Partial<PathProps>,
  SerializedProps extends SerializedPathProps,
  Events extends ObjectEvents,
>(object: Path<Props, SerializedProps, Events>, point: { x: number; y: number }): Point {
  return new Point(point.x, point.y).subtract(object.pathOffset).transform(object.calcOwnMatrix());
}

function updateArrowPathInPlace<
  Props extends Partial<PathProps>,
  SerializedProps extends SerializedPathProps,
  Events extends ObjectEvents,
>(
  object: Path<Props, SerializedProps, Events>,
  current: DrawingArrow,
  next: DrawingArrow,
  anchor: ArrowEndpoint
): void {
  const anchorPoint = current[anchor];
  const anchorBefore = toParentPoint(object, anchorPoint);
  const geometry = createEditorDrawingFabricObject(next, 1);
  if (!(geometry instanceof Path)) return;
  object.set({
    fill: geometry.fill,
    height: geometry.height,
    path: geometry.path,
    pathOffset: geometry.pathOffset,
    stroke: geometry.stroke,
    strokeLineCap: geometry.strokeLineCap,
    strokeLineJoin: geometry.strokeLineJoin,
    strokeWidth: geometry.strokeWidth,
    width: geometry.width,
  });
  writeEditorDrawingObject(object, next);
  const anchorAfter = toParentPoint(object, next[anchor]);
  object.set({
    left: object.left + anchorBefore.x - anchorAfter.x,
    top: object.top + anchorBefore.y - anchorAfter.y,
  });
  object.setCoords();
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
      modifiers: { ctrlKey: event.ctrlKey, shiftKey: event.shiftKey },
      object: drawing,
      point,
      start: drawing.start,
      timestamp: event.timeStamp,
    }) as DrawingArrow;
  }
  const reversed: DrawingArrow = { ...drawing, start: drawing.end, end: drawing.start };
  const updated = updateCreatedDrawingObject({
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
  ctx.strokeStyle = object.cornerStrokeColor || object.borderColor || '#f97316';
  ctx.lineWidth = 1.6;
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function createArrowEndpointControl(endpoint: ArrowEndpoint): Control {
  return new Control({
    actionName: 'modifyDrawingArrow',
    cursorStyle: 'grab',
    sizeX: 20,
    sizeY: 20,
    touchSizeX: 28,
    touchSizeY: 28,
    positionHandler: (_dimensions, _matrix, object) => {
      const drawing = readEditorDrawingObject(object as FabricObject);
      return object instanceof Path && drawing?.kind === 'arrow'
        ? toViewportPoint(object, drawing[endpoint])
        : new Point(0, 0);
    },
    actionHandler: (event, transform, x, y) => {
      const object = transform.target;
      const drawing = readEditorDrawingObject(object);
      if (!(object instanceof Path) || drawing?.kind !== 'arrow') return false;
      const next = resolveMovedArrow(
        drawing,
        endpoint,
        toGeometryPoint(object, x, y),
        event as MouseEvent | PointerEvent
      );
      updateArrowPathInPlace(object, drawing, next, endpoint === 'start' ? 'end' : 'start');
      return true;
    },
    render: renderEndpoint as Control['render'],
  });
}

export function applyEditorDrawingInteractionControls(object: FabricObject): void {
  const drawing = readEditorDrawingObject(object);
  if (drawing?.kind !== 'arrow' || !(object instanceof Path)) return;
  object.controls = {
    start: createArrowEndpointControl('start'),
    end: createArrowEndpointControl('end'),
  };
  object.set({ hasBorders: false, lockRotation: true });
}
