import type React from 'react';

import type { VideoProjectMotionArea } from '../../../../features/video/project/types/index';
import type { PreviewStageCanvasProps } from '../types';

export type AreaOverlayParams = Pick<
  PreviewStageCanvasProps,
  | 'camera'
  | 'grid'
  | 'onClearPlacementMode'
  | 'onGuideChange'
  | 'onUpdateMotionRegion'
  | 'placementMode'
  | 'project'
  | 'selectedMotionRegion'
  | 'stageRef'
> &
  Partial<Pick<PreviewStageCanvasProps, 'currentTime' | 'motionProject' | 'onPreviewMotion'>>;

export interface AreaDragParams {
  area: VideoProjectMotionArea;
  event: React.PointerEvent<HTMLElement>;
  mode: 'move' | 'resize';
  params: AreaOverlayParams;
}
