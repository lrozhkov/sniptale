import type { VideoProject, VideoProjectMotionArea } from '../types/index';

const MIN_FOCUS_AREA_SIZE = 48;

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
