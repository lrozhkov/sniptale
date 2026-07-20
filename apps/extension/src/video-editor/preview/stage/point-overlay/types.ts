import type React from 'react';

import type { VideoEditorPlacementMode } from '../../../contracts/placement';
import type { StagePoint } from '../../../interaction/placement-geometry';
import type { PreviewStageCanvasProps } from '../types';
export type { StagePoint };

export type PointPlacementParams = Pick<
  PreviewStageCanvasProps,
  | 'onUpdateActionEventDetails'
  | 'onUpdateMotionRegion'
  | 'onUpsertObjectTrackCorrectionAnchor'
  | 'project'
  | 'selectedMotionRegion'
> & {
  currentTime?: PreviewStageCanvasProps['currentTime'];
};

export type PointOverlayParams = Pick<
  PreviewStageCanvasProps,
  | 'camera'
  | 'grid'
  | 'placementMode'
  | 'project'
  | 'selectedActionEvent'
  | 'selectedMotionRegion'
  | 'stageRef'
  | 'onGuideChange'
  | 'onClearPlacementMode'
  | 'onUpdateActionEventDetails'
  | 'onUpdateMotionRegion'
  | 'onUpsertObjectTrackCorrectionAnchor'
> & {
  currentTime?: PreviewStageCanvasProps['currentTime'];
};

export interface PointDragParams
  extends
    Pick<PointOverlayParams, 'camera' | 'grid' | 'onGuideChange' | 'project' | 'stageRef'>,
    PointPlacementParams {
  event: React.PointerEvent<HTMLButtonElement>;
  point: StagePoint;
  target: VideoEditorPlacementMode;
}
