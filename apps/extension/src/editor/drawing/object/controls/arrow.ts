import {
  Control,
  Path,
  Point,
  util,
  type FabricObject,
  type ObjectEvents,
  type PathProps,
  type SerializedPathProps,
  type Canvas,
  type TMat2D,
} from 'fabric';
import {
  updateCreatedDrawingObject,
  resolveDrawingArrowBendTarget,
  updateDrawingArrowBend,
  type DrawingArrowBendTarget,
  type DrawingPoint,
  type DrawingObject,
} from '../../../../features/drawing/public';
import { readEditorDrawingObject, writeEditorDrawingObject } from '../metadata';
import { createEditorDrawingFabricObject } from '../vector';
import { DRAWING_SELECTION_ACCENT } from './chrome';

type DrawingArrow = Extract<DrawingObject, { kind: 'arrow' }>;
type ArrowEndpoint = 'start' | 'end';
const arrowControlAnchors = new WeakMap<
  FabricObject,
  Record<ArrowEndpoint, Point> & { path: Path['path'] | null; sceneToObject: TMat2D }
>();
const bendHover = new WeakMap<Canvas, { object: FabricObject; target: DrawingArrowBendTarget }>();
type ArrowBendGesture = {
  canvas: Canvas;
  object: FabricObject;
  original: DrawingArrow;
  current: DrawingArrow;
  target: DrawingArrowBendTarget;
  start: DrawingPoint;
};
const bendGestures = new WeakMap<object, ArrowBendGesture>();

export function syncDrawingArrowControlAnchors(object: FabricObject, drawing: DrawingArrow): void {
  const sceneToObject = util.invertTransform(object.calcTransformMatrix());
  arrowControlAnchors.set(object, {
    path: object instanceof Path ? object.path : null,
    sceneToObject,
    start: new Point(drawing.start.x, drawing.start.y).transform(sceneToObject),
    end: new Point(drawing.end.x, drawing.end.y).transform(sceneToObject),
  });
}

function bendViewportPoint<
  Props extends Partial<PathProps>,
  SerializedProps extends SerializedPathProps,
  Events extends ObjectEvents,
>(object: Path<Props, SerializedProps, Events>, point: DrawingPoint): Point {
  const anchors = arrowControlAnchors.get(object);
  const local = anchors
    ? new Point(point.x, point.y).transform(anchors.sceneToObject)
    : new Point(point.x, point.y).subtract(object.pathOffset);
  return local.transform(
    util.multiplyTransformMatrices(object.getViewportTransform(), object.calcTransformMatrix())
  );
}

/** Updates disposable insertion chrome through the existing canvas pointer owner. */
export function updateEditorDrawingArrowHover(canvas: Canvas, point: DrawingPoint | null): void {
  if (bendGestures.has(canvas) || canvas._currentTransform) return;
  const object = canvas.getActiveObject();
  const drawing = object instanceof Path ? readEditorDrawingObject(object) : null;
  const target =
    point && drawing?.kind === 'arrow' ? resolveDrawingArrowBendTarget(drawing, point) : null;
  const previous = bendHover.get(canvas);
  if (target?.insert && object) bendHover.set(canvas, { object, target });
  else bendHover.delete(canvas);
  if (target) canvas.setCursor('grab');
  if (previous || target?.insert) {
    if (previous?.object !== object) previous?.object.setCoords();
    object?.setCoords();
    canvas.requestRenderAll();
  }
}

/** Cancels only this owner's live bend transaction, using the canvas as its identity. */
export function cancelEditorDrawingArrowBend(canvas: object | null): boolean {
  if (!canvas) return false;
  const gesture = bendGestures.get(canvas);
  if (!gesture) return false;
  bendGestures.delete(canvas);
  bendHover.delete(gesture.canvas);
  if (gesture.object instanceof Path) updateArrowPathInPlace(gesture.object, gesture.original);
  gesture.object.controls = createDrawingArrowControls(gesture.original);
  gesture.object.setCoords();
  const transform = gesture.canvas._currentTransform;
  if (transform?.target === gesture.object) {
    transform.actionPerformed = false;
    gesture.canvas.endCurrentTransform();
  }
  gesture.canvas.setCursor(gesture.canvas.defaultCursor);
  return true;
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
  if (arrowControlAnchors.get(object)?.path !== object.path) {
    const drawing = readEditorDrawingObject(object);
    if (drawing?.kind === 'arrow') syncDrawingArrowControlAnchors(object, drawing);
  }
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

function createArrowBendControl(index: number | null): Control {
  let gesture: ArrowBendGesture | null = null;
  const targetAt = (object: FabricObject): DrawingArrowBendTarget | null => {
    const drawing = readEditorDrawingObject(object);
    if (drawing?.kind !== 'arrow' || drawing.design !== 'freehand') return null;
    const point = index === null ? null : drawing.bendPoints?.[index];
    const hover = object.canvas ? bendHover.get(object.canvas) : null;
    return index === null
      ? hover?.object === object
        ? hover.target
        : null
      : point
        ? { point, index, insert: false }
        : null;
  };
  return new Control({
    actionName: 'modifyDrawingArrowBend',
    cursorStyle: 'grab',
    sizeX: 18,
    sizeY: 18,
    touchSizeX: 28,
    touchSizeY: 28,
    getVisibility: (object) => object instanceof Path && targetAt(object) !== null,
    positionHandler: (_dimensions, _matrix, object) => {
      if (!(object instanceof Path)) return new Point(0, 0);
      const drawing = readEditorDrawingObject(object);
      const point =
        gesture && bendGestures.get(gesture.canvas) === gesture
          ? drawing?.kind === 'arrow'
            ? (drawing.bendPoints?.[gesture.target.index] ?? gesture.target.point)
            : null
          : targetAt(object)?.point;
      return point ? bendViewportPoint(object, point) : new Point(0, 0);
    },
    mouseDownHandler: (_event, transform, x, y) => {
      const object = transform.target;
      const drawing = readEditorDrawingObject(object);
      const target = targetAt(object);
      if (!(object instanceof Path) || !object.canvas || drawing?.kind !== 'arrow' || !target)
        return false;
      gesture = {
        canvas: object.canvas,
        object,
        original: drawing,
        current: drawing,
        target,
        start: { x, y },
      };
      bendGestures.set(object.canvas, gesture);
      object.canvas.setCursor('none');
      return true;
    },
    actionHandler: (_event, _transform, x, y) => {
      if (!gesture || bendGestures.get(gesture.canvas) !== gesture) return false;
      gesture.canvas.setCursor('none');
      const delta = { x: x - gesture.start.x, y: y - gesture.start.y };
      const moved = Math.hypot(delta.x, delta.y) * gesture.canvas.getZoom() >= 4;
      const next = moved
        ? updateDrawingArrowBend(gesture.original, gesture.target, {
            x: gesture.target.point.x + delta.x,
            y: gesture.target.point.y + delta.y,
          })
        : gesture.original;
      if (gesture.current === next) return false;
      gesture.current = next;
      if (gesture.object instanceof Path) updateArrowPathInPlace(gesture.object, next);
      return moved;
    },
    mouseUpHandler: () => {
      if (!gesture) return false;
      if (bendGestures.get(gesture.canvas) === gesture) {
        bendGestures.delete(gesture.canvas);
        bendHover.delete(gesture.canvas);
        gesture.canvas.setCursor('grab');
      }
      gesture = null;
      return true;
    },
    render: renderEndpoint as Control['render'],
  });
}

export function createDrawingArrowControls(drawing?: DrawingArrow): Record<string, Control> {
  const controls: Record<string, Control> = {
    start: createArrowEndpointControl('start'),
    end: createArrowEndpointControl('end'),
  };
  if (drawing?.design === 'freehand') {
    drawing.bendPoints?.forEach((_point, index) => {
      controls[`bend-${index}`] = createArrowBendControl(index);
    });
    controls['bend-insert'] = createArrowBendControl(null);
  }
  return controls;
}
