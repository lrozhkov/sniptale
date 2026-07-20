import { mapCompositionPointThroughCamera } from '../../../../features/video/composition/motion';
import { resolveMotionPathStopFocusPoint } from '../../../../features/video/project/motion/path-targets';
import {
  type VideoProjectMotionPath,
  type VideoProjectMotionPathStop,
  VideoMotionPathTrajectoryPreset,
} from '../../../../features/video/project/types/index';
import { resolvePreviewStageViewportMetrics } from '../canvas/geometry';
import type { MotionPathOverlayParams } from './shared';

const PATH_SVG_CLASS_NAME = 'pointer-events-none absolute inset-0 h-full w-full';

export function MotionPathPreviewSvg(props: {
  camera: MotionPathOverlayParams['camera'];
  path: VideoProjectMotionPath;
  project: MotionPathOverlayParams['project'];
  stage: HTMLDivElement;
}) {
  const { bounds } = resolvePreviewStageViewportMetrics(props.stage, props.project);
  const segments = props.path.stops.slice(0, -1).map((start, index) => ({
    end: props.path.stops[index + 1] ?? start,
    start,
    trajectoryPreset: props.path.segments[index]?.trajectoryPreset,
  }));
  if (segments.length === 0 || bounds.width <= 0 || bounds.height <= 0) {
    return null;
  }

  return (
    <svg
      aria-hidden="true"
      className={PATH_SVG_CLASS_NAME}
      viewBox={`0 0 ${bounds.width} ${bounds.height}`}
    >
      {segments.map((segment, index) => (
        <path
          key={`${segment.start.id}-${segment.end.id}`}
          d={createPathSegment(segment.start, segment.end, index, props)}
          fill="none"
          opacity="0.8"
          stroke="var(--sniptale-color-accent-emphasis)"
          strokeDasharray="8 6"
          strokeWidth="2"
        />
      ))}
    </svg>
  );
}

function createPathSegment(
  start: VideoProjectMotionPathStop,
  end: VideoProjectMotionPathStop,
  index: number,
  props: {
    camera: MotionPathOverlayParams['camera'];
    path: VideoProjectMotionPath;
    project: MotionPathOverlayParams['project'];
    stage: HTMLDivElement;
  }
) {
  const startPoint = resolveStagePoint(start, props);
  const endPoint = resolveStagePoint(end, props);
  const trajectoryPreset = props.path.segments[index]?.trajectoryPreset;
  if (trajectoryPreset !== VideoMotionPathTrajectoryPreset.SOFT_ARC) {
    return `M ${startPoint.x} ${startPoint.y} L ${endPoint.x} ${endPoint.y}`;
  }

  const deltaX = endPoint.x - startPoint.x;
  const deltaY = endPoint.y - startPoint.y;
  const length = Math.hypot(deltaX, deltaY) || 1;
  const arcOffset = Math.min(40, length * 0.22) * (index % 2 === 0 ? 1 : -1);
  const controlX = (startPoint.x + endPoint.x) / 2 - (deltaY / length) * arcOffset;
  const controlY = (startPoint.y + endPoint.y) / 2 + (deltaX / length) * arcOffset;

  return `M ${startPoint.x} ${startPoint.y} Q ${controlX} ${controlY} ${endPoint.x} ${endPoint.y}`;
}

function resolveStagePoint(
  stop: VideoProjectMotionPathStop,
  props: {
    camera: MotionPathOverlayParams['camera'];
    project: MotionPathOverlayParams['project'];
    stage: HTMLDivElement;
  }
) {
  const { viewport } = resolvePreviewStageViewportMetrics(props.stage, props.project);
  const point = mapCompositionPointThroughCamera(
    resolveMotionPathStopFocusPoint(props.project, stop),
    props.camera
  );

  return {
    x: viewport.offsetX + point.x * viewport.scale,
    y: viewport.offsetY + point.y * viewport.scale,
  };
}
