import type {
  VideoProject,
  VideoProjectMotionArea,
} from '../../features/video/project/types/index';

export interface StagePoint {
  x: number;
  y: number;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function getProjectCenter(project: Pick<VideoProject, 'height' | 'width'>): StagePoint {
  return {
    x: project.width / 2,
    y: project.height / 2,
  };
}

export function clampStagePoint(
  project: Pick<VideoProject, 'height' | 'width'>,
  point: StagePoint
): StagePoint {
  return {
    x: clampNumber(point.x, 0, project.width),
    y: clampNumber(point.y, 0, project.height),
  };
}

export function createSquareArea(anchor: StagePoint, current: StagePoint): VideoProjectMotionArea {
  const width = Math.max(48, Math.abs(current.x - anchor.x));
  const height = Math.max(48, Math.abs(current.y - anchor.y));
  return {
    height,
    width,
    x: current.x >= anchor.x ? anchor.x : anchor.x - width,
    y: current.y >= anchor.y ? anchor.y : anchor.y - height,
  };
}

export function buildDraggedArea(
  area: VideoProjectMotionArea,
  deltaX: number,
  deltaY: number,
  mode: 'move' | 'resize'
): VideoProjectMotionArea {
  return mode === 'move'
    ? { ...area, x: area.x + deltaX, y: area.y + deltaY }
    : { ...area, width: area.width + deltaX, height: area.height + deltaY };
}
