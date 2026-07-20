import { isVisualClip } from '../../../../features/video/project/timeline';
import type {
  VideoProject,
  VideoProjectClip,
  VideoProjectTransform,
} from '../../../../features/video/project/types/index';
import { getPreviewTransformBounds } from './transform/geometry';

export interface PreviewStageGuide {
  axis: 'x' | 'y';
  position: number;
}

export interface PreviewStageSnapSettings {
  gridEnabled: boolean;
  gridSize: number;
  gridSnapEnabled: boolean;
  magnetEnabled: boolean;
}

export const DEFAULT_PREVIEW_STAGE_SNAP_SETTINGS: PreviewStageSnapSettings = {
  gridEnabled: false,
  gridSize: 80,
  gridSnapEnabled: false,
  magnetEnabled: false,
};

type Rect = Pick<VideoProjectTransform, 'height' | 'width' | 'x' | 'y'>;

const MAGNET_THRESHOLD = 8;

function roundToGrid(value: number, gridSize: number): number {
  return Math.round(value / gridSize) * gridSize;
}

function getRectAnchors(rect: Rect, axis: 'x' | 'y'): number[] {
  if (axis === 'x') {
    return [rect.x, rect.x + rect.width / 2, rect.x + rect.width];
  }

  return [rect.y, rect.y + rect.height / 2, rect.y + rect.height];
}

function getSceneTargets(project: VideoProject, axis: 'x' | 'y'): number[] {
  const size = axis === 'x' ? project.width : project.height;
  return [0, size / 2, size];
}

function getSiblingTargets(project: VideoProject, clipId: string, axis: 'x' | 'y'): number[] {
  return project.clips
    .filter((clip) => clip.id !== clipId && isVisualClip(clip))
    .flatMap((clip) => getRectAnchors(getPreviewTransformBounds(clip.transform), axis));
}

function resolveAxisMagnetOffset(params: {
  anchors: number[];
  targets: number[];
}): { guide: number; offset: number } | null {
  let best: { guide: number; offset: number; distance: number } | null = null;

  for (const anchor of params.anchors) {
    for (const target of params.targets) {
      const offset = target - anchor;
      const distance = Math.abs(offset);
      if (distance <= MAGNET_THRESHOLD && (!best || distance < best.distance)) {
        best = { guide: target, offset, distance };
      }
    }
  }

  return best ? { guide: best.guide, offset: best.offset } : null;
}

function snapRectToGrid(
  rect: Rect,
  settings: PreviewStageSnapSettings,
  mode: 'move' | 'resize'
): Rect {
  if (!settings.gridEnabled || !settings.gridSnapEnabled) {
    return rect;
  }

  const gridSize = Math.max(1, settings.gridSize);
  const next = {
    ...rect,
    x: roundToGrid(rect.x, gridSize),
    y: roundToGrid(rect.y, gridSize),
  };
  if (mode === 'resize') {
    next.width = Math.max(40, roundToGrid(rect.width, gridSize));
    next.height = Math.max(40, roundToGrid(rect.height, gridSize));
  }

  return next;
}

export function snapClipTransform(params: {
  clip: VideoProjectClip;
  project: VideoProject;
  mode: 'move' | 'resize';
  settings: PreviewStageSnapSettings;
  transform: VideoProjectTransform;
}): { guides: PreviewStageGuide[]; transform: VideoProjectTransform } {
  const gridRect = snapRectToGrid(params.transform, params.settings, params.mode);
  if (!params.settings.magnetEnabled) {
    return { guides: [], transform: { ...params.transform, ...gridRect } };
  }

  const guides: PreviewStageGuide[] = [];
  const next = { ...params.transform, ...gridRect };
  const visualBounds = getPreviewTransformBounds(params.transform);
  const xMagnet = resolveAxisMagnetOffset({
    anchors: getRectAnchors(visualBounds, 'x'),
    targets: [
      ...getSceneTargets(params.project, 'x'),
      ...getSiblingTargets(params.project, params.clip.id, 'x'),
    ],
  });
  const yMagnet = resolveAxisMagnetOffset({
    anchors: getRectAnchors(visualBounds, 'y'),
    targets: [
      ...getSceneTargets(params.project, 'y'),
      ...getSiblingTargets(params.project, params.clip.id, 'y'),
    ],
  });

  if (xMagnet) {
    next.x = params.transform.x + xMagnet.offset;
    guides.push({ axis: 'x', position: xMagnet.guide });
  }
  if (yMagnet) {
    next.y = params.transform.y + yMagnet.offset;
    guides.push({ axis: 'y', position: yMagnet.guide });
  }

  return { guides, transform: next };
}

export function snapStagePoint(params: {
  point: { x: number; y: number };
  project: VideoProject;
  settings: PreviewStageSnapSettings;
}): { guides: PreviewStageGuide[]; point: { x: number; y: number } } {
  const gridSize = Math.max(1, params.settings.gridSize);
  const next = { ...params.point };
  const guides: PreviewStageGuide[] = [];

  if (params.settings.gridEnabled && params.settings.gridSnapEnabled) {
    next.x = roundToGrid(next.x, gridSize);
    next.y = roundToGrid(next.y, gridSize);
  }
  if (!params.settings.magnetEnabled) {
    return { guides, point: next };
  }

  for (const axis of ['x', 'y'] as const) {
    const magnet = resolveAxisMagnetOffset({
      anchors: [params.point[axis]],
      targets: getSceneTargets(params.project, axis),
    });
    if (magnet) {
      next[axis] = params.point[axis] + magnet.offset;
      guides.push({ axis, position: magnet.guide });
    }
  }

  return { guides, point: next };
}
