import type { TimelineProjection } from '../interaction-state/projection';
import type { MutableRefObject } from 'react';
import type { VideoProject } from '../../../../features/video/project/types';
import type { VideoEditorSelection } from '../../../contracts/selection';
import { ProjectTimelineEffectCanvasRows } from '../effect-lanes/lanes';
import type { TimelineEffectDragTarget, TimelineEffectSelection } from '../types';

export function ProjectTimelineCanvasEffectRows(props: {
  cursorLaneVisible: boolean;
  pixelsPerSecond: number;
  projection?: TimelineProjection | undefined;
  project: VideoProject;
  selection: VideoEditorSelection;
  selectedEffectSelection: TimelineEffectSelection | null;
  onBeginEffectInteraction: (event: React.PointerEvent, target: TimelineEffectDragTarget) => void;
  onBeginEffectRangeSelection: React.PointerEventHandler<HTMLDivElement>;
  onAddMotionRegion: (startTime?: number) => void;
  onResizeMotionRegion: (motionRegionId: string, startTime: number, duration: number) => void;
  onSelectActionOccurrence: (eventId: string, clipId: string | null) => void;
  onSelectCursorSegment: (sampleId: string) => void;
  onSelectMotionRegion: (motionRegionId: string, part?: 'connection') => void;
  onConnectMotionRegions?: ((fromRegionId: string, toRegionId: string) => void) | undefined;
  onSelectObjectTrack: (objectTrackId: string) => void;
  onSelectTransition: (transitionId: string) => void;
  timelineRef: MutableRefObject<HTMLDivElement | null>;
}) {
  return (
    <ProjectTimelineEffectCanvasRows
      cursorLaneVisible={props.cursorLaneVisible}
      onAddMotionRegion={props.onAddMotionRegion}
      onBeginEffectInteraction={props.onBeginEffectInteraction}
      onBeginRangeSelection={props.onBeginEffectRangeSelection}
      onResizeMotionRegion={props.onResizeMotionRegion}
      onSelectActionOccurrence={props.onSelectActionOccurrence}
      onSelectCursorSegment={props.onSelectCursorSegment}
      onSelectMotionRegion={props.onSelectMotionRegion}
      onConnectMotionRegions={props.onConnectMotionRegions}
      onSelectObjectTrack={props.onSelectObjectTrack}
      onSelectTransition={props.onSelectTransition}
      pixelsPerSecond={props.pixelsPerSecond}
      projection={props.projection}
      project={props.project}
      selection={props.selection}
      selectedEffectSelection={props.selectedEffectSelection}
      timelineRef={props.timelineRef}
    />
  );
}
