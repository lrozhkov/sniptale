import {
  Control,
  FabricObject,
  Point,
  controlsUtils,
  util,
  type Transform,
  type FabricObjectProps,
  type SerializedObjectProps,
  type ObjectEvents,
} from 'fabric';
import { getEditorBuiltInShapeEntry } from '../../../../features/editor/document/rich-shape';
import { isRichShapeObject } from '../../../objects/rich-shape';
import { resolveRichShapeGeometry } from '../../../objects/rich-shape/geometry-resolution';
import { renderCanvasSelectionHandle } from '../../../../ui/drawing-tools/selection-chrome';

import { isDrawingControlCaptured } from '../../../drawing/object/controls/chrome';

type Endpoint = 'start' | 'end';
type Endpoints = Record<Endpoint, Point>;

function lineEndpoints<
  Props extends Partial<FabricObjectProps>,
  SerializedProps extends SerializedObjectProps,
  Events extends ObjectEvents,
>(object: FabricObject<Props, SerializedProps, Events>): Endpoints | null {
  if (
    !isRichShapeObject(object) ||
    !['line', 'arrow', 'connector'].includes(object.sniptaleRichShape.shapeFamily)
  )
    return null;
  const geometry = resolveRichShapeGeometry(object.sniptaleRichShape);
  if (!geometry) return null;
  let start: readonly [number, number] | undefined;
  let end: readonly [number, number] | undefined;
  if (geometry.type === 'polyline' && !geometry.closed) {
    start = geometry.points[0];
    end = geometry.points.at(-1);
  } else if (geometry.type === 'path' && geometry.paths.length === 1) {
    const commands = geometry.paths[0]?.commands;
    const first = commands?.[0];
    const last = commands?.at(-1);
    if (first?.[0] === 'M') start = [first[1], first[2]];
    if (last) {
      switch (last[0]) {
        case 'M':
        case 'L':
          end = [last[1], last[2]];
          break;
        case 'Q':
          end = [last[3], last[4]];
          break;
        case 'C':
          end = [last[5], last[6]];
          break;
        case 'A':
          end = [last[6], last[7]];
          break;
        case 'Z':
          break;
      }
    }
  }
  if (!start || !end) return null;
  const local = ([x, y]: readonly [number, number]) =>
    new Point(
      ((x - geometry.viewBox.minX) / geometry.viewBox.width - 0.5) * object.width,
      ((y - geometry.viewBox.minY) / geometry.viewBox.height - 0.5) * object.height
    );
  return { start: local(start), end: local(end) };
}

/** Classifies temporary chrome from the resolved artwork, including catalog aliases. */
export function getRichShapeSelectionGeometry(object: FabricObject): 'line' | 'rectangle' | 'box' {
  if (lineEndpoints(object)) return 'line';
  if (!isRichShapeObject(object)) return 'box';
  const geometry = resolveRichShapeGeometry(object.sniptaleRichShape);
  if (geometry?.type !== 'path') return 'box';
  const commands = JSON.stringify([geometry.viewBox, geometry.paths]);
  return ['rectangle', 'rounded-rectangle'].some((id) => {
    const reference = getEditorBuiltInShapeEntry(id)?.geometry;
    return (
      reference?.type === 'path' &&
      JSON.stringify([reference.viewBox, reference.paths]) === commands
    );
  })
    ? 'rectangle'
    : 'box';
}

type EndpointGesture = {
  points: Endpoints;
  pivot: Point;
  fixed: Point;
  inverse: ReturnType<typeof util.invertTransform>;
  scaleX: number;
  scaleY: number;
  flipX: boolean;
  flipY: boolean;
};
const gestures = new WeakMap<Transform, EndpointGesture>();

function captureGesture(transform: Transform, endpoint: Endpoint): EndpointGesture | null {
  const object = transform.target;
  const points = lineEndpoints(object);
  if (!points) return null;
  const centered = transform.originX === 'center' && transform.originY === 'center';
  const pivot = centered ? new Point() : points[endpoint === 'start' ? 'end' : 'start'];
  const matrix = object.calcOwnMatrix();
  const gesture = {
    points,
    pivot,
    fixed: pivot.transform(matrix),
    inverse: util.invertTransform(matrix),
    scaleX: object.scaleX,
    scaleY: object.scaleY,
    flipX: object.flipX,
    flipY: object.flipY,
  };
  gestures.set(transform, gesture);
  return gesture;
}

function endpointAction(endpoint: Endpoint): Control['actionHandler'] {
  return controlsUtils.wrapWithFireEvent('scaling', (event, transform, x, y) => {
    const object = transform.target;
    if (object.sniptaleLocked || (object.lockScalingX && object.lockScalingY)) return false;
    const gesture = gestures.get(transform) ?? captureGesture(transform, endpoint);
    if (!gesture) return false;
    const span = gesture.points[endpoint].subtract(gesture.pivot);
    if (!span.x && !span.y) return false;
    // Fabric supplies action coordinates in the containing group's plane.
    const delta = new Point(x, y).transform(gesture.inverse).subtract(gesture.pivot);
    let ratioX = span.x ? delta.x / span.x : 1;
    let ratioY = span.y ? delta.y / span.y : 1;
    const canvas = object.canvas;
    const proportional =
      Boolean(canvas?.uniformScaling) !== Boolean(canvas?.uniScaleKey && event[canvas.uniScaleKey]);
    if (proportional) {
      if (object.lockScalingX || object.lockScalingY) return false;
      const magnitude =
        (Math.abs(delta.x * gesture.scaleX) + Math.abs(delta.y * gesture.scaleY)) /
        (Math.abs(span.x * gesture.scaleX) + Math.abs(span.y * gesture.scaleY));
      ratioX = Math.sign(ratioX) * magnitude;
      ratioY = Math.sign(ratioY) * magnitude;
    }
    if (
      !Number.isFinite(ratioX) ||
      !Number.isFinite(ratioY) ||
      (object.lockScalingFlip && (ratioX < 0 || ratioY < 0))
    )
      return false;
    const previous = {
      scaleX: object.scaleX,
      scaleY: object.scaleY,
      flipX: object.flipX,
      flipY: object.flipY,
    };
    object.set({
      ...(!object.lockScalingX ? { flipX: gesture.flipX, scaleX: gesture.scaleX * ratioX } : {}),
      ...(!object.lockScalingY ? { flipY: gesture.flipY, scaleY: gesture.scaleY * ratioY } : {}),
    });
    const fixed = gesture.pivot.transform(object.calcOwnMatrix());
    object.setPositionByOrigin(
      object.getRelativeCenterPoint().add(gesture.fixed.subtract(fixed)),
      'center',
      'center'
    );
    object.setCoords();
    object.canvas?.setCursor('grabbing');
    return (
      object.scaleX !== previous.scaleX ||
      object.scaleY !== previous.scaleY ||
      object.flipX !== previous.flipX ||
      object.flipY !== previous.flipY
    );
  });
}

function createEndpointControl(
  endpoint: Endpoint,
  points: Endpoints,
  object: FabricObject
): Control {
  const anchor = points[endpoint === 'start' ? 'end' : 'start'];
  return new Control({
    actionName: 'scale',
    cursorStyle: 'grab',
    sizeX: 22,
    sizeY: 22,
    touchSizeX: 28,
    touchSizeY: 28,
    x: points[endpoint].x / object.width,
    y: points[endpoint].y / object.height,
    transformAnchorPoint: { x: anchor.x / object.width + 0.5, y: anchor.y / object.height + 0.5 },
    mouseDownHandler: (_event, transform) => {
      transform.target.canvas?.setCursor('grabbing');
      return captureGesture(transform, endpoint) !== null;
    },
    positionHandler: (_dimensions, _matrix, object) => {
      if (!(object instanceof FabricObject)) return new Point();
      const point = lineEndpoints(object)?.[endpoint] ?? new Point();
      return point.transform(
        util.multiplyTransformMatrices(object.getViewportTransform(), object.calcTransformMatrix())
      );
    },
    actionHandler: endpointAction(endpoint),
    render: (ctx, left, top, _style, object) =>
      renderCanvasSelectionHandle(ctx, left, top, 'point', {
        color: object.cornerStrokeColor,
        active:
          isDrawingControlCaptured(object, endpoint) ||
          (!object.canvas?._currentTransform && object.__corner === endpoint),
      }),
  });
}

export function applyLineLikeRichShapeControls(object: FabricObject): void {
  const geometry = getRichShapeSelectionGeometry(object);
  if (geometry === 'rectangle') object.set({ hasBorders: false });
  if (geometry !== 'line') return;
  const points = lineEndpoints(object);
  if (!points) return;
  object.set({ hasBorders: false, lockRotation: true });
  object.controls = {
    start: createEndpointControl('start', points, object),
    end: createEndpointControl('end', points, object),
  };
}
