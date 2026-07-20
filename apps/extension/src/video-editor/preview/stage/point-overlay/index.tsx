import type React from 'react';

import { translate } from '../../../../platform/i18n';
import { beginPointHandleDrag } from './drag';
import {
  canRenderSelectedPoint,
  getPlacementHint,
  getPointHandleStyle,
  getSelectedPoint,
  getSelectedPointTarget,
  POINT_HANDLE_CLASS_NAME,
  POINT_HINT_CLASS_NAME,
  resolvePointFromPointer,
  updateSelectedPoint,
} from './helpers';
import type { PointOverlayParams, StagePoint } from './types';

function PointHandle(props: {
  camera: PointOverlayParams['camera'];
  label: string;
  onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => void;
  point: StagePoint;
  project: PointOverlayParams['project'];
  stage: HTMLDivElement;
}) {
  return (
    <button
      type="button"
      aria-label={props.label}
      data-preview-stage-point-handle="true"
      className={POINT_HANDLE_CLASS_NAME}
      style={getPointHandleStyle(props.project, props.point, props.camera, props.stage)}
      onPointerDown={props.onPointerDown}
    />
  );
}

export function handleStagePointPlacement(
  event: React.PointerEvent<HTMLDivElement>,
  params: PointOverlayParams
): boolean {
  if (!params.placementMode) {
    return false;
  }

  const target = event.target;
  if (target instanceof HTMLElement && target.dataset['previewStagePointHandle'] === 'true') {
    return false;
  }

  const stage = params.stageRef.current;
  if (!stage) {
    params.onClearPlacementMode();
    return true;
  }

  const point = resolvePointFromPointer(
    event.clientX,
    event.clientY,
    stage,
    params.project,
    params.camera
  );
  if (!point) {
    params.onClearPlacementMode();
    return true;
  }

  updateSelectedPoint(params, point);
  params.onClearPlacementMode();
  return true;
}

export function PreviewStagePointOverlay(params: PointOverlayParams) {
  const point = getSelectedPoint(params);
  const pointTarget = getSelectedPointTarget(params);
  const placementHint = getPlacementHint(params.placementMode);
  const stage = params.stageRef.current;
  if ((!canRenderSelectedPoint(params) || !stage) && !placementHint) {
    return null;
  }

  return (
    <>
      {placementHint ? <div className={POINT_HINT_CLASS_NAME}>{placementHint}</div> : null}
      {point && stage ? (
        <PointHandle
          camera={params.camera}
          label={translate('videoEditor.sidebar.selectPointOnStage')}
          point={point}
          project={params.project}
          stage={stage}
          onPointerDown={(event) => {
            if (!pointTarget) {
              return;
            }

            beginPointHandleDrag({ ...params, event, point, target: pointTarget });
          }}
        />
      ) : null}
    </>
  );
}
