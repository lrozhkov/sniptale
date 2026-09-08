import type { ComponentProps } from 'react';
import { VideoEditorSelectionKind } from '../../contracts/selection';
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
  | 'beginPlayheadScrub'
  | 'beginRangeSelection'
  | 'beginTrackRangeSelection'
  | 'currentTime'
  | 'consumeCompletedScrubClick'
  | 'dragGhost'
  | 'handleTimelineSeek'
  | 'hoveredClipId'
  | 'autoProcessing'
  | 'onAutoProcessingModalVisibilityChange'
  | 'insertion'
  | 'onCloseTrackGap'
  | 'onDropEffectDocument'
  | 'onClearUtilityLane'
  | 'onSelectHistorySpan'
  | 'onSelectActionOccurrence'
  | 'onSelectClip'
  | 'onSelectCursorSegment'
  | 'onSelectMotionRegion'
  | 'onConnectMotionRegions'
  | 'onSelectMotionLane'
  | 'onSelectHistoryLane'
  | 'onSelectObjectTrack'
  | 'onSelectScene'
  | 'onSelectTrack'
  | 'onSelectTransition'
  | 'onResizeMotionRegion'
  | 'onSeek'
  | 'onStepToNextFrame'
  | 'onStepToPreviousFrame'
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
  | 'snapGuideTime'
  | 'selectedClipId'
  | 'selectedEffectSelection'
  | 'selectedTrackId'
  | 'setHoveredClipId'
  | 'timelinePreviews'
  | 'trackLayoutModel'
  | 'syncTracksScroll'
  | 'timelineRef'
  | 'timelineWidth'
  | 'readTimelineStartTime'
  | 'projection'
  | 'trackListRef'
  | 'tracks'
  | 'visiblePlaybackRange'
> & {
  telemetryLaneVisible: boolean;
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
        gridTemplateColumns:
          props.trackPanelPrefs.prefs.compactRows && props.trackPanelPrefs.prefs.hideTrackNames
            ? '160px minmax(0,1fr)'
            : '220px minmax(0,1fr)',
      }}
    >
      <ProjectTimelineBodyTrackList {...props} />
      <ProjectTimelineBodyCanvas {...props} />
    </div>
  );
}

function ProjectTimelineBodyTrackList(props: ProjectTimelineBodyProps) {
  return <ProjectTimelineTrackList {...createTrackListProps(props)} />;
}

function ProjectTimelineBodyCanvas(props: ProjectTimelineBodyProps) {
  return <ProjectTimelineCanvas {...createCanvasProps(props)} />;
}

function createTrackListProps(props: ProjectTimelineBodyProps): ProjectTimelineBodyTrackListProps {
  return {
    canShowTelemetryLane: true,
    recordingTelemetry: props.recordingTelemetry,
    autoProcessing: {
      project: props.project,
      selection: props.selection,
      actions: props.autoProcessing,
      onSeek: props.onSeek,
      onModalVisibilityChange: props.onAutoProcessingModalVisibilityChange,
    },
    onSelectHistoryLane: props.onSelectHistoryLane,
    historyLaneSelected: props.selection?.kind === VideoEditorSelectionKind.HISTORY_LANE,
    onSelectMotionLane: props.onSelectMotionLane,
    motionLaneSelected: props.selection?.kind === VideoEditorSelectionKind.MOTION_LANE,
    cursorLaneVisible: props.cursorLaneVisible,
    project: props.project,
    selectedTrackId: props.selectedTrackId,
    showTelemetryLane: props.telemetryLaneVisible,
    trackLayoutModel: props.trackLayoutModel,
    trackListRef: props.trackListRef,
    trackPanelPrefs: props.trackPanelPrefs,
    tracks: props.tracks,
    onAddTrack: props.insertion.onAddTrack,
    onAddMotionRegion: () => props.insertion.onAddMotionRegion(),
    onClearUtilityLane: props.onClearUtilityLane,
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
    consumeCompletedScrubClick: props.consumeCompletedScrubClick,
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
    snapGuideTime: props.snapGuideTime,
    telemetryLaneVisible: props.telemetryLaneVisible,
    timelinePreviews: props.timelinePreviews,
    timelineRef: props.timelineRef,
    timelineWidth: props.timelineWidth,
    projection: props.projection,
    readTimelineStartTime: props.readTimelineStartTime,
    trackLayoutModel: props.trackLayoutModel,
    tracks: props.tracks,
    onAddMotionRegion: props.insertion.onAddMotionRegion,
    onBeginClipInteraction: props.beginClipInteraction,
    onBeginEffectInteraction: props.beginEffectInteraction,
    onBeginEffectRangeSelection: props.beginEffectRangeSelection,
    onBeginPlayheadScrub: props.beginPlayheadScrub,
    onBeginRangeSelection: props.beginRangeSelection,
    onBeginTrackRangeSelection: props.beginTrackRangeSelection,
    onCloseTrackGap: props.onCloseTrackGap,
    ...(props.onDropEffectDocument ? { onDropEffectDocument: props.onDropEffectDocument } : {}),
    onImportTimelineFile: props.insertion.onImport,
    onResizeMotionRegion: props.onResizeMotionRegion,
    onScroll: () => props.syncTracksScroll('timeline'),
    onSeek: props.handleTimelineSeek,
    onSeekTime: props.onSeek,
    onStepToNextFrame: props.onStepToNextFrame,
    onStepToPreviousFrame: props.onStepToPreviousFrame,
    ...(props.onSelectHistorySpan ? { onSelectHistorySpan: props.onSelectHistorySpan } : {}),
    onSelectActionOccurrence: props.onSelectActionOccurrence,
    onSelectClip: props.onSelectClip,
    onSelectCursorSegment: props.onSelectCursorSegment,
    onSelectMotionRegion: props.onSelectMotionRegion,
    onConnectMotionRegions: props.onConnectMotionRegions,
    onSelectObjectTrack: props.onSelectObjectTrack,
    onSelectScene: props.onSelectScene,
    onSelectTrack: props.onSelectTrack,
    onSelectTransition: props.onSelectTransition,
    onSetHoveredClipId: props.setHoveredClipId,
    onTimelinePreviewViewportChange: props.onTimelinePreviewViewportChange,
    onUnsupportedTimelineFileDrop: props.insertion.onUnsupportedFileDrop,
  };
}
