import { translate } from '../../../../platform/i18n/index';
import type { PreviewStageCanvasProps } from '../types';
import { VideoEditorPlacementModeKind } from '../../../contracts/placement';

export type MotionPathOverlayParams = Pick<
  PreviewStageCanvasProps,
  | 'camera'
  | 'grid'
  | 'onGuideChange'
  | 'onUpdateMotionRegion'
  | 'placementMode'
  | 'project'
  | 'selectedMotionRegion'
  | 'stageRef'
>;

export const ACTIVE_PATH_STOP_CLASS_NAME =
  'border-[color:var(--sniptale-color-border-accent-strong)] text-[var(--sniptale-color-accent-text)]';

export function getMotionPathPlacementHint(
  placementMode: MotionPathOverlayParams['placementMode']
): string | null {
  switch (placementMode?.kind) {
    case VideoEditorPlacementModeKind.MOTION_PATH_STOP_POINT:
      return translate('videoEditor.sidebar.motionPathPointPickHint');
    case VideoEditorPlacementModeKind.MOTION_PATH_STOP_AREA:
      return translate('videoEditor.sidebar.motionPathAreaPickHint');
    case VideoEditorPlacementModeKind.ACTION_POINT:
    case VideoEditorPlacementModeKind.MOTION_FOCUS:
    case VideoEditorPlacementModeKind.MOTION_AREA:
    case VideoEditorPlacementModeKind.OBJECT_TRACK_ANCHOR:
    case undefined:
      return null;
  }
}

export function isActiveMotionPathStop(params: MotionPathOverlayParams, stopId: string) {
  return (
    (params.placementMode?.kind === VideoEditorPlacementModeKind.MOTION_PATH_STOP_POINT ||
      params.placementMode?.kind === VideoEditorPlacementModeKind.MOTION_PATH_STOP_AREA) &&
    params.placementMode.stopId === stopId
  );
}
