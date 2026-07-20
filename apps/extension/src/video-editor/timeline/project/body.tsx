import type { ComponentProps } from 'react';
import { ProjectTimelineCanvas } from './canvas';
import { ProjectTimelineTrackList } from './tracks/list';
import type { ProjectTimelineProps } from './types';
import type { useProjectTimelinePanelPrefs } from './panel/prefs';
import type { useProjectTimelineState } from './interaction-state/index';

type ProjectTimelineBodyProps = Pick<
  ProjectTimelineProps & ReturnType<typeof useProjectTimelineState>,
  | 'beginClipInteraction'
  | 'beginEffectInteraction'
  | 'beginEffectRangeSelection'
  | 'beginRangeSelection'
  | 'beginTrackRangeSelection'
  | 'currentTime'
  | 'dragGhost'
  | 'handleTimelineSeek'
  | 'hoveredClipId'
  | 'insertion'
  | 'onCloseTrackGap'
  | 'onDropEffectDocument'
  | 'onAddTrackLogicalLane'
  | 'onDeleteTrack'
  | 'onMoveTrack'
  | 'onClearUtilityLane'
  | 'onSelectActionSegment'
  | 'onSelectClip'
  | 'onSelectCursorSegment'
  | 'onSelectMotionRegion'
  | 'onSelectObjectTrack'
  | 'onSelectScene'
  | 'onSelectTrack'
  | 'onSelectTransition'
  | 'onResizeActionEvent'
  | 'onResizeMotionRegion'
  | 'onToggleTrackLock'
  | 'onToggleTrackVisibility'
  | 'onToggleUtilityLaneLock'
  | 'onToggleUtilityLaneVisibility'
  | 'onTimelinePreviewViewportChange'
  | 'pixelsPerSecond'
  | 'project'
  | 'recordingTelemetry'
  | 'selection'
  | 'seekToClientX'
  | 'selectedClipId'
  | 'selectedEffectSelection'
  | 'selectedTrackId'
  | 'setHoveredClipId'
  | 'telemetryLaneVisible'
  | 'timelinePreviews'
  | 'trackLayoutModel'
  | 'syncTracksScroll'
  | 'timelineRef'
  | 'timelineWidth'
  | 'trackListRef'
  | 'tracks'
  | 'visiblePlaybackRange'
> & {
  cursorLaneVisible: boolean;
  trackPanelPrefs: ReturnType<typeof useProjectTimelinePanelPrefs>;
};
type ProjectTimelineBodyCanvasProps = ComponentProps<typeof ProjectTimelineCanvas>;
type ProjectTimelineBodyTrackListProps = ComponentProps<typeof ProjectTimelineTrackList>;

export function ProjectTimelineBody(props: ProjectTimelineBodyProps) {
  return (
    <div
      className="grid min-h-0 flex-1 overflow-hidden"
      style={{
        gridTemplateColumns: resolveTrackPanelGridColumns(props.trackPanelPrefs.prefs),
      }}
    >
      <ProjectTimelineBodyTrackList {...props} />
      <ProjectTimelineBodyCanvas {...props} />
    </div>
  );
}

function resolveTrackPanelGridColumns(
  prefs: ReturnType<typeof useProjectTimelinePanelPrefs>['prefs']
): string {
  if (prefs.compactRows) {
    return '56px minmax(0,1fr)';
  }

  return prefs.panelExpanded ? '440px minmax(0,1fr)' : '220px minmax(0,1fr)';
}

function ProjectTimelineBodyTrackList(props: ProjectTimelineBodyProps) {
  return <ProjectTimelineTrackList {...createTrackListProps(props)} />;
}

function ProjectTimelineBodyCanvas(props: ProjectTimelineBodyProps) {
  return <ProjectTimelineCanvas {...createCanvasProps(props)} />;
}

function createTrackListProps(props: ProjectTimelineBodyProps): ProjectTimelineBodyTrackListProps {
  return {
    cursorLaneVisible: props.cursorLaneVisible,
    project: props.project,
    selectedTrackId: props.selectedTrackId,
    showTelemetryLane: props.telemetryLaneVisible,
    trackLayoutModel: props.trackLayoutModel,
    trackListRef: props.trackListRef,
    trackPanelPrefs: props.trackPanelPrefs,
    tracks: props.tracks,
    onAddTrackLogicalLane: props.onAddTrackLogicalLane,
    onClearUtilityLane: props.onClearUtilityLane,
    onDeleteTrack: props.onDeleteTrack,
    onMoveTrack: props.onMoveTrack,
    onScroll: () => props.syncTracksScroll('tracks'),
    onSelectTrack: props.onSelectTrack,
    onToggleTrackLock: props.onToggleTrackLock,
    onToggleTrackVisibility: props.onToggleTrackVisibility,
    onToggleUtilityLaneLock: props.onToggleUtilityLaneLock,
    onToggleUtilityLaneVisibility: props.onToggleUtilityLaneVisibility,
  };
}

function createCanvasProps(props: ProjectTimelineBodyProps): ProjectTimelineBodyCanvasProps {
  return {
    currentTime: props.currentTime,
    cursorLaneVisible: props.cursorLaneVisible,
    dragGhost: props.dragGhost,
    hoveredClipId: props.hoveredClipId,
    playbackRange: props.visiblePlaybackRange,
    pixelsPerSecond: props.pixelsPerSecond,
    project: props.project,
    recordingTelemetry: props.recordingTelemetry,
    seekToClientX: props.seekToClientX,
    selectedClipId: props.selectedClipId,
    selectedEffectSelection: props.selectedEffectSelection,
    selectedTrackId: props.selectedTrackId,
    selection: props.selection,
    telemetryLaneVisible: props.telemetryLaneVisible,
    timelinePreviews: props.timelinePreviews,
    timelineRef: props.timelineRef,
    timelineWidth: props.timelineWidth,
    trackLayoutModel: props.trackLayoutModel,
    tracks: props.tracks,
    onAddMotionRegion: props.insertion.onAddMotionRegion,
    onBeginClipInteraction: props.beginClipInteraction,
    onBeginEffectInteraction: props.beginEffectInteraction,
    onBeginEffectRangeSelection: props.beginEffectRangeSelection,
    onBeginRangeSelection: props.beginRangeSelection,
    onBeginTrackRangeSelection: props.beginTrackRangeSelection,
    onCloseTrackGap: props.onCloseTrackGap,
    ...(props.onDropEffectDocument ? { onDropEffectDocument: props.onDropEffectDocument } : {}),
    onImportTimelineFile: props.insertion.onImport,
    onResizeActionEvent: props.onResizeActionEvent,
    onResizeMotionRegion: props.onResizeMotionRegion,
    onScroll: () => props.syncTracksScroll('timeline'),
    onSeek: props.handleTimelineSeek,
    onSelectActionSegment: props.onSelectActionSegment,
    onSelectClip: props.onSelectClip,
    onSelectCursorSegment: props.onSelectCursorSegment,
    onSelectMotionRegion: props.onSelectMotionRegion,
    onSelectObjectTrack: props.onSelectObjectTrack,
    onSelectScene: props.onSelectScene,
    onSelectTrack: props.onSelectTrack,
    onSelectTransition: props.onSelectTransition,
    onSetHoveredClipId: props.setHoveredClipId,
    onTimelinePreviewViewportChange: props.onTimelinePreviewViewportChange,
    onUnsupportedTimelineFileDrop: props.insertion.onUnsupportedFileDrop,
  };
}
