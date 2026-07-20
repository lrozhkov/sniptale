import type { MutableRefObject } from 'react';
import type { VideoProject } from '../../../../features/video/project/types';
import type { VideoEditorSelection } from '../../../contracts/selection';
import { ProjectTimelineEffectCanvasRows } from '../effect-lanes/lanes';
import type { TimelineEffectDragTarget, TimelineEffectSelection } from '../types';

export function ProjectTimelineCanvasEffectRows(props: {
  cursorLaneVisible: boolean;
  pixelsPerSecond: number;
  project: VideoProject;
  selection: VideoEditorSelection;
  selectedEffectSelection: TimelineEffectSelection | null;
  onBeginEffectInteraction: (event: React.PointerEvent, target: TimelineEffectDragTarget) => void;
  onBeginEffectRangeSelection: React.PointerEventHandler<HTMLDivElement>;
  onAddMotionRegion: (startTime?: number) => void;
  onResizeActionEvent: (actionEventId: string, duration: number) => void;
  onResizeMotionRegion: (motionRegionId: string, startTime: number, duration: number) => void;
  onSelectActionSegment: (actionEventId: string) => void;
  onSelectCursorSegment: (sampleId: string) => void;
  onSelectMotionRegion: (motionRegionId: string) => void;
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
      onResizeActionEvent={props.onResizeActionEvent}
      onResizeMotionRegion={props.onResizeMotionRegion}
      onSelectActionSegment={props.onSelectActionSegment}
      onSelectCursorSegment={props.onSelectCursorSegment}
      onSelectMotionRegion={props.onSelectMotionRegion}
      onSelectObjectTrack={props.onSelectObjectTrack}
      onSelectTransition={props.onSelectTransition}
      pixelsPerSecond={props.pixelsPerSecond}
      project={props.project}
      selection={props.selection}
      selectedEffectSelection={props.selectedEffectSelection}
      timelineRef={props.timelineRef}
    />
  );
}
