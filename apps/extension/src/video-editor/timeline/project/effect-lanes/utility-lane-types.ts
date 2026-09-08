import type { TimelineProjection } from '../interaction-state/projection';
import type { MutableRefObject } from 'react';

import type { VideoProject } from '../../../../features/video/project/types';
import type { TimelineEffectDragTarget, TimelineEffectSelection } from '../types';
import type { VideoEditorSelection } from '../../../contracts/selection';

export interface UtilityLaneProps {
  selection?: VideoEditorSelection;
  onSelectMotionRegion?: (motionRegionId: string, part?: 'connection') => void;
  onConnectMotionRegions?: ((fromRegionId: string, toRegionId: string) => void) | undefined;
  pixelsPerSecond: number;
  projection?: TimelineProjection | undefined;
  project: VideoProject;
  selectedEffectSelection: TimelineEffectSelection | null;
  onBeginRangeSelection: React.PointerEventHandler<HTMLDivElement>;
  onBeginEffectInteraction: (event: React.PointerEvent, target: TimelineEffectDragTarget) => void;
  onAddMotionRegion?: (startTime?: number) => void;
  onResizeMotionRegion: (motionRegionId: string, startTime: number, duration: number) => void;
  timelineRef?: MutableRefObject<HTMLDivElement | null>;
}
