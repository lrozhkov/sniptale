import { motionFocusAreaPoint } from '../../../../features/video/project/motion/focus-area';
import type { CSSProperties } from 'react';
import { getCompositionPointStageStyle } from '../canvas/geometry';
import {
  motionWindowAreaToComposition,
  motionWindowAreaPoints,
  motionWindowFocusToComposition,
  resolveMotionSourceWindow,
} from '../../../../features/video/composition/motion/source-window';
import { isCameraMotionRegion } from '../../../../features/video/project/motion/normalization';
import { PreviewStageFocusAreaOverlay } from './focus';
import { translate } from '../../../../platform/i18n';
import { VideoMotionFocusMode } from '../../../../features/video/project/types/index';
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
  if (motionRegion?.border || motionRegion?.spotlight)
    return <PreviewStageFocusAreaOverlay {...params} />;
  if (
    motionRegion?.sourceBinding?.coordinateSpace === 'source-window' &&
    !resolveMotionSourceWindow(params.project, motionRegion, params.currentTime ?? 0)
  )
    return null;
  const area =
    motionRegion &&
    isCameraMotionRegion(motionRegion) &&
    motionRegion.focusMode === VideoMotionFocusMode.MANUAL_AREA
      ? motionRegion.focusArea
      : null;
  const displayedArea =
    area && motionRegion
      ? motionWindowAreaToComposition(params.project, motionRegion, area, params.currentTime ?? 0)
      : null;
  const sourceWindow = motionRegion?.sourceBinding?.coordinateSpace === 'source-window';
  const areaPoints =
    area && motionRegion && (sourceWindow || area.axes)
      ? motionWindowAreaPoints(params.project, motionRegion, area, params.currentTime ?? 0)
      : null;
  const isPickingArea = params.placementMode?.kind === VideoEditorPlacementModeKind.MOTION_AREA;
  const stage = params.stageRef.current;
  if (!area && !isPickingArea) {
    return null;
  }

  const toStage = (point: { x: number; y: number }): CSSProperties => {
    if (!stage) return { display: 'none' };
    const lock = Boolean(
      params.camera.sourceClipId &&
      (!sourceWindow || params.camera.sourceClipId !== motionRegion?.sourceBinding?.clipId)
    );
    return getCompositionPointStageStyle(params.project, point, params.camera, lock, stage);
  };
  const screenPoints = areaPoints ? Object.values(areaPoints).map(toStage) : null;
  if (screenPoints?.some((point) => point.display === 'none')) return null;
  const center =
    area && motionRegion && (sourceWindow || area.axes)
      ? toStage(
          motionWindowFocusToComposition(
            params.project,
            motionRegion,
            motionFocusAreaPoint(area, 0.5, 0.5),
            params.currentTime ?? 0
          )
        )
      : null;
  return (
    <>
      {isPickingArea ? (
        <div className={AREA_HINT_CLASS_NAME}>
          {translate('videoEditor.sidebar.motionAreaPickHint')}
        </div>
      ) : null}
      {area && stage ? (
        <>
          {screenPoints ? (
            <svg
              className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
            >
              <polygon
                role="button"
                tabIndex={0}
                aria-label={translate('videoEditor.sidebar.selectAreaOnStage')}
                data-preview-stage-area-body="true"
                points={screenPoints
                  .map(
                    (point) => `${parseFloat(String(point.left))},${parseFloat(String(point.top))}`
                  )
                  .join(' ')}
                className={[
                  'pointer-events-auto cursor-move',
                  'fill-[color:color-mix(in_srgb,var(--sniptale-color-accent-emphasis)_10%,transparent)]',
                  'stroke-[var(--sniptale-color-accent-emphasis)] focus:outline-none',
                  'focus:stroke-[var(--sniptale-color-text-primary-strong)]',
                ].join(' ')}
                strokeWidth={2}
                vectorEffect="non-scaling-stroke"
                onPointerDown={(event) => beginAreaDrag({ area, event, mode: 'move', params })}
              />
            </svg>
          ) : (
            <button
              type="button"
              aria-label={translate('videoEditor.sidebar.selectAreaOnStage')}
              data-preview-stage-area-body="true"
              className={AREA_OUTLINE_CLASS_NAME}
              style={getAreaStyle(params.project, displayedArea!, params.camera, stage)}
              onPointerDown={(event) => beginAreaDrag({ area, event, mode: 'move', params })}
            />
          )}
          <button
            type="button"
            aria-label={translate('videoEditor.sidebar.resizeAreaOnStage')}
            data-preview-stage-area-handle="true"
            className={AREA_HANDLE_CLASS_NAME}
            style={
              areaPoints
                ? toStage(areaPoints.se)
                : getAreaHandleStyle(params.project, displayedArea!, params.camera, stage)
            }
            onPointerDown={(event) => beginAreaDrag({ area, event, mode: 'resize', params })}
          />
          <div
            aria-hidden="true"
            data-preview-stage-area-center="true"
            className={AREA_CENTER_CLASS_NAME}
            style={
              center ?? getAreaCenterStyle(params.project, displayedArea!, params.camera, stage)
            }
          />
        </>
      ) : null}
    </>
  );
}
