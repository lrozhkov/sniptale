import {
  isRect,
  isRecord,
  isBoundedNumber,
  MAX_VIDEO_PROJECT_DIMENSION,
} from '../validation/primitives';
import type { VideoProject, VideoProjectMotionArea } from '../types/index';

const MIN_FOCUS_AREA_SIZE = 48;
/** Area coordinates use the parser's existing project-coordinate envelope. */
export const MAX_MOTION_AREA_COORDINATE = MAX_VIDEO_PROJECT_DIMENSION * 4;

type ProjectFrame = Pick<VideoProject, 'height' | 'width'>;

export function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function getProjectCenter(project: ProjectFrame) {
  return {
    x: project.width / 2,
    y: project.height / 2,
  };
}

export function clampFocusAreaSize(maxSize: number, nextSize: number): number {
  return clampNumber(
    Number.isFinite(nextSize) ? nextSize : MIN_FOCUS_AREA_SIZE,
    Math.min(MIN_FOCUS_AREA_SIZE, maxSize),
    Math.max(MIN_FOCUS_AREA_SIZE, maxSize)
  );
}

export function clampFocusAreaOrigin(origin: number, size: number, projectSize: number): number {
  return clampNumber(Number.isFinite(origin) ? origin : 0, 0, Math.max(0, projectSize - size));
}

export function normalizeMotionFocusArea(
  project: ProjectFrame,
  focusArea: VideoProjectMotionArea | null | undefined
): VideoProjectMotionArea | null {
  if (!focusArea) {
    return null;
  }
  if (focusArea.axes !== undefined) return isMotionFocusArea(focusArea) ? { ...focusArea } : null;

  const width = clampFocusAreaSize(project.width, focusArea.width);
  const height = clampFocusAreaSize(project.height, focusArea.height);

  return {
    height,
    width,
    x: clampFocusAreaOrigin(focusArea.x, width, project.width),
    y: clampFocusAreaOrigin(focusArea.y, height, project.height),
  };
}

export function normalizeMotionPoint(project: ProjectFrame, x: number, y: number) {
  return {
    x: clampNumber(Number.isFinite(x) ? x : project.width / 2, 0, project.width),
    y: clampNumber(Number.isFinite(y) ? y : project.height / 2, 0, project.height),
  };
}

/** Validate the existing rectangle plus optional finite, independent unit edge directions. */
export function isMotionFocusArea(value: unknown): value is VideoProjectMotionArea {
  if (!isRect(value)) return false;
  if (!('axes' in value) || value.axes === undefined) return true;
  const axes = value.axes;
  if (!isRecord(axes) || Object.keys(axes).some((key) => key !== 'x' && key !== 'y')) return false;
  const unit = (point: unknown): point is { x: number; y: number } =>
    isRecord(point) &&
    Object.keys(point).every((key) => key === 'x' || key === 'y') &&
    isBoundedNumber(point['x'], -1, 1) &&
    isBoundedNumber(point['y'], -1, 1) &&
    Math.abs(Math.hypot(point['x'], point['y']) - 1) <= 1e-9;
  return (
    unit(axes['x']) &&
    unit(axes['y']) &&
    Math.abs(axes['x'].x * axes['y'].y - axes['x'].y * axes['y'].x) > 1e-9
  );
}

/** Resolve a point in the area, retaining its edge directions in the current authoring plane. */
export function motionFocusAreaPoint(area: VideoProjectMotionArea, x: number, y: number) {
  const axes = area.axes ?? { x: { x: 1, y: 0 }, y: { x: 0, y: 1 } };
  return {
    x: area.x + axes.x.x * x * area.width + axes.y.x * y * area.height,
    y: area.y + axes.x.y * x * area.width + axes.y.y * y * area.height,
  };
}

/** Bounds size camera fitting only; the authored rectangle retains all four actual corners. */
export function motionFocusAreaBounds(area: VideoProjectMotionArea) {
  const points = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ].map(([x, y]) => motionFocusAreaPoint(area, x!, y!));
  const x = Math.min(...points.map((point) => point.x)),
    y = Math.min(...points.map((point) => point.y));
  return {
    x,
    y,
    width: Math.max(...points.map((point) => point.x)) - x,
    height: Math.max(...points.map((point) => point.y)) - y,
  };
}

/** Fit the selected shape to the camera's existing axis-aligned viewport. */
export function motionFocusAreaScale(project: ProjectFrame, area: VideoProjectMotionArea) {
  const bounds = motionFocusAreaBounds(area);
  return Math.min(
    4,
    Math.max(
      1,
      Math.min(
        project.width / Math.max(1, bounds.width),
        project.height / Math.max(1, bounds.height)
      )
    )
  );
}

/** Invert a pointer displacement without translating its origin. */
export function motionFocusAreaDelta(
  area: VideoProjectMotionArea,
  delta: { x: number; y: number }
) {
  if (!area.axes) return delta;
  const { x, y } = area.axes;
  const determinant = x.x * y.y - x.y * y.x;
  return {
    x: (delta.x * y.y - delta.y * y.x) / determinant,
    y: (delta.y * x.x - delta.x * x.y) / determinant,
  };
}

/** Resize a converted area along its own edges and keep the opposite corner fixed. */
export function resizeOrientedMotionArea(
  area: VideoProjectMotionArea,
  corner: 'nw' | 'ne' | 'sw' | 'se',
  delta: { x: number; y: number }
) {
  const local = motionFocusAreaDelta(area, delta);
  const west = corner.endsWith('w'),
    north = corner.startsWith('n');
  const width = clampNumber(
    area.width + (west ? -local.x : local.x),
    Math.min(1, area.width),
    MAX_MOTION_AREA_COORDINATE
  );
  const height = clampNumber(
    area.height + (north ? -local.y : local.y),
    Math.min(1, area.height),
    MAX_MOTION_AREA_COORDINATE
  );
  const origin = motionFocusAreaPoint(
    area,
    west ? 1 - width / area.width : 0,
    north ? 1 - height / area.height : 0
  );
  return { ...area, ...origin, width, height };
}
