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
  removeDrawingArrowBendAtPoint,
  type DrawingArrowBendTarget,
  type DrawingPoint,
  type DrawingObject,
} from '../../../../features/drawing/public';
import { readEditorDrawingObject, writeEditorDrawingObject } from '../metadata';
import { createEditorDrawingFabricObject } from '../vector';
import { DRAWING_SELECTION_ACCENT, isDrawingControlCaptured } from './chrome';
import { renderCanvasSelectionHandle } from '../../../../ui/drawing-tools/selection-chrome';

type DrawingArrow = Extract<DrawingObject, { kind: 'arrow' }>;
type ArrowEndpoint = 'start' | 'end';
export type EditorArrowPointSnap = (input: {
  point: DrawingPoint;
  origin: DrawingPoint;
  excludeId?: string;
  preserveAngle: boolean;
  bypass: boolean;
}) => DrawingPoint;
const pointSnappers = new WeakMap<Canvas, EditorArrowPointSnap>();

/** Bind the controller's magnet port without coupling drawing controls to controller state. */
export function bindEditorDrawingArrowSnapping(
  canvas: Canvas,
  snap: EditorArrowPointSnap
): () => void {
  pointSnappers.set(canvas, snap);
  return () => {
    if (pointSnappers.get(canvas) === snap) pointSnappers.delete(canvas);
  };
}

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

function setArrowControlAnchors(
  object: FabricObject,
  drawing: DrawingArrow,
  sceneToObject: TMat2D
): void {
  arrowControlAnchors.set(object, {
    path: object instanceof Path ? object.path : null,
    sceneToObject,
    start: new Point(drawing.start.x, drawing.start.y).transform(sceneToObject),
    end: new Point(drawing.end.x, drawing.end.y).transform(sceneToObject),
  });
}

export function syncDrawingArrowControlAnchors(object: FabricObject, drawing: DrawingArrow): void {
  const reference = object.group ? createEditorDrawingFabricObject(drawing, 1) : object;
  setArrowControlAnchors(object, drawing, util.invertTransform(reference.calcTransformMatrix()));
}

/** Maps retained drawing coordinates into the current scene without changing document metadata. */
function getArrowDrawingPlane<
  Props extends Partial<PathProps>,
  SerializedProps extends SerializedPathProps,
  Events extends ObjectEvents,
>(object: Path<Props, SerializedProps, Events>, drawing: DrawingArrow): TMat2D | null {
  if (!object.group) return null;
  if (arrowControlAnchors.get(object)?.path !== object.path)
    syncDrawingArrowControlAnchors(object, drawing);
  const anchors = arrowControlAnchors.get(object);
  return anchors
    ? util.multiplyTransformMatrices(object.calcTransformMatrix(), anchors.sceneToObject)
    : null;
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
  const plane =
    object instanceof Path && drawing?.kind === 'arrow'
      ? getArrowDrawingPlane(object, drawing)
      : null;
  const drawingPoint =
    point && plane ? new Point(point.x, point.y).transform(util.invertTransform(plane)) : point;
  const target =
    drawingPoint && drawing?.kind === 'arrow' && object instanceof Path
      ? resolveDrawingArrowBendTarget(drawing, drawingPoint, 9, (candidate) =>
          bendViewportPoint(object, candidate)
        )
      : null;
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

/** Removes one editable authored bend; the input owner publishes the history transaction. */
export function removeEditorDrawingArrowBendAtPoint(canvas: Canvas, point: DrawingPoint): boolean {
  if (
    canvas._currentTransform ||
    bendGestures.has(canvas) ||
    canvas.getActiveObjects().length !== 1
  )
    return false;
  const object = canvas.getActiveObject();
  if (!(object instanceof Path) || !object.hasControls || !object.selectable) return false;
  for (let current: FabricObject | undefined = object; current; current = current.parent) {
    if (!current.visible || current.sniptaleLocked) return false;
  }
  const drawing = readEditorDrawingObject(object);
  if (drawing?.kind !== 'arrow') return false;
  const plane = getArrowDrawingPlane(object, drawing);
  const authoredPoint = plane
    ? new Point(point.x, point.y).transform(util.invertTransform(plane))
    : point;
  const next = removeDrawingArrowBendAtPoint(drawing, authoredPoint, (candidate) =>
    bendViewportPoint(object, candidate)
  );
  if (next === drawing) return false;
  bendHover.delete(canvas);
  object.__corner = '';
  updateArrowPathInPlace(object, next);
  object.controls = createDrawingArrowControls(next);
  object.setCoords();
  canvas.requestRenderAll();
  return true;
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
  const original = readEditorDrawingObject(object);
  const plane = original?.kind === 'arrow' ? getArrowDrawingPlane(object, original) : null;
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
  if (plane && object.group) {
    const local = util.multiplyTransformMatrices(
      util.invertTransform(object.group.calcTransformMatrix()),
      util.multiplyTransformMatrices(plane, geometry.calcOwnMatrix())
    );
    util.applyTransformToObject(object, local);
    setArrowControlAnchors(object, next, util.invertTransform(geometry.calcOwnMatrix()));
  } else {
    syncDrawingArrowControlAnchors(object, next);
  }
  writeEditorDrawingObject(object, next);
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
  this: Control,
  ctx: CanvasRenderingContext2D,
  left: number,
  top: number,
  _styleOverride: unknown,
  object: FabricObject
): void {
  const key = Object.keys(object.controls).find((candidate) => object.controls[candidate] === this);
  if (key === 'bend-insert') return;
  renderCanvasSelectionHandle(ctx, left, top, 'point', {
    color: object.cornerStrokeColor || DRAWING_SELECTION_ACCENT,
    active:
      isDrawingControlCaptured(object, key) ||
      (!object.canvas?._currentTransform && key !== 'bend-insert' && object.__corner === key),
  });
}

function createArrowEndpointControl(endpoint: ArrowEndpoint): Control {
  return new Control({
    actionName: 'modifyDrawingArrow',
    cursorStyle: 'grab',
    mouseDownHandler: (_event, transform) => {
      transform.target.canvas?.setCursor('grabbing');
      return true;
    },
    sizeX: 28,
    sizeY: 28,
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
      const plane = getArrowDrawingPlane(object, drawing);
      const scene = object.group
        ? new Point(x, y).transform(object.group.calcTransformMatrix())
        : new Point(x, y);
      const pointer = plane ? scene.transform(util.invertTransform(plane)) : scene;
      const next = resolveMovedArrow(
        drawing,
        endpoint,
        pointer,
        event as MouseEvent | PointerEvent
      );
      const snap = object.canvas ? pointSnappers.get(object.canvas) : undefined;
      const point = snap?.({
        point: plane
          ? new Point(next[endpoint].x, next[endpoint].y).transform(plane)
          : next[endpoint],
        origin: plane
          ? new Point(
              next[endpoint === 'start' ? 'end' : 'start'].x,
              next[endpoint === 'start' ? 'end' : 'start'].y
            ).transform(plane)
          : next[endpoint === 'start' ? 'end' : 'start'],
        ...(object.sniptaleId ? { excludeId: object.sniptaleId } : {}),
        preserveAngle: event.shiftKey,
        bypass: event.altKey,
      });
      const snapped =
        point && plane ? new Point(point.x, point.y).transform(util.invertTransform(plane)) : point;
      updateArrowPathInPlace(object, snapped ? { ...next, [endpoint]: snapped } : next);
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
    const active = object.canvas ? bendGestures.get(object.canvas) : null;
    const inserted =
      active?.object === object && active.target.insert && active.current !== active.original;
    const currentIndex =
      index !== null && inserted && index >= active.target.index ? index + 1 : index;
    const point = currentIndex === null ? null : drawing.bendPoints?.[currentIndex];
    const hover = object.canvas ? bendHover.get(object.canvas) : null;
    return index === null
      ? hover?.object === object
        ? hover.target
        : null
      : point && currentIndex !== null
        ? { point, index: currentIndex, insert: false }
        : null;
  };
  return new Control({
    actionName: 'modifyDrawingArrowBend',
    cursorStyle: 'grab',
    sizeX: 28,
    sizeY: 28,
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
      const plane = getArrowDrawingPlane(object, drawing);
      gesture = {
        canvas: object.canvas,
        object,
        original: drawing,
        current: drawing,
        target,
        start: plane ? new Point(x, y).transform(util.invertTransform(plane)) : { x, y },
      };
      bendGestures.set(object.canvas, gesture);
      object.canvas.setCursor(target.insert ? 'grabbing' : 'none');
      return true;
    },
    actionHandler: (_event, _transform, x, y) => {
      if (!gesture || bendGestures.get(gesture.canvas) !== gesture) return false;
      gesture.canvas.setCursor(gesture.target.insert ? 'grabbing' : 'none');
      const object = gesture.object;
      const plane = object instanceof Path ? getArrowDrawingPlane(object, gesture.current) : null;
      const scene = object.group
        ? new Point(x, y).transform(object.group.calcTransformMatrix())
        : new Point(x, y);
      const pointer = plane ? scene.transform(util.invertTransform(plane)) : scene;
      const startScene = plane
        ? new Point(gesture.start.x, gesture.start.y).transform(plane)
        : gesture.start;
      const delta = { x: pointer.x - gesture.start.x, y: pointer.y - gesture.start.y };
      const moved =
        Math.hypot(scene.x - startScene.x, scene.y - startScene.y) * gesture.canvas.getZoom() >= 4;
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
        if (gesture.object.canvas === gesture.canvas) {
          gesture.object.controls = createDrawingArrowControls(gesture.current);
          gesture.object.setCoords();
        }
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
