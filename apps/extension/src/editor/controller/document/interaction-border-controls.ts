import type { Control } from 'fabric';

const EDITOR_BORDER_RESIZE_HIT_DISTANCE = 10;
const EDITOR_BORDER_RESIZE_CORNER_GUARD = 22;
const EDITOR_EDGE_CONTROL_HIT_SIZE = 22;

export const DEFAULT_EDGE_CONTROLS = ['mt', 'mr', 'mb', 'ml'] as const;

type ControlActivationTarget = Parameters<Control['shouldActivate']>[1];
type EdgeControlKey = (typeof DEFAULT_EDGE_CONTROLS)[number];
type ScenePoint = { x: number; y: number };

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function renderHiddenEdgeControl(): void {
  // Edge resize remains targetable through Fabric controls, but the visual language stays corner-only.
}

function distanceBetweenPoints(first: ScenePoint, second: ScenePoint): number {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

function getPointToSegmentHitState(
  point: ScenePoint,
  start: ScenePoint,
  end: ScenePoint
): { distance: number; startDistance: number; endDistance: number } | null {
  const segmentX = end.x - start.x;
  const segmentY = end.y - start.y;
  const segmentLengthSquared = segmentX * segmentX + segmentY * segmentY;

  if (segmentLengthSquared <= 0) {
    return null;
  }

  const progress = clamp(
    ((point.x - start.x) * segmentX + (point.y - start.y) * segmentY) / segmentLengthSquared,
    0,
    1
  );
  const projected = {
    x: start.x + segmentX * progress,
    y: start.y + segmentY * progress,
  };

  return {
    distance: distanceBetweenPoints(point, projected),
    startDistance: distanceBetweenPoints(projected, start),
    endDistance: distanceBetweenPoints(projected, end),
  };
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

  const hitState = getPointToSegmentHitState(point, segment[0], segment[1]);

  return Boolean(
    hitState &&
    hitState.distance <= EDITOR_BORDER_RESIZE_HIT_DISTANCE &&
    hitState.startDistance >= EDITOR_BORDER_RESIZE_CORNER_GUARD &&
    hitState.endDistance >= EDITOR_BORDER_RESIZE_CORNER_GUARD
  );
}

function createEdgeControlShouldActivate(controlKey: EdgeControlKey): Control['shouldActivate'] {
  return (_controlKey, object, pointer) =>
    Object.is(object.canvas?.getActiveObject(), object) &&
    object.isControlVisible(controlKey) &&
    isPointOnResizableBorder(controlKey, object, pointer);
}

export function patchEdgeControl(control: Control | undefined, key: EdgeControlKey): void {
  if (!control) {
    return;
  }

  control.sizeX = EDITOR_EDGE_CONTROL_HIT_SIZE;
  control.sizeY = EDITOR_EDGE_CONTROL_HIT_SIZE;
  control.shouldActivate = createEdgeControlShouldActivate(key);
  control.render = renderHiddenEdgeControl;
}
