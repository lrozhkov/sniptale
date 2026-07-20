import type { CSSProperties } from 'react';

import {
  mapCompositionPointThroughCamera,
  mapCompositionRectThroughCamera,
  mapViewportPointToComposition,
} from '../../../../features/video/composition/motion';
import {
  type VideoProject,
  type VideoProjectClip,
  VideoMotionOverlayZoomMode,
  VideoProjectClipType,
} from '../../../../features/video/project/types/index';
import type { PreviewStageCanvasProps } from '../types';

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
  project: VideoProject;
  stage: HTMLDivElement;
}) {
  const { bounds, viewport } = resolvePreviewStageViewportMetrics(params.stage, params.project);
  if (viewport.width <= 0 || viewport.height <= 0) {
    return null;
  }

  const viewportX = clampNumber(params.clientX - bounds.left - viewport.offsetX, 0, viewport.width);
  const viewportY = clampNumber(params.clientY - bounds.top - viewport.offsetY, 0, viewport.height);

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

  return {
    left: `${((viewport.offsetX + mappedPoint.x * viewport.scale) / bounds.width) * 100}%`,
    top: `${((viewport.offsetY + mappedPoint.y * viewport.scale) / bounds.height) * 100}%`,
  };
}

export function getCompositionRectStageStyle(
  project: VideoProject,
  rect: { height: number; width: number; x: number; y: number },
  camera: PreviewStageCanvasProps['camera'],
  lockToViewport: boolean,
  stage: HTMLDivElement
): CSSProperties {
  const { bounds, viewport } = resolvePreviewStageViewportMetrics(stage, project);
  const mappedRect = lockToViewport ? rect : mapCompositionRectThroughCamera(rect, camera);

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

export function shouldLockPreviewClipToViewport(
  clip: Pick<VideoProjectClip, 'type'>,
  camera: PreviewStageCanvasProps['camera']
) {
  if (
    (camera.overlayZoomMode ?? VideoMotionOverlayZoomMode.LOCK_OVERLAYS) !==
    VideoMotionOverlayZoomMode.LOCK_OVERLAYS
  ) {
    return false;
  }

  switch (clip.type) {
    case VideoProjectClipType.TEXT:
    case VideoProjectClipType.SUBTITLE:
    case VideoProjectClipType.ANNOTATION:
    case VideoProjectClipType.EFFECT:
    case VideoProjectClipType.SHAPE:
      return true;
    case VideoProjectClipType.VIDEO:
    case VideoProjectClipType.IMAGE:
    case VideoProjectClipType.AUDIO:
      return false;
  }
}
