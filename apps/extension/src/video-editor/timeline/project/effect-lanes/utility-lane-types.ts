import type { MutableRefObject } from 'react';

import type { VideoProject } from '../../../../features/video/project/types';
import type { TimelineEffectDragTarget, TimelineEffectSelection } from '../types';

export interface UtilityLaneProps {
  pixelsPerSecond: number;
  project: VideoProject;
  selectedEffectSelection: TimelineEffectSelection | null;
  onBeginRangeSelection: React.PointerEventHandler<HTMLDivElement>;
  onBeginEffectInteraction: (event: React.PointerEvent, target: TimelineEffectDragTarget) => void;
  onAddMotionRegion?: (startTime?: number) => void;
  onResizeActionEvent: (actionEventId: string, duration: number) => void;
  onResizeMotionRegion: (motionRegionId: string, startTime: number, duration: number) => void;
  timelineRef?: MutableRefObject<HTMLDivElement | null>;
}
