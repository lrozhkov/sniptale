import { translate } from '../../../../platform/i18n';
import {
  VideoMotionCameraMode,
  VideoMotionFocusMode,
} from '../../../../features/video/project/types/index';
import { VideoEditorPlacementModeKind } from '../../../contracts/placement';
import { getAreaCenterStyle, getAreaHandleStyle, getAreaStyle } from './geometry';
import { beginAreaDrag } from './drag';
import {
  AREA_CENTER_CLASS_NAME,
  AREA_HANDLE_CLASS_NAME,
  AREA_HINT_CLASS_NAME,
  AREA_OUTLINE_CLASS_NAME,
} from './shared';
import type { AreaOverlayParams } from './types';

export { handleStageAreaPlacement } from './placement';

export function PreviewStageMotionAreaOverlay(params: AreaOverlayParams) {
  const motionRegion = params.selectedMotionRegion;
  const area =
    motionRegion?.cameraMode !== VideoMotionCameraMode.PATH &&
    motionRegion?.focusMode === VideoMotionFocusMode.MANUAL_AREA
      ? motionRegion.focusArea
      : null;
  const isPickingArea = params.placementMode?.kind === VideoEditorPlacementModeKind.MOTION_AREA;
  const stage = params.stageRef.current;
  if (!area && !isPickingArea) {
    return null;
  }

  return (
    <>
      {isPickingArea ? (
        <div className={AREA_HINT_CLASS_NAME}>
          {translate('videoEditor.sidebar.motionAreaPickHint')}
        </div>
      ) : null}
      {area && stage ? (
        <>
          <button
            type="button"
            aria-label={translate('videoEditor.sidebar.selectAreaOnStage')}
            data-preview-stage-area-body="true"
            className={AREA_OUTLINE_CLASS_NAME}
            style={getAreaStyle(params.project, area, params.camera, stage)}
            onPointerDown={(event) => beginAreaDrag({ area, event, mode: 'move', params })}
          />
          <button
            type="button"
            aria-label={translate('videoEditor.sidebar.resizeAreaOnStage')}
            data-preview-stage-area-handle="true"
            className={AREA_HANDLE_CLASS_NAME}
            style={getAreaHandleStyle(params.project, area, params.camera, stage)}
            onPointerDown={(event) => beginAreaDrag({ area, event, mode: 'resize', params })}
          />
          <div
            aria-hidden="true"
            data-preview-stage-area-center="true"
            className={AREA_CENTER_CLASS_NAME}
            style={getAreaCenterStyle(params.project, area, params.camera, stage)}
          />
        </>
      ) : null}
    </>
  );
}
