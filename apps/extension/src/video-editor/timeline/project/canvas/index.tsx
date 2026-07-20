import type { RecordingTelemetryEntry } from '../../../../composition/persistence/recordings/contracts';
import type { MutableRefObject } from 'react';
import type { VideoProject } from '../../../../features/video/project/types';
import type { VideoEditorImportPlacement } from '../../../contracts/insertion';
import type { VideoEditorPlaybackRange } from '../../../interaction/playback/range';
import type { VideoEditorSelection } from '../../../contracts/selection';
import type { TimelineClipPreviewMap } from '../../../contracts/timeline-preview';
import { ProjectTimelinePlayhead, ProjectTimelineTrackLanes } from './parts/index';
import { buildProjectTimelineRulerMarkers } from './render-data';
import {
  EFFECT_LANE_ROW_HEIGHT,
  RULER_HEIGHT,
  TELEMETRY_LANE_ROW_HEIGHT,
} from '../interaction-state/helpers';
import { ProjectTimelineHoverPreview, useTimelineHoverPreview } from './hover-preview';
import { resolveTimelineTrackLayoutModel, type TimelineTrackLayoutModel } from '../tracks/layout';
import { useTimelinePreviewViewportReporter } from './preview-viewport';
import { ProjectTimelineTelemetryLane } from '../effect-lanes/telemetry-lane';
import { resolveTimelineTimeFromClientX } from '../interaction-state/seek';
import { ProjectTimelineCanvasChrome } from './chrome';
import type {
  DragMode,
  TimelineClipDragGhost,
  ProjectTimelineInsertionActions,
  TimelineEffectDragTarget,
  TimelineEffectSelection,
} from '../types';
import { resolveTimelineDropTrackId, type TimelineDropImportKind } from './drop-targets';
import { ProjectTimelineCanvasEffectRows } from './effect-rows';

interface ProjectTimelineCanvasProps {
  currentTime: number;
  dragGhost: TimelineClipDragGhost | null;
  playbackRange: VideoEditorPlaybackRange | null;
  pixelsPerSecond: number;
  project: VideoProject;
  recordingTelemetry: RecordingTelemetryEntry | null;
  selection: VideoEditorSelection;
  hoveredClipId: string | null;
  selectedClipId: string | null;
  selectedEffectSelection: TimelineEffectSelection | null;
  selectedTrackId: string | null;
  cursorLaneVisible?: boolean;
  telemetryLaneVisible: boolean;
  timelinePreviews: TimelineClipPreviewMap;
  seekToClientX: (clientX: number) => void;
  timelineRef: MutableRefObject<HTMLDivElement | null>;
  timelineWidth: number;
  trackLayoutModel?: TimelineTrackLayoutModel;
  tracks: VideoProject['tracks'];
  onBeginClipInteraction: (
    event: React.PointerEvent,
    clip: VideoProject['clips'][number],
    mode: DragMode
  ) => void;
  onBeginEffectInteraction: (event: React.PointerEvent, target: TimelineEffectDragTarget) => void;
  onBeginEffectRangeSelection: React.PointerEventHandler<HTMLDivElement>;
  onBeginRangeSelection: (event: React.PointerEvent<HTMLDivElement>) => void;
  onBeginTrackRangeSelection: (trackId: string) => React.PointerEventHandler<HTMLDivElement>;
  onAddMotionRegion: ProjectTimelineInsertionActions['onAddMotionRegion'];
  onCloseTrackGap: (trackId: string, gapStart: number, gapEnd: number) => void;
  onDropEffectDocument?: import('../types').ProjectTimelineProps['onDropEffectDocument'];
  onImportTimelineFile: ProjectTimelineInsertionActions['onImport'];
  onSeek: (event: React.MouseEvent<HTMLDivElement>) => void;
  onSelectActionSegment: (actionEventId: string) => void;
  onSelectClip: (clipId: string | null) => void;
  onSelectCursorSegment: (sampleId: string) => void;
  onSelectMotionRegion: (motionRegionId: string) => void;
  onSelectObjectTrack: (objectTrackId: string) => void;
  onSelectScene: () => void;
  onSelectTrack: (trackId: string) => void;
  onSelectTransition: (transitionId: string) => void;
  onSetHoveredClipId: (clipId: string | null) => void;
  onTimelinePreviewViewportChange: (viewport: { endTime: number; startTime: number }) => void;
  onUnsupportedTimelineFileDrop: () => void;
  onResizeActionEvent: (actionEventId: string, duration: number) => void;
  onResizeMotionRegion: (motionRegionId: string, startTime: number, duration: number) => void;
  onScroll: () => void;
}

type ProjectTimelineRulerMarker = ReturnType<typeof buildProjectTimelineRulerMarkers>[number];

function resolveTimelinePlayheadHeight(params: {
  cursorLaneVisible: boolean;
  project: VideoProject;
  telemetryLaneVisible: boolean;
  trackLayoutModel: TimelineTrackLayoutModel;
}) {
  return (
    RULER_HEIGHT +
    (params.telemetryLaneVisible ? TELEMETRY_LANE_ROW_HEIGHT : 0) +
    params.trackLayoutModel.totalTrackHeight +
    getEffectLaneCount(params.cursorLaneVisible, params.project) * EFFECT_LANE_ROW_HEIGHT
  );
}

export function ProjectTimelineCanvas(props: ProjectTimelineCanvasProps) {
  const model = useProjectTimelineCanvasModel(props);

  return (
    <div
      ref={props.timelineRef}
      className="relative min-w-0 overflow-auto"
      onClick={createCanvasSeekHandler(props.onSelectScene, props.onSeek)}
      onPointerDown={model.hoverPreview.clearHoverPreview}
      onPointerLeave={model.hoverPreview.clearHoverPreview}
      onPointerMove={model.hoverPreview.updateHoverPreview}
      onScroll={() => {
        props.onScroll();
        model.publishPreviewViewport();
      }}
    >
      <ProjectTimelineCanvasContent
        {...props}
        cursorLaneVisible={model.cursorLaneVisible}
        hoverTime={model.hoverPreview.hoverTime}
        playheadHeight={model.playheadHeight}
        playheadX={props.currentTime * props.pixelsPerSecond}
        rulerMarkers={model.rulerMarkers}
        trackLayoutModel={model.trackLayoutModel}
      />
    </div>
  );
}

function useProjectTimelineCanvasModel(props: ProjectTimelineCanvasProps) {
  const rulerMarkers = buildProjectTimelineRulerMarkers(props.timelineWidth, props.pixelsPerSecond);
  const trackLayoutModel = resolveTimelineTrackLayoutModel({
    project: props.project,
    trackHeightByTrackId: {},
    trackLayoutModel: props.trackLayoutModel,
    tracks: props.tracks,
  });
  const cursorLaneVisible = props.cursorLaneVisible !== false;
  const playheadHeight = resolveTimelinePlayheadHeight({
    cursorLaneVisible,
    project: props.project,
    telemetryLaneVisible: props.telemetryLaneVisible,
    trackLayoutModel,
  });
  const hoverPreview = useTimelineHoverPreview({
    pixelsPerSecond: props.pixelsPerSecond,
    timelineRef: props.timelineRef,
  });
  const publishPreviewViewport = useTimelinePreviewViewportReporter({
    onViewportChange: props.onTimelinePreviewViewportChange,
    pixelsPerSecond: props.pixelsPerSecond,
    timelineRef: props.timelineRef,
    timelineWidth: props.timelineWidth,
  });
  return {
    cursorLaneVisible,
    hoverPreview,
    playheadHeight,
    publishPreviewViewport,
    rulerMarkers,
    trackLayoutModel,
  };
}

function createCanvasSeekHandler(
  onSelectScene: ProjectTimelineCanvasProps['onSelectScene'],
  onSeek: ProjectTimelineCanvasProps['onSeek']
) {
  return (event: React.MouseEvent<HTMLDivElement>) => {
    onSelectScene();
    onSeek(event);
  };
}

function ProjectTimelineCanvasContent(
  props: ProjectTimelineCanvasProps & {
    cursorLaneVisible: boolean;
    hoverTime: number | null;
    playheadHeight: number;
    playheadX: number;
    trackLayoutModel: TimelineTrackLayoutModel;
    rulerMarkers: ProjectTimelineRulerMarker[];
  }
) {
  return (
    <div className="relative" style={{ width: props.timelineWidth + 120 }}>
      <ProjectTimelineCanvasChrome {...props} />
      <ProjectTimelineHoverPreview
        height={props.playheadHeight}
        hoverTime={props.hoverTime}
        pixelsPerSecond={props.pixelsPerSecond}
      />
      <ProjectTimelinePlayhead height={props.playheadHeight} left={props.playheadX} />
      {props.telemetryLaneVisible ? (
        <ProjectTimelineTelemetryLane
          pixelsPerSecond={props.pixelsPerSecond}
          project={props.project}
          recordingTelemetry={props.recordingTelemetry}
        />
      ) : null}
      <ProjectTimelineTrackLanes
        {...props}
        onDropTimelineFile={createTimelineFileDropHandler(props)}
        onUnsupportedTimelineFileDrop={props.onUnsupportedTimelineFileDrop}
      />
      <ProjectTimelineCanvasEffectRows {...props} />
    </div>
  );
}

function createTimelineFileDropHandler(props: ProjectTimelineCanvasProps) {
  return (params: {
    clientX: number;
    file: File;
    importKind: TimelineDropImportKind;
    targetTimelineLaneId?: string | null;
    targetTrackId: string;
  }) => {
    if (!props.timelineRef.current) {
      props.onUnsupportedTimelineFileDrop();
      return;
    }

    const placement: VideoEditorImportPlacement = {
      startTime: resolveTimelineTimeFromClientX(
        props.timelineRef.current,
        params.clientX,
        props.pixelsPerSecond
      ),
      timelineLaneId: params.targetTimelineLaneId ?? null,
      trackId: resolveTimelineDropTrackId(props.project, params.targetTrackId, params.importKind),
    };
    void props.onImportTimelineFile[params.importKind](params.file, placement);
  };
}

function getEffectLaneCount(cursorLaneVisible: boolean, _project: VideoProject): number {
  return 2 + (cursorLaneVisible ? 1 : 0);
}
