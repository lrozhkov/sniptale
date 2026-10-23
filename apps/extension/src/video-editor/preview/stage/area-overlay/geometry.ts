import {
  motionWindowFocusToComposition,
  resolveMotionSourceWindow,
} from '../../../../features/video/composition/motion/source-window';
import type { VideoProjectMotionRegion } from '../../../../features/video/project/types';
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
  camera: PreviewStageCanvasProps['camera'],
  region?: VideoProjectMotionRegion,
  time = 0
) {
  if (
    region?.sourceBinding?.coordinateSpace === 'source-window' &&
    !resolveMotionSourceWindow(project, region, time)
  )
    return null;
  const point = mapClientPointToCompositionPoint({
    camera,
    clientX,
    clientY,
    clampToViewport: !region?.focusArea?.axes,
    lockToViewport: Boolean(
      camera.sourceClipId &&
      (region?.focusArea?.axes || region?.sourceBinding?.coordinateSpace === 'source-window') &&
      (region?.sourceBinding?.coordinateSpace !== 'source-window' ||
        camera.sourceClipId !== region.sourceBinding.clipId)
    ),
    project,
    stage,
  });
  if (!point) {
    return null;
  }

  const authored = region
    ? motionWindowFocusToComposition(project, region, point, time, true)
    : point;
  return region?.focusArea?.axes ? authored : clampStagePoint(project, authored);
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
