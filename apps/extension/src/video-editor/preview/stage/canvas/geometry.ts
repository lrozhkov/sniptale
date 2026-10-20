import type { CSSProperties } from 'react';
import { motionCameraProjection } from '../../../../features/video/composition/motion/spatial';
import {
  invertQuickEditProjection,
  projectQuickEditPoint,
  quickEditProjectionCss,
  type QuickEditHomography,
} from '../../../../features/video/composition/motion/spatial-geometry';

import {
  mapCompositionPointThroughCamera,
  mapCompositionRectThroughCamera,
  mapViewportPointToComposition,
} from '../../../../features/video/composition/motion';
import { type VideoProject } from '../../../../features/video/project/types/index';
import type { PreviewStageCanvasProps } from '../types';

export {
  canEditVideoActionOccurrence as canEditActionOccurrenceOnCanvas,
  mapScenePointToVideoActionOccurrence as mapScenePointToActionOccurrence,
  mapVideoActionOccurrencePointToScene as mapActionOccurrencePointToScene,
  shouldLockVideoClipToViewport as shouldLockPreviewClipToViewport,
} from '../../../../features/video/composition/action-occurrence-geometry';

interface PreviewStageBounds {
  height: number;
  left: number;
  top: number;
  width: number;
}

interface PreviewStageViewport {
  height: number;
  offsetX: number;
  offsetY: number;
  scale: number;
  width: number;
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function resolveStageBounds(
  stage: HTMLDivElement,
  fallbackWidth: number,
  fallbackHeight: number
): PreviewStageBounds {
  const bounds = stage.getBoundingClientRect();

  return {
    height: Math.max(0, bounds.height || fallbackHeight),
    left: bounds.left,
    top: bounds.top,
    width: Math.max(0, bounds.width || fallbackWidth),
  };
}

function resolveStageViewport(
  bounds: PreviewStageBounds,
  project: VideoProject
): PreviewStageViewport {
  if (bounds.width <= 0 || bounds.height <= 0 || project.width <= 0 || project.height <= 0) {
    return { height: 0, offsetX: 0, offsetY: 0, scale: 0, width: 0 };
  }

  const scale = Math.min(bounds.width / project.width, bounds.height / project.height);
  const width = project.width * scale;
  const height = project.height * scale;

  return {
    height,
    offsetX: (bounds.width - width) / 2,
    offsetY: (bounds.height - height) / 2,
    scale,
    width,
  };
}

export function resolvePreviewStageViewportMetrics(
  stage: HTMLDivElement,
  project: VideoProject,
  fallbackWidth = 0,
  fallbackHeight = 0
) {
  const bounds = resolveStageBounds(stage, fallbackWidth, fallbackHeight);
  const viewport = resolveStageViewport(bounds, project);

  return { bounds, viewport };
}

export function mapClientPointToCompositionPoint(params: {
  camera: PreviewStageCanvasProps['camera'];
  clientX: number;
  clientY: number;
  lockToViewport?: boolean;
  clampToViewport?: boolean;
  project: VideoProject;
  stage: HTMLDivElement;
}) {
  const { bounds, viewport } = resolvePreviewStageViewportMetrics(params.stage, params.project);
  if (viewport.width <= 0 || viewport.height <= 0) {
    return null;
  }

  const x = params.clientX - bounds.left - viewport.offsetX;
  const y = params.clientY - bounds.top - viewport.offsetY;
  const viewportX = params.clampToViewport === false ? x : clampNumber(x, 0, viewport.width);
  const viewportY = params.clampToViewport === false ? y : clampNumber(y, 0, viewport.height);

  const viewportPoint = {
    x: (viewportX / viewport.width) * params.project.width,
    y: (viewportY / viewport.height) * params.project.height,
  };

  return params.lockToViewport
    ? viewportPoint
    : mapViewportPointToComposition(viewportPoint, params.camera);
}

export function getCompositionPointStageStyle(
  project: VideoProject,
  point: { x: number; y: number },
  camera: PreviewStageCanvasProps['camera'],
  lockToViewport: boolean,
  stage: HTMLDivElement
): CSSProperties {
  const { bounds, viewport } = resolvePreviewStageViewportMetrics(stage, project);
  const mappedPoint = lockToViewport ? point : mapCompositionPointThroughCamera(point, camera);
  if (!mappedPoint || bounds.width <= 0 || bounds.height <= 0) return { display: 'none' };

  return {
    left: `${((viewport.offsetX + mappedPoint.x * viewport.scale) / bounds.width) * 100}%`,
    top: `${((viewport.offsetY + mappedPoint.y * viewport.scale) / bounds.height) * 100}%`,
  };
}

export function getCompositionRectStageStyle(
  project: VideoProject,
  rect: { height: number; width: number; x: number; y: number; rotation?: number },
  camera: PreviewStageCanvasProps['camera'],
  lockToViewport: boolean,
  stage: HTMLDivElement
): CSSProperties {
  const { bounds, viewport } = resolvePreviewStageViewportMetrics(stage, project);
  if (bounds.width <= 0 || bounds.height <= 0) return { display: 'none' };
  if (!lockToViewport && camera.spatial) {
    if (rect.width === 0 && rect.height === 0)
      return getCompositionPointStageStyle(project, rect, camera, false, stage);
    const matrix = motionCameraProjection(camera, viewport.scale);
    if (!matrix || !matrix.every(Number.isFinite) || !invertQuickEditProjection(matrix))
      return { display: 'none' };
    const radians = ((rect.rotation ?? 0) * Math.PI) / 180;
    const c = Math.cos(radians),
      s = Math.sin(radians);
    const width = rect.width * viewport.scale,
      height = rect.height * viewport.scale;
    const x = rect.x * viewport.scale + (width / 2) * (1 - c) + (height / 2) * s;
    const y = rect.y * viewport.scale + (height / 2) * (1 - c) - (width / 2) * s;
    const [a, b, d, e, f, j, g, h, i] = matrix;
    const local: QuickEditHomography = [
      a * c + b * s,
      -a * s + b * c,
      a * x + b * y + d,
      e * c + f * s,
      -e * s + f * c,
      e * x + f * y + j,
      g * c + h * s,
      -g * s + h * c,
      g * x + h * y + i,
    ];
    if (
      !local.every(Number.isFinite) ||
      [
        { x: 0, y: 0 },
        { x: width, y: 0 },
        { x: width, y: height },
        { x: 0, y: height },
      ].some((point) => !projectQuickEditPoint(local, point))
    )
      return { display: 'none' };
    return {
      left: `${(viewport.offsetX / bounds.width) * 100}%`,
      top: `${(viewport.offsetY / bounds.height) * 100}%`,
      width: `${(width / bounds.width) * 100}%`,
      height: `${(height / bounds.height) * 100}%`,
      transform: quickEditProjectionCss(local),
      transformOrigin: '0 0',
    };
  }
  const mappedRect = lockToViewport ? rect : mapCompositionRectThroughCamera(rect, camera);
  if (!mappedRect) return { display: 'none' };

  return {
    height: `${((mappedRect.height * viewport.scale) / bounds.height) * 100}%`,
    left: `${((viewport.offsetX + mappedRect.x * viewport.scale) / bounds.width) * 100}%`,
    top: `${((viewport.offsetY + mappedRect.y * viewport.scale) / bounds.height) * 100}%`,
    width: `${((mappedRect.width * viewport.scale) / bounds.width) * 100}%`,
  };
}

export function getPreviewStageInteractionScale(
  stage: HTMLDivElement,
  project: VideoProject,
  camera: PreviewStageCanvasProps['camera'],
  lockToViewport = false
) {
  const { viewport } = resolvePreviewStageViewportMetrics(stage, project);
  const scaledValue = viewport.scale * (lockToViewport ? 1 : camera.scale);
  return {
    scaleX: scaledValue,
    scaleY: scaledValue,
  };
}
