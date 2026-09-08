import { getTimelineHistoryLayout } from '../effect-lanes/history-layout';
import { ProjectTimelineCursorLane } from '../effect-lanes/cursor-lane';
import { projectTimelinePoint, type TimelineProjection } from '../interaction-state/projection';
import type { TimelinePreviewViewport } from '../../../contracts/timeline-preview';
import type { RecordingTelemetryEntry } from '../../../../composition/persistence/recordings/contracts';
import { useCallback, useState, type MutableRefObject } from 'react';
import type { VideoProject } from '../../../../features/video/project/types';
import type { VideoEditorImportPlacement } from '../../../contracts/insertion';
import type { VideoEditorPlaybackRange } from '../../../interaction/playback/range';
import type { VideoEditorSelection } from '../../../contracts/selection';
import type { TimelineClipPreviewMap } from '../../../contracts/timeline-preview';
import {
  ProjectTimelinePlayheadHandle,
  ProjectTimelinePlayheadLine,
  ProjectTimelineTrackLanes,
} from './parts/index';
import { buildProjectTimelineRulerMarkers } from './render-data';
import { EFFECT_LANE_ROW_HEIGHT, RULER_HEIGHT } from '../interaction-state/helpers';
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
import { getTimelineUtilityRowPresence } from '../effect-lanes/segments';

interface ProjectTimelineCanvasProps {
  hiddenClipNamesByTrackId?: Readonly<Record<string, boolean>> | undefined;
  currentTime: number;
  consumeCompletedScrubClick: () => boolean;
  dragGhost: TimelineClipDragGhost | null;
  playbackRange: VideoEditorPlaybackRange | null;
  pixelsPerSecond: number;
  project: VideoProject;
  recordingTelemetry: readonly RecordingTelemetryEntry[];
  selection: VideoEditorSelection;
  snapGuideTime: number | null;
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
  projection?: TimelineProjection | undefined;
  readTimelineStartTime?: (() => number) | undefined;
  trackLayoutModel?: TimelineTrackLayoutModel;
  tracks: VideoProject['tracks'];
  onBeginClipInteraction: (
    event: React.PointerEvent,
    clip: VideoProject['clips'][number],
    mode: DragMode
  ) => void;
  onBeginEffectInteraction: (event: React.PointerEvent, target: TimelineEffectDragTarget) => void;
  onBeginPlayheadScrub: (
    event: React.PointerEvent<HTMLElement>,
    currentTime: number,
    onComplete: () => void
  ) => void;
  onBeginEffectRangeSelection: React.PointerEventHandler<HTMLDivElement>;
  onBeginRangeSelection: (event: React.PointerEvent<HTMLDivElement>) => void;
  onBeginTrackRangeSelection: (trackId: string) => React.PointerEventHandler<HTMLDivElement>;
  onAddMotionRegion: ProjectTimelineInsertionActions['onAddMotionRegion'];
  onCloseTrackGap: (trackId: string, gapStart: number, gapEnd: number) => void;
  onDropEffectDocument?: import('../types').ProjectTimelineProps['onDropEffectDocument'];
  onImportTimelineFile: ProjectTimelineInsertionActions['onImport'];
  onSeek: (event: React.MouseEvent<HTMLDivElement>) => void;
  onSeekTime: (time: number) => void;
  onStepToNextFrame: () => void;
  onStepToPreviousFrame: () => void;
  onSelectHistorySpan?: (
    target: import('../../../contracts/commands/timeline').VideoEditorTypingSpanTarget
  ) => void;
  onSelectActionOccurrence: (eventId: string, clipId: string | null) => void;
  onSelectClip: (clipId: string | null, intent?: 'replace' | 'toggle' | 'range') => void;
  onSelectCursorSegment: (sampleId: string) => void;
  onSelectMotionRegion: (motionRegionId: string, part?: 'connection') => void;
  onConnectMotionRegions?: ((fromRegionId: string, toRegionId: string) => void) | undefined;
  onSelectObjectTrack: (objectTrackId: string) => void;
  onSelectScene: () => void;
  onSelectTrack: (trackId: string) => void;
  onSelectTransition: (transitionId: string) => void;
  onSetHoveredClipId: (clipId: string | null) => void;
  onTimelinePreviewViewportChange: (viewport: TimelinePreviewViewport) => void;
  onUnsupportedTimelineFileDrop: () => void;
  onResizeMotionRegion: (motionRegionId: string, startTime: number, duration: number) => void;
  onScroll: () => void;
}

type ProjectTimelineRulerMarker = ReturnType<typeof buildProjectTimelineRulerMarkers>[number];

function resolveTimelinePlayheadHeight(params: {
  recordingTelemetry: readonly RecordingTelemetryEntry[];
  cursorLaneVisible: boolean;
  project: VideoProject;
  telemetryLaneVisible: boolean;
  trackLayoutModel: TimelineTrackLayoutModel;
}) {
  return (
    RULER_HEIGHT +
    (params.telemetryLaneVisible
      ? getTimelineHistoryLayout(
          params.project,
          params.recordingTelemetry,
          params.cursorLaneVisible
        ).height
      : 0) +
    params.trackLayoutModel.totalTrackHeight +
    getEffectLaneCount(params.project) * EFFECT_LANE_ROW_HEIGHT
  );
}

export function ProjectTimelineCanvas(props: ProjectTimelineCanvasProps) {
  const model = useProjectTimelineCanvasModel(props);

  return (
    <div
      ref={props.timelineRef}
      data-ui="video-editor.timeline.canvas-scroll"
      tabIndex={-1}
      onPointerDownCapture={focusTimelineWorkingSurface}
      className="relative min-w-0 overflow-auto outline-none"
      onClick={createCanvasSeekHandler(
        props.consumeCompletedScrubClick,
        props.onSelectScene,
        props.onSeek
      )}
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
        telemetryLaneVisible={model.telemetryLaneVisible}
        hoverTime={model.hoverPreview.hoverTime}
        onClearHoverPreview={model.hoverPreview.clearHoverPreview}
        playheadHeight={model.playheadHeight}
        playheadX={
          props.projection
            ? projectTimelinePoint(props.projection, props.currentTime)
            : props.currentTime * props.pixelsPerSecond
        }
        rulerMarkers={model.rulerMarkers}
        trackLayoutModel={model.trackLayoutModel}
      />
    </div>
  );
}

function useProjectTimelineCanvasModel(props: ProjectTimelineCanvasProps) {
  const [viewport, setViewport] = useState({ startTime: 0, endTime: 0 });
  const onViewportChange = props.onTimelinePreviewViewportChange;
  const publishViewport = useCallback(
    (next: TimelinePreviewViewport) => {
      setViewport(next);
      onViewportChange(next);
    },
    [onViewportChange]
  );
  const rulerMarkers = buildProjectTimelineRulerMarkers(
    props.timelineWidth,
    props.pixelsPerSecond,
    props.projection ?? viewport,
    props.project.fps
  );
  const trackLayoutModel = resolveTimelineTrackLayoutModel({
    project: props.project,
    trackHeightByTrackId: {},
    trackLayoutModel: props.trackLayoutModel,
    tracks: props.tracks,
  });
  const cursorLaneVisible =
    props.telemetryLaneVisible &&
    props.cursorLaneVisible !== false &&
    props.project.cursorTrack !== null;
  const telemetryLaneVisible = props.telemetryLaneVisible;
  const playheadHeight = resolveTimelinePlayheadHeight({
    recordingTelemetry: props.recordingTelemetry,
    cursorLaneVisible,
    project: props.project,
    telemetryLaneVisible,
    trackLayoutModel,
  });
  const hoverPreview = useTimelineHoverPreview({
    pixelsPerSecond: props.pixelsPerSecond,
    timelineRef: props.timelineRef,
    readTimelineStartTime: props.readTimelineStartTime,
  });
  const publishPreviewViewport = useTimelinePreviewViewportReporter({
    onViewportChange: publishViewport,
    pixelsPerSecond: props.pixelsPerSecond,
    timelineRef: props.timelineRef,
    timelineWidth: props.timelineWidth,
    startTime: props.projection?.startTime,
  });
  return {
    cursorLaneVisible,
    hoverPreview,
    playheadHeight,
    publishPreviewViewport,
    rulerMarkers,
    telemetryLaneVisible,
    trackLayoutModel,
  };
}

function createCanvasSeekHandler(
  consumeCompletedScrubClick: ProjectTimelineCanvasProps['consumeCompletedScrubClick'],
  onSelectScene: ProjectTimelineCanvasProps['onSelectScene'],
  onSeek: ProjectTimelineCanvasProps['onSeek']
) {
  return (event: React.MouseEvent<HTMLDivElement>) => {
    if (consumeCompletedScrubClick()) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    onSelectScene();
    onSeek(event);
  };
}

function ProjectTimelineCanvasContent(
  props: ProjectTimelineCanvasProps & {
    cursorLaneVisible: boolean;
    hoverTime: number | null;
    onClearHoverPreview: () => void;
    playheadHeight: number;
    playheadX: number | null;
    trackLayoutModel: TimelineTrackLayoutModel;
    rulerMarkers: ProjectTimelineRulerMarker[];
  }
) {
  return (
    <div
      className="relative"
      style={{ width: props.projection?.scrollWidth ?? props.timelineWidth + 120 }}
    >
      <div
        className="sticky left-0 overflow-clip"
        style={{ width: props.projection?.viewportWidth ?? props.timelineWidth + 120 }}
      >
        <ProjectTimelineCanvasChrome
          {...props}
          playheadHandle={
            props.playheadX === null ? null : (
              <ProjectTimelinePlayheadHandle
                currentTime={props.currentTime}
                duration={props.project.duration}
                left={props.playheadX}
                onBeginScrub={(event, currentTime) =>
                  props.onBeginPlayheadScrub(event, currentTime, props.onClearHoverPreview)
                }
                onSeekTime={props.onSeekTime}
                onStepToNextFrame={props.onStepToNextFrame}
                onStepToPreviousFrame={props.onStepToPreviousFrame}
              />
            )
          }
        />
        <ProjectTimelineHoverPreview
          height={props.playheadHeight}
          hoverTime={props.hoverTime}
          pixelsPerSecond={props.pixelsPerSecond}
          projection={props.projection}
        />
        <ProjectTimelineSnapGuide
          height={props.playheadHeight}
          left={
            props.snapGuideTime === null
              ? null
              : props.projection
                ? projectTimelinePoint(props.projection, props.snapGuideTime)
                : props.snapGuideTime * props.pixelsPerSecond
          }
        />
        {props.playheadX === null ? null : (
          <ProjectTimelinePlayheadLine height={props.playheadHeight} left={props.playheadX} />
        )}
        {props.telemetryLaneVisible ? (
          <ProjectTimelineTelemetryLane
            cursorLaneVisible={props.cursorLaneVisible}
            cursorRow={
              props.cursorLaneVisible ? (
                <ProjectTimelineCursorLane
                  embedded
                  project={props.project}
                  pixelsPerSecond={props.pixelsPerSecond}
                  projection={props.projection}
                  selectedEffectSelection={props.selectedEffectSelection}
                  onBeginEffectInteraction={props.onBeginEffectInteraction}
                />
              ) : null
            }
            onBeginEffectInteraction={props.onBeginEffectInteraction}
            onSeek={props.onSeekTime}
            onSelectHistorySpan={props.onSelectHistorySpan}
            onSelectActionOccurrence={props.onSelectActionOccurrence}
            selection={props.selection}
            pixelsPerSecond={props.pixelsPerSecond}
            projection={props.projection}
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
    </div>
  );
}

function ProjectTimelineSnapGuide(props: { height: number; left: number | null }) {
  if (props.left === null) return null;
  return (
    <div
      aria-hidden="true"
      data-ui="video-editor.timeline.snap-guide"
      className={[
        'pointer-events-none absolute top-0 z-30 w-px',
        'bg-[var(--sniptale-color-accent-emphasis)] opacity-80',
        'shadow-[0_0_8px_var(--sniptale-color-accent-soft)]',
      ].join(' ')}
      style={{ height: props.height, left: props.left }}
    />
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
        props.pixelsPerSecond,
        props.readTimelineStartTime?.()
      ),
      timelineLaneId: params.targetTimelineLaneId ?? null,
      trackId: resolveTimelineDropTrackId(props.project, params.targetTrackId, params.importKind),
    };
    void props.onImportTimelineFile[params.importKind](params.file, placement);
  };
}

function getEffectLaneCount(project: VideoProject): number {
  const rows = getTimelineUtilityRowPresence(project);
  return Number(rows.motion);
}

function focusTimelineWorkingSurface(event: React.PointerEvent<HTMLDivElement>): void {
  if (event.button !== 0 || !(event.target instanceof Element)) return;
  if (
    event.target.closest(
      [
        'input, textarea, select, [contenteditable="true"]',
        '[role="slider"], [role="separator"], [role="menu"]',
        '[role="listbox"], button[aria-haspopup]',
      ].join(', ')
    )
  )
    return;
  event.currentTarget.focus({ preventScroll: true });
}
