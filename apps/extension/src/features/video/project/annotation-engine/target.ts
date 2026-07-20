import type { VideoAnnotationTemplate } from './types';
import type {
  AnnotationSceneResolvableClip,
  AnnotationSceneTargetGeometry,
  ResolvedAnnotationTarget,
} from './scene';
import type {
  VideoProjectAnnotationTargetPoint,
  VideoProjectAnnotationTargetRect,
} from '../types/index';

export function resolveAnnotationSceneTarget(params: {
  clip: AnnotationSceneResolvableClip;
  project: { height: number; width: number };
  targetGeometry?: AnnotationSceneTargetGeometry | undefined;
  template: VideoAnnotationTemplate;
}): ResolvedAnnotationTarget {
  const point =
    resolvePoint(params.clip, params.targetGeometry) ??
    (params.template.target.kind === 'point' ? createDefaultTargetPoint(params.project) : null);
  const rect =
    resolveRect(params.clip, params.targetGeometry) ??
    (params.template.target.kind === 'rect' ? createDefaultTargetRect(params.project) : null);

  return {
    binding: params.template.target.kind,
    normalizedPoint: normalizePoint(point, params.project),
    normalizedRect: normalizeRect(rect, params.project),
    point,
    rect,
  };
}

function createDefaultTargetPoint(project: {
  height: number;
  width: number;
}): VideoProjectAnnotationTargetPoint {
  return {
    x: Math.round(project.width * 0.5),
    y: Math.round(project.height * 0.5),
  };
}

function createDefaultTargetRect(project: {
  height: number;
  width: number;
}): VideoProjectAnnotationTargetRect {
  const width = Math.max(96, Math.round(project.width * 0.22));
  const height = Math.max(64, Math.round(project.height * 0.18));
  return {
    height,
    width,
    x: Math.round((project.width - width) / 2),
    y: Math.round((project.height - height) / 2),
  };
}

function resolvePoint(
  clip: AnnotationSceneResolvableClip,
  targetGeometry: AnnotationSceneTargetGeometry | undefined
): VideoProjectAnnotationTargetPoint | null {
  if (targetGeometry && 'point' in targetGeometry) {
    return targetGeometry.point ?? null;
  }
  return clip.targetPoint;
}

function resolveRect(
  clip: AnnotationSceneResolvableClip,
  targetGeometry: AnnotationSceneTargetGeometry | undefined
): VideoProjectAnnotationTargetRect | null {
  if (targetGeometry && 'rect' in targetGeometry) {
    return targetGeometry.rect ?? null;
  }
  return clip.targetRect;
}

function normalizePoint(
  point: VideoProjectAnnotationTargetPoint | null,
  project: { height: number; width: number }
): VideoProjectAnnotationTargetPoint | null {
  if (point === null) {
    return null;
  }
  return {
    x: normalizeDimension(point.x, project.width),
    y: normalizeDimension(point.y, project.height),
  };
}

function normalizeRect(
  rect: VideoProjectAnnotationTargetRect | null,
  project: { height: number; width: number }
): VideoProjectAnnotationTargetRect | null {
  if (rect === null) {
    return null;
  }
  return {
    height: normalizeDimension(rect.height, project.height),
    width: normalizeDimension(rect.width, project.width),
    x: normalizeDimension(rect.x, project.width),
    y: normalizeDimension(rect.y, project.height),
  };
}

function normalizeDimension(value: number, denominator: number): number {
  if (denominator <= 0) {
    return 0;
  }
  return value / denominator;
}
