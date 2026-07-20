import type { VideoProjectTransform } from '../../../../../features/video/project/types';

export type PreviewTransformResizeHandle = 'nw' | 'ne' | 'sw' | 'se';

interface PreviewTransformPoint {
  x: number;
  y: number;
}

const HANDLE_DIRECTION: Record<PreviewTransformResizeHandle, PreviewTransformPoint> = {
  ne: { x: 1, y: -1 },
  nw: { x: -1, y: -1 },
  se: { x: 1, y: 1 },
  sw: { x: -1, y: 1 },
};

const RESIZE_CURSORS = [
  'e-resize',
  'se-resize',
  's-resize',
  'sw-resize',
  'w-resize',
  'nw-resize',
  'n-resize',
  'ne-resize',
] as const;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function rotatePoint(point: PreviewTransformPoint, rotation: number): PreviewTransformPoint {
  const radians = toRadians(rotation);
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return {
    x: point.x * cosine - point.y * sine,
    y: point.x * sine + point.y * cosine,
  };
}

function getTransformCenter(transform: VideoProjectTransform): PreviewTransformPoint {
  return {
    x: transform.x + transform.width / 2,
    y: transform.y + transform.height / 2,
  };
}

export function getPreviewTransformHandlePoint(
  transform: VideoProjectTransform,
  handle: PreviewTransformResizeHandle
): PreviewTransformPoint {
  const center = getTransformCenter(transform);
  const direction = HANDLE_DIRECTION[handle];
  const offset = rotatePoint(
    { x: (direction.x * transform.width) / 2, y: (direction.y * transform.height) / 2 },
    transform.rotation
  );
  return { x: center.x + offset.x, y: center.y + offset.y };
}

export function isPointInsidePreviewTransform(params: {
  point: PreviewTransformPoint;
  transform: VideoProjectTransform;
}): boolean {
  const center = getTransformCenter(params.transform);
  const localPoint = rotatePoint(
    { x: params.point.x - center.x, y: params.point.y - center.y },
    -params.transform.rotation
  );
  return (
    Math.abs(localPoint.x) <= params.transform.width / 2 &&
    Math.abs(localPoint.y) <= params.transform.height / 2
  );
}

function resolveResizeAxis(params: {
  delta: number;
  direction: number;
  size: number;
  minSize: number;
}): { midpoint: number; size: number } {
  const fixed = (-params.direction * params.size) / 2;
  const dragged = (params.direction * params.size) / 2 + params.delta;
  const size = Math.max(params.minSize, params.direction * (dragged - fixed));
  const clampedDragged = fixed + params.direction * size;
  return { midpoint: (fixed + clampedDragged) / 2, size };
}

export function resizePreviewTransform(params: {
  delta: PreviewTransformPoint;
  handle: PreviewTransformResizeHandle;
  minSize: number;
  transform: VideoProjectTransform;
}): VideoProjectTransform {
  const direction = HANDLE_DIRECTION[params.handle];
  const localDelta = rotatePoint(params.delta, -params.transform.rotation);
  const horizontal = resolveResizeAxis({
    delta: localDelta.x,
    direction: direction.x,
    minSize: params.minSize,
    size: params.transform.width,
  });
  const vertical = resolveResizeAxis({
    delta: localDelta.y,
    direction: direction.y,
    minSize: params.minSize,
    size: params.transform.height,
  });
  const center = getTransformCenter(params.transform);
  const centerOffset = rotatePoint(
    { x: horizontal.midpoint, y: vertical.midpoint },
    params.transform.rotation
  );
  return {
    ...params.transform,
    height: vertical.size,
    width: horizontal.size,
    x: center.x + centerOffset.x - horizontal.size / 2,
    y: center.y + centerOffset.y - vertical.size / 2,
  };
}

export function getPreviewTransformBounds(
  transform: VideoProjectTransform
): Pick<VideoProjectTransform, 'height' | 'width' | 'x' | 'y'> {
  const corners = (Object.keys(HANDLE_DIRECTION) as PreviewTransformResizeHandle[]).map((handle) =>
    getPreviewTransformHandlePoint(transform, handle)
  );
  const horizontal = corners.map((point) => point.x);
  const vertical = corners.map((point) => point.y);
  const x = Math.min(...horizontal);
  const y = Math.min(...vertical);
  return {
    height: Math.max(...vertical) - y,
    width: Math.max(...horizontal) - x,
    x,
    y,
  };
}

function normalizeAxisRotation(rotation: number): number {
  return ((rotation % 180) + 180) % 180;
}

export function getPreviewTransformResizeCursor(
  handle: PreviewTransformResizeHandle,
  rotation: number
): (typeof RESIZE_CURSORS)[number] {
  const direction = HANDLE_DIRECTION[handle];
  const baseAngle = (Math.atan2(direction.y, direction.x) * 180) / Math.PI;
  const angle = baseAngle + normalizeAxisRotation(rotation);
  const cursorIndex =
    ((Math.round(angle / 45) % RESIZE_CURSORS.length) + RESIZE_CURSORS.length) %
    RESIZE_CURSORS.length;
  return RESIZE_CURSORS[cursorIndex]!;
}
