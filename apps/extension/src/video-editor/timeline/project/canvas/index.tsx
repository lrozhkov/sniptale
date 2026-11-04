import { useTimelineRecordingEvents } from './recording-events';
import { translate, useAppLocale } from '../../../../platform/i18n';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import type { VideoEditorRecordingActionObservation } from '../../../contracts/recording-events';
import { TimelineEffectDraftContext } from '../effect-lanes/segment';
import { getTimelineHistoryLayout } from '../effect-lanes/history-layout';
import { ProjectTimelineCursorLane } from '../effect-lanes/cursor-lane';
import { projectTimelinePoint, type TimelineProjection } from '../interaction-state/projection';
import type { TimelinePreviewViewport } from '../../../contracts/timeline-preview';
import type { RecordingTelemetryEntry } from '../../../../composition/persistence/recordings/contracts';
import {
  useCallback,
  useContext,
  useState,
  useLayoutEffect,
  useMemo,
  useRef,
  type MutableRefObject,
} from 'react';
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
import { getTimelineMotionLayout } from '../effect-lanes/segments';

interface ProjectTimelineCanvasProps {
  hiddenClipNamesByTrackId?: Readonly<Record<string, boolean>> | undefined;
  currentTime: number;
  isPlaying?: boolean | undefined;
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
  onSelectComment?:
    | ((documentId: string, commentId: string, projectTime?: number) => void)
    | undefined;
  onSelectHistorySpan?: (
    target: import('../../../contracts/commands/timeline').VideoEditorTypingSpanTarget
  ) => void;
  onSelectActionOccurrence: (
    eventId: string,
    clipId: string | null,
    observedAction?: VideoEditorRecordingActionObservation
  ) => void;
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
  useAppLocale();
  const model = useProjectTimelineCanvasModel(props);
  const effectDraft = useContext(TimelineEffectDraftContext);

  return (
    <div
      ref={props.timelineRef}
      data-ui="video-editor.timeline.canvas-scroll"
      aria-busy={model.history.status === 'loading'}
      tabIndex={-1}
      onPointerDownCapture={focusTimelineWorkingSurface}
      className="relative isolate min-w-0 overflow-auto outline-none"
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
      {model.history.status !== 'ready' && (
        <div
          className="sticky left-0 top-0 z-30 h-0"
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <div
            role="status"
            className={[
              'absolute left-1 top-1 flex max-w-[calc(100%-8px)] items-center gap-2 rounded border',
              'border-[color:var(--sniptale-color-border-soft)] bg-[var(--sniptale-color-surface-panel)]',
              'px-2 py-1 text-xs text-[var(--sniptale-color-text-secondary)]',
            ].join(' ')}
          >
            {model.history.status === 'failed' ? (
              <>
                <span>{translate('videoEditor.timeline.historyReadFailed')}</span>
                <ProductActionButton compact tone="secondary" onClick={model.history.retry}>
                  {translate('common.actions.retry')}
                </ProductActionButton>
              </>
            ) : (
              translate('common.states.loading')
            )}
          </div>
        </div>
      )}
      <ProjectTimelineCanvasContent
        {...props}
        project={model.history.project}
        cursorLaneVisible={model.cursorLaneVisible}
        telemetryLaneVisible={model.telemetryLaneVisible}
        hoverTime={model.hoverPreview.hoverTime}
        hoverPointer={model.hoverPreview.pointer}
        timingFeedback={props.dragGhost?.timingFeedback ?? effectDraft?.timingFeedback}
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
  const history = useTimelineRecordingEvents(
    props.project,
    props.projection ?? viewport,
    props.pixelsPerSecond
  );
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
  const { project, trackLayoutModel: suppliedTrackLayout, tracks } = props;
  const trackLayoutModel = useMemo(
    () =>
      resolveTimelineTrackLayoutModel({
        project,
        trackHeightByTrackId: {},
        trackLayoutModel: suppliedTrackLayout,
        tracks,
      }),
    [project, suppliedTrackLayout, tracks]
  );
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
    history,
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
    hoverPointer: { clientX: number; clientY: number } | null;
    timingFeedback: TimelineClipDragGhost['timingFeedback'] | undefined;
    onClearHoverPreview: () => void;
    playheadHeight: number;
    playheadX: number | null;
    trackLayoutModel: TimelineTrackLayoutModel;
    rulerMarkers: ProjectTimelineRulerMarker[];
  }
) {
  const effectKind = props.selectedEffectSelection?.kind;
  const effectSegmentId = props.selectedEffectSelection?.segmentId;
  const selectedEffectSelection = useMemo(
    () =>
      effectKind !== undefined && effectSegmentId !== undefined
        ? { kind: effectKind, segmentId: effectSegmentId }
        : null,
    [effectKind, effectSegmentId]
  );
  const latest = useRef(props);
  useLayoutEffect(() => {
    latest.current = props;
  });
  const laneEvents = useMemo<
    Pick<
      React.ComponentProps<typeof ProjectTimelineTrackLanes>,
      | 'onBeginClipInteraction'
      | 'onBeginEffectInteraction'
      | 'onBeginTrackRangeSelection'
      | 'onCloseTrackGap'
      | 'onDropEffectDocument'
      | 'onSelectClip'
      | 'onSelectTransition'
      | 'onSetHoveredClipId'
      | 'onUnsupportedTimelineFileDrop'
      | 'onDropTimelineFile'
    >
  >(
    () => ({
      onBeginClipInteraction: (...args) => latest.current.onBeginClipInteraction(...args),
      onBeginEffectInteraction: (...args) => latest.current.onBeginEffectInteraction(...args),
      onBeginTrackRangeSelection: (...args) => latest.current.onBeginTrackRangeSelection(...args),
      onCloseTrackGap: (...args) => latest.current.onCloseTrackGap(...args),
      onDropEffectDocument: (...args) => latest.current.onDropEffectDocument?.(...args),
      onSelectClip: (...args) => latest.current.onSelectClip(...args),
      onSelectTransition: (...args) => latest.current.onSelectTransition(...args),
      onSetHoveredClipId: (...args) => latest.current.onSetHoveredClipId(...args),
      onUnsupportedTimelineFileDrop: (...args) =>
        latest.current.onUnsupportedTimelineFileDrop(...args),
      onDropTimelineFile: (input) => createTimelineFileDropHandler(latest.current)(input),
    }),
    []
  );

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
                isPlaying={props.isPlaying}
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
          pointer={props.hoverPointer}
          timingFeedback={props.timingFeedback}
          timelineRef={props.timelineRef}
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
          <ProjectTimelinePlayheadLine
            isPlaying={props.isPlaying}
            height={props.playheadHeight}
            left={props.playheadX}
          />
        )}
        {props.telemetryLaneVisible ? (
          <ProjectTimelineTelemetryLane
            cursorLaneVisible={props.cursorLaneVisible}
            cursorRow={
              props.cursorLaneVisible ? (
                <ProjectTimelineCursorLane
                  embedded
                  recordingTelemetry={props.recordingTelemetry}
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
          hiddenClipNamesByTrackId={props.hiddenClipNamesByTrackId}
          pixelsPerSecond={props.pixelsPerSecond}
          projection={props.projection}
          project={props.project}
          dragGhost={props.dragGhost}
          selection={props.selection}
          hoveredClipId={props.hoveredClipId}
          selectedClipId={props.selectedClipId}
          selectedEffectSelection={selectedEffectSelection}
          selectedTrackId={props.selectedTrackId}
          timelinePreviews={props.timelinePreviews}
          trackLayoutModel={props.trackLayoutModel}
          tracks={props.tracks}
          {...laneEvents}
          onDropEffectDocument={
            props.onDropEffectDocument ? laneEvents.onDropEffectDocument : undefined
          }
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
  return getTimelineMotionLayout(project).rowCount;
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
