import { translate } from '../../../../platform/i18n/index';
import { mapCompositionPointThroughCamera } from '../../../../features/video/composition/motion';
import { resolveMotionPathStopFocusPoint } from '../../../../features/video/project/motion/path-targets';
import {
  VideoMotionCameraMode,
  VideoMotionPathTargetKind,
} from '../../../../features/video/project/types/index';
import { createMotionPathStopPointPlacementMode } from '../../../project/selection/placement';
import { resolveMotionPath } from '../../../project/motion-path/core';
import { resolvePreviewStageViewportMetrics } from '../canvas/geometry';
import { beginPointHandleDrag } from '../point-overlay/drag';
import { POINT_HANDLE_CLASS_NAME, POINT_HINT_CLASS_NAME } from '../point-overlay/helpers';
import { MotionPathAreaHandle } from './area';
import { MotionPathPreviewSvg } from './svg';
import {
  ACTIVE_PATH_STOP_CLASS_NAME,
  getMotionPathPlacementHint,
  isActiveMotionPathStop,
  type MotionPathOverlayParams,
} from './shared';

export function PreviewStageMotionPathOverlay(params: MotionPathOverlayParams) {
  const motionRegion =
    params.selectedMotionRegion?.cameraMode === VideoMotionCameraMode.PATH
      ? params.selectedMotionRegion
      : null;
  const hint = getMotionPathPlacementHint(params.placementMode);
  const stage = params.stageRef.current;
  if (!motionRegion || !stage) {
    return hint ? <div className={POINT_HINT_CLASS_NAME}>{hint}</div> : null;
  }

  return (
    <MotionPathOverlayContent
      hint={hint}
      motionRegionId={motionRegion.id}
      params={params}
      stage={stage}
    />
  );
}

function MotionPathOverlayContent(props: {
  hint: string | null;
  motionRegionId: string;
  params: MotionPathOverlayParams;
  stage: HTMLDivElement;
}) {
  const path = resolveMotionPath(props.params.project, props.params.selectedMotionRegion!);

  return (
    <>
      {props.hint ? <div className={POINT_HINT_CLASS_NAME}>{props.hint}</div> : null}
      <MotionPathPreviewSvg
        camera={props.params.camera}
        path={path}
        project={props.params.project}
        stage={props.stage}
      />
      {path.stops.map((stop, index) => (
        <MotionPathStopHandle
          key={stop.id}
          index={index}
          motionRegionId={props.motionRegionId}
          params={props.params}
          stage={props.stage}
          stop={stop}
        />
      ))}
    </>
  );
}

function MotionPathStopHandle(props: {
  index: number;
  motionRegionId: string;
  params: MotionPathOverlayParams;
  stage: HTMLDivElement;
  stop: ReturnType<typeof resolveMotionPath>['stops'][number];
}) {
  if (props.stop.target.kind !== VideoMotionPathTargetKind.POINT) {
    return (
      <MotionPathAreaHandle
        index={props.index}
        motionRegionId={props.motionRegionId}
        params={props.params}
        stage={props.stage}
        stop={props.stop}
      />
    );
  }

  const point = resolveMotionPathStopFocusPoint(props.params.project, props.stop);
  return (
    <button
      type="button"
      aria-label={`${translate('videoEditor.sidebar.motionPathStopLabel')} ${props.index + 1}`}
      data-preview-stage-point-handle="true"
      className={[
        POINT_HANDLE_CLASS_NAME,
        isActiveMotionPathStop(props.params, props.stop.id) ? ACTIVE_PATH_STOP_CLASS_NAME : '',
      ].join(' ')}
      style={{
        ...resolveCircleStyle(props.params, point, props.stage),
        fontSize: '11px',
        fontWeight: 700,
      }}
      onPointerDown={(event) =>
        beginPointHandleDrag({
          ...props.params,
          event,
          onUpdateActionEventDetails: () => undefined,
          point,
          selectedMotionRegion: props.params.selectedMotionRegion,
          target: createMotionPathStopPointPlacementMode(props.motionRegionId, props.stop.id),
        })
      }
    >
      {props.index + 1}
    </button>
  );
}

function resolveCircleStyle(
  params: MotionPathOverlayParams,
  point: { x: number; y: number },
  stage: HTMLDivElement
) {
  const { bounds: stageBounds, viewport: stageViewport } = resolvePreviewStageViewportMetrics(
    stage,
    params.project
  );
  const mappedPoint = mapCompositionPointThroughCamera(point, params.camera);

  return {
    left: `${((stageViewport.offsetX + mappedPoint.x * stageViewport.scale) / stageBounds.width) * 100}%`,
    top: `${((stageViewport.offsetY + mappedPoint.y * stageViewport.scale) / stageBounds.height) * 100}%`,
  };
}
