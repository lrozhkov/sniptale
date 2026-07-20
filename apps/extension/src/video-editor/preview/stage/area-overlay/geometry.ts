import type { CSSProperties } from 'react';
import { getMotionFocusAreaCenter } from '../../../../features/video/project/motion/index';
import type { VideoProjectMotionArea } from '../../../../features/video/project/types/index';
import { clampStagePoint } from '../../../interaction/placement-geometry';
import {
  getCompositionPointStageStyle,
  getCompositionRectStageStyle,
  mapClientPointToCompositionPoint,
} from '../canvas/geometry';
import type { PreviewStageCanvasProps } from '../types';

export function resolveAreaPointFromPointer(
  clientX: number,
  clientY: number,
  stage: HTMLDivElement,
  project: PreviewStageCanvasProps['project'],
  camera: PreviewStageCanvasProps['camera']
) {
  const point = mapClientPointToCompositionPoint({
    camera,
    clientX,
    clientY,
    lockToViewport: false,
    project,
    stage,
  });
  if (!point) {
    return null;
  }

  return clampStagePoint(project, point);
}

export function getAreaStyle(
  project: PreviewStageCanvasProps['project'],
  area: VideoProjectMotionArea,
  camera: PreviewStageCanvasProps['camera'],
  stage: HTMLDivElement
): CSSProperties {
  return getCompositionRectStageStyle(project, area, camera, false, stage);
}

export function getAreaHandleStyle(
  project: PreviewStageCanvasProps['project'],
  area: VideoProjectMotionArea,
  camera: PreviewStageCanvasProps['camera'],
  stage: HTMLDivElement
) {
  return getCompositionPointStageStyle(
    project,
    { x: area.x + area.width, y: area.y + area.height },
    camera,
    false,
    stage
  );
}

export function getAreaCenterStyle(
  project: PreviewStageCanvasProps['project'],
  area: VideoProjectMotionArea,
  camera: PreviewStageCanvasProps['camera'],
  stage: HTMLDivElement
): CSSProperties {
  return getCompositionPointStageStyle(
    project,
    getMotionFocusAreaCenter(area),
    camera,
    false,
    stage
  );
}
