import { ReviewTimelineHints } from './timeline-hints';
import { ReviewPlaybackPresentationClockContext } from './playback-presentation-clock';
import { createReviewDisplayMap } from '../../features/video/review/timeline';
import { Keyboard, Mouse } from 'lucide-react';
import { reviewInteractionFamily } from '../../features/video/review/interaction-timeline';

import { ReviewTrackVisibilityButton } from './track-row';
import { ReviewTimelinePanes } from './timeline-panes';
import { ReviewTimelineResizeGuide } from './timeline-resize-guide';
import type { RecordingTelemetryCapabilities } from '../../features/video/project/types';
import { useContext, Fragment, useCallback, useEffect, useMemo, useRef } from 'react';
import { REVIEW_TRACK_ORDER } from './track-order';
import type { QuickEditTrack } from '../../features/video/review/advanced/types';
import { reviewTrackStatusButtonClassName } from './controls';
import type { ReviewClickAnimation } from '../../features/video/review/advanced/click-animation';
import { ReviewPlaybackRangeOverlay, useReviewRulerRange } from './ruler-range';
import type { ReviewPlaybackRange } from './playback-range';
import type { ReviewBeforeAction } from './note-transitions';
import { Eye, EyeOff } from 'lucide-react';
import { ReviewTrackRow, ReviewTrackCuts, reviewTrackMetrics } from './track-row';
import { createTrackProjection } from './track-projection';
import { ReviewPlayhead, ReviewRulerRow, ReviewToolbar } from './timeline-chrome';
import { ReviewSourceLane, ReviewEditBlock } from './timeline-selection';
import type { ReactNode, CSSProperties } from 'react';
import { translate } from '../../platform/i18n';
import type { ReviewAnchor, ReviewAnnotation, ReviewEdit } from '../../features/video/review/types';
import type { ReviewTelemetryMarker } from '../../features/video/review/telemetry';
import { ReviewTelemetryStrip, type ReviewCursorTimelineInteractions } from './timeline-telemetry';
import { useReviewTimelinePlaneDrag } from './timeline-drag';
import { useReviewTimelineHover, type ReviewPlacementHints } from './timeline-hover';
import {
  useReviewTimelineGeometry,
  useReviewTimelineNavigation,
  useReviewToolLaneNavigation,
} from './timeline-geometry';
import { reviewTimeLabel } from './controls';
import { createReviewTimeMap } from '../../features/video/review/timeline';

type TimelineProps = ReviewCursorTimelineInteractions & {
  onHoverIntent?: ((starting: boolean) => void) | undefined;
  onHoverTime?: ((time: number | null, resultTime?: number) => void) | undefined;
  onHistoryRange?: ((range: { start: number; end: number }) => void) | undefined;
  cursorArchiveAvailable?: boolean | undefined;
  sourceId?: string | undefined;
  interactionEditor?: import('./interaction-editor').ReviewInteractionEditor | undefined;
  keyboardEnabled?: boolean | undefined;
  mouseEnabled?: boolean | undefined;
  onToggleFamily?(family: 'keyboard' | 'mouse'): void;
  actionsEnabled?: boolean | undefined;
  onToggleActions?: (() => void) | undefined;
  keyAnimations?:
    | readonly import('../../features/video/project/action-feedback/key-animation').ReviewKeyAnimation[]
    | undefined;
  clickAnimations?: readonly ReviewClickAnimation[] | undefined;
  fillHeight?: boolean | undefined;
  sourceCompact?: boolean | undefined;
  placementHints?: ReviewPlacementHints | undefined;
  beforeAction?: ReviewBeforeAction | undefined;
  busy?: boolean;
  playbackRange?: ReviewPlaybackRange | null | undefined;
  onPlaybackRange?: ((range: ReviewPlaybackRange | null) => void) | undefined;
  onPause?: (() => void) | undefined;
  annotationTool?: boolean;
  annotationDrawing?: boolean;
  sourceRangeTool?: boolean;
  sourceRangeKind?: 'cut' | 'speed' | undefined;
  duration: number;
  resultTime?: number | null;
  resultDuration?: number;
  onSeekResult?: ((time: number) => void) | undefined;
  onFreezeDurationChange?: ((edit: ReviewEdit, duration: number) => unknown) | undefined;
  onFreezeMove?: ((edit: ReviewEdit, time: number) => unknown) | undefined;
  sourceInsertions?: ReactNode;
  snapClock?: { output(time: number): number; fromDisplay?(time: number): number } | undefined;
  time: number;
  playing: boolean;
  navigationRevision?: number | undefined;
  selection: ReviewAnchor;
  annotations: readonly ReviewAnnotation[];
  edits?: readonly ReviewEdit[];
  selectedEditId?: string | undefined;
  zoomAnchor?: number | null | undefined;
  historyControls?: ReactNode;
  utilityControls?: ReactNode;
  navigationControls?: ReactNode;
  modeControl?: ReactNode;
  inspectorControls?: ReactNode;
  tools?: ReactNode;
  trackControls?: ReactNode;
  expandedTools?: boolean;
  cursorMotionTrack?: ReactNode;
  zoomTrack?: ReactNode;
  webcamTrack?: ReactNode;
  audioTracks?: Partial<Record<'originalAudio' | 'voiceover' | 'music', ReactNode>>;
  trackOrder?: readonly QuickEditTrack[];
  textTrack?: ReactNode;
  annotationEffectsTrack?: ReactNode;
  boundaries?: readonly number[];
  snapTimes?: readonly number[] | undefined;
  onRangeCommit?(range: ReviewAnchor): void;
  onTextRangeCommit?: ((range: Extract<ReviewAnchor, { kind: 'range' }>) => void) | undefined;
  onTrackRangeCommit?: ((range: Extract<ReviewAnchor, { kind: 'range' }>) => void) | undefined;
  onFocusRangeCommit?: ((range: ReviewAnchor) => void) | undefined;
  onFocusRangePreview?: ((range: ReviewAnchor | null) => void) | undefined;
  originalRangeTool?: boolean;
  snapRangePreview?: boolean;
  onChangeEdit?(edit: ReviewEdit, range: ReviewAnchor): void | Promise<void>;
  onEdit?(edit: ReviewEdit): void;
  markers: readonly ReviewTelemetryMarker[];
  captureCapabilities?: RecordingTelemetryCapabilities | null | undefined;
  selectedTelemetryRef?: ReviewTelemetryMarker['ref'];
  onSeek(time: number, snap?: boolean): void;
  onClearSelection?(): void;
  onSelect(value: ReviewAnchor): void;
  onPlay(): void;
  onOpenExport?: (() => void) | undefined;
  exportActive?: boolean | undefined;

  actionsTrackVisible?: boolean;
  onMarker(marker: ReviewTelemetryMarker): void;
  onComment(annotation: ReviewAnnotation): void;
};

/** One source lane, with an independent ruler/playhead rather than browser slider chrome. */
function ReviewTimelineSurface(props: TimelineProps) {
  const { viewport, gutter, width } = useReviewTimelineGeometry();
  const { zoom, navigation, navigate, onZoom, wheelTarget, follow } = useReviewTimelineNavigation(
    props,
    {
      viewport,
      gutter,
      width,
    }
  );
  const { onHistoryRange, duration } = props;
  const reportedHistory = useRef<{
    report: NonNullable<TimelineProps['onHistoryRange']>;
    start: number;
    end: number;
  } | null>(null);
  const reportHistoryRange = useCallback(() => {
    if (!onHistoryRange) return;
    const start = Math.max(
      0,
      Math.min(
        duration,
        ((viewport.current?.scrollLeft ?? 0) / Math.max(1, width * zoom)) * duration
      )
    );
    const end = Math.max(start, Math.min(duration, start + duration / zoom));
    if (!Number.isFinite(start) || !Number.isFinite(end)) return;
    const previous = reportedHistory.current;
    if (previous?.report === onHistoryRange && previous.start === start && previous.end === end)
      return;
    reportedHistory.current = { report: onHistoryRange, start, end };
    onHistoryRange({ start, end });
  }, [onHistoryRange, duration, width, zoom, viewport]);
  useEffect(() => reportHistoryRange(), [reportHistoryRange]);
  const ruler = useReviewRulerRange({
    ...props,
    range: props.playbackRange ?? null,
    navigation,
    onChange: (range) => props.onPlaybackRange?.(range),
  });
  const activeLane = useReviewToolLaneNavigation(viewport, {
    focus: !!props.onFocusRangeCommit,
    original: !!props.originalRangeTool,
    source: !!props.sourceRangeTool,
    annotation: !!props.annotationTool,
  });
  const plane = useReviewTimelinePlaneDrag({ ...props, gutter });
  const hover = useReviewTimelineHover({
    onPreview: props.onHoverTime,
    placementHints: props.placementHints,
    busy: !!props.busy,
    duration: props.duration,
    gutter,
    width,
    zoom,
    annotationEnabled: !!props.annotationDrawing,
    focusEnabled: !!props.onFocusRangeCommit,
    originalEnabled: !!props.originalRangeTool,
    sourceRangeTool: !!props.sourceRangeTool,
    snapRangePreview: !!props.snapRangePreview,
    boundaries: props.boundaries,
  });
  const rows: Partial<Record<QuickEditTrack, ReactNode>> = {
    keyboard: <ReviewTimelineEvents {...props} family="keyboard" width={width} zoom={zoom} />,
    mouse: <ReviewTimelineEvents {...props} family="mouse" width={width} zoom={zoom} />,
    source: (
      <ReviewSourceLane
        {...props}
        drawingRange={plane.sourcePreview}
        drawingKind={props.sourceRangeKind}
        rangeEnabled={!props.onFocusRangeCommit && !props.originalRangeTool}
        snapToKeyframes={!!props.boundaries}
      />
    ),
    webcam: props.webcamTrack,
    zoom: props.zoomTrack,
    cursorMotion: props.cursorMotionTrack,
    text: props.textTrack,
    annotationEffects: props.annotationEffectsTrack,
    ...props.audioTracks,
  };
  return (
    <section
      ref={wheelTarget}
      data-ui="gallery.videoReview.timeline"
      data-active-tool-lane={activeLane ?? undefined}
      className={`@container flex min-h-0 ${reviewTimelineHeightClass(props)} min-w-0 max-w-full shrink-0 flex-col
        overflow-hidden border-t border-[var(--sniptale-color-border-soft)]`}
    >
      <ReviewTimelineHints />
      <ReviewToolbar
        {...props}
        playbackRange={props.playbackRange}
        onClearPlaybackRange={ruler.clear}
        navigation={navigation}
        onNavigate={navigate}
        resultDuration={
          props.resultDuration ??
          createReviewTimeMap(props.duration, props.edits ?? []).getDuration()
        }
        zoom={zoom}
        onPlay={() => (props.beforeAction ?? ((action) => action()))(props.onPlay)}
        onZoom={onZoom}
      />
      <ReviewTimelinePanes viewport={viewport} busy={props.busy}>
        <div
          ref={viewport}
          data-ui="gallery.videoReview.timelineViewport"
          style={{ overflowX: zoom === 1 ? 'hidden' : 'auto', scrollbarGutter: 'stable' }}
          onScroll={() => {
            follow.onScroll();
            hover.clear();
            reportHistoryRange();
          }}
          {...follow.interaction}
          className={`w-full min-h-0 min-w-0 max-w-full overflow-auto overscroll-contain
          ${props.fillHeight ? 'flex-1' : ''}`}
        >
          <div
            ref={plane.plane}
            data-ui="gallery.videoReview.timePlane"
            data-active-tool-lane={activeLane ?? undefined}
            title={hover.reason}
            role="slider"
            tabIndex={0}
            aria-label={translate('gallery.videoReview.position')}
            aria-valuemin={0}
            aria-valuemax={props.duration}
            aria-valuenow={props.time}
            aria-valuetext={reviewTimeLabel(props.time)}
            className="group/plane relative overflow-clip pb-2 outline-none focus-visible:ring-1
            focus-visible:ring-inset focus-visible:ring-[var(--sniptale-color-accent)]"
            style={
              {
                // CSS follows the resized viewport before ResizeObserver can update ruler measurements.
                width: zoom === 1 ? '100%' : `calc(${zoom * 100}% - ${gutter * (zoom - 1)}px)`,
                '--review-track-gutter': `${gutter}px`,
                cursor: hover.cursor,
              } as CSSProperties
            }
            onPointerDownCapture={(event) => {
              if (event.target instanceof Node && event.currentTarget.contains(event.target)) {
                if (event.button === 0) props.onHoverIntent?.(true);
                hover.clear();
              }
            }}
            onPointerDown={plane.onPointerDown}
            onPointerMoveCapture={(event) => {
              if (
                event.target instanceof Element &&
                event.target.closest('[data-playback-range-edge]')
              ) {
                hover.clear();
                return;
              }
              if (event.target instanceof Node && event.currentTarget.contains(event.target))
                hover.move(event, plane.activeLane());
              else hover.clear();
            }}
            onPointerMove={plane.onPointerMove}
            onBlurCapture={(event) => {
              // A pending commit makes its row inert after pointer release.
              if (
                event.relatedTarget === null &&
                event.target.closest('[inert]') &&
                document.activeElement === document.body
              )
                event.currentTarget.focus({ preventScroll: true });
            }}
            onPointerUp={(event) => {
              plane.onPointerUp(event);
              props.onHoverIntent?.(false);
              hover.clear();
            }}
            onPointerCancel={() => {
              plane.onPointerCancel();
              props.onHoverIntent?.(false);
              hover.clear();
            }}
            onPointerLeave={hover.clear}
          >
            <ReviewPlaybackRangeOverlay
              range={plane.trackPreview ?? ruler.range}
              duration={props.duration}
              gutter={gutter}
              width={Math.max(1, width * zoom)}
              edgeInteraction={
                props.playbackRange && !plane.trackPreview && props.onPlaybackRange
                  ? ruler.edgeInteraction
                  : undefined
              }
            />
            <ReviewTimelineResizeGuide
              key={props.sourceId}
              hover={hover.hover}
              viewport={viewport}
              gutter={gutter}
              width={Math.max(1, width * zoom)}
              duration={props.duration}
            >
              <ReviewRulerRow
                controls={props.trackControls}
                interaction={ruler.interaction}
                time={props.time}
                duration={props.duration}
                gutter={gutter}
                width={Math.max(1, width * zoom)}
              />
              <ReviewPlayhead
                time={props.time}
                duration={props.duration}
                gutter={gutter}
                width={Math.max(1, width * zoom)}
              />
              <div inert={props.busy}>
                {(props.trackOrder ?? REVIEW_TRACK_ORDER).map((track) => (
                  <Fragment key={track}>{rows[track]}</Fragment>
                ))}
              </div>
            </ReviewTimelineResizeGuide>
          </div>
        </div>
      </ReviewTimelinePanes>
    </section>
  );
}

/** The small viewport budget includes transport, sticky ruler, all history rows and scrollbar. */
function reviewTimelineHeightClass(
  props: Pick<
    TimelineProps,
    | 'fillHeight'
    | 'markers'
    | 'onAddCursorFocusKey'
    | 'actionsTrackVisible'
    | 'cursorArchiveAvailable'
  >
) {
  if (props.fillHeight) return 'h-full';
  return props.actionsTrackVisible !== false &&
    (props.markers.length || props.onAddCursorFocusKey || props.cursorArchiveAvailable)
    ? 'max-h-[max(160px,min(42dvh,calc(100dvh-420px)))]'
    : 'max-h-[min(42dvh,calc(100dvh-420px))]';
}

/** Independent semantic rows retain the compact capture-event presentation. */
function ReviewTimelineEvents(
  props: TimelineProps & { family: 'keyboard' | 'mouse'; width: number; zoom: number }
) {
  const animated = useMemo(
    () =>
      new Set([
        ...(props.clickAnimations ?? []).filter((p) => p.effect !== 'off').map((p) => p.id),
        ...(props.keyAnimations ?? []).filter((p) => p.enabled).map((p) => p.id),
      ]),
    [props.clickAnimations, props.keyAnimations]
  );
  const markers = useMemo(
    () => props.markers.filter((m) => reviewInteractionFamily(m) === props.family),
    [props.markers, props.family]
  );
  if (props.actionsTrackVisible === false) return null;
  const enabled =
    props.family === 'keyboard' ? props.keyboardEnabled !== false : props.mouseEnabled !== false;
  return (
    <ReviewTrackRow
      track={props.family}
      muted={!enabled}
      label={translate(
        props.family === 'keyboard'
          ? 'gallery.videoReview.historyKeyboard'
          : 'gallery.videoReview.historyMouse'
      )}
      icon={props.family === 'keyboard' ? <Keyboard size={14} /> : <Mouse size={14} />}
      controls={
        <>
          <ReviewTrackVisibilityButton
            track={props.family}
            label={translate('gallery.videoReview.historyEffectsEnabled')}
            className={reviewTrackStatusButtonClassName}
            aria-pressed={enabled}
            onClick={() => props.onToggleFamily?.(props.family)}
          >
            {enabled ? <Eye size={14} /> : <EyeOff size={14} />}
          </ReviewTrackVisibilityButton>
        </>
      }
    >
      <div
        className="relative rounded bg-[var(--sniptale-color-surface-hover)]"
        style={{ height: reviewTrackMetrics(true).step }}
        data-ui={`gallery.videoReview.${props.family}Track`}
      >
        <ReviewTelemetryStrip
          family={props.family}
          interactionEditor={props.interactionEditor}
          sourceId={props.sourceId}
          captureCapabilities={props.captureCapabilities}
          markers={markers}
          animatedIds={animated}
          duration={props.duration}
          time={props.time}
          width={props.width}
          zoom={props.zoom}
          selectedTelemetryRef={props.selectedTelemetryRef}
          onMarker={props.onMarker}
        />
        <ReviewTrackCuts projection={createTrackProjection(props.duration, props.edits ?? [])} />
      </div>
    </ReviewTrackRow>
  );
}

/** All visible source lanes share inserted display time; durable edits keep original source coordinates. */
export function ReviewTimeline(props: TimelineProps) {
  const display = useMemo(
    () => createReviewDisplayMap(props.duration, props.edits ?? []),
    [props.duration, props.edits]
  );
  const clock = useContext(ReviewPlaybackPresentationClockContext);
  const mappedClock = useMemo(
    () =>
      clock
        ? {
            ...clock,
            read: () =>
              clock.readResult
                ? display.resultToDisplay(clock.readResult())
                : display.sourceToDisplay(clock.read()),
          }
        : null,
    [clock, display]
  );
  const onHistoryRange = props.onHistoryRange;
  const mappedHistoryRange = useCallback(
    (value: { start: number; end: number }) =>
      onHistoryRange?.({
        start: display.displayToSource(value.start),
        end: display.displayToSource(value.end),
      }),
    [onHistoryRange, display]
  );
  const onHoverTime = props.onHoverTime;
  const previewHover = useCallback(
    (value: number | null) => {
      if (value === null) onHoverTime?.(null);
      else onHoverTime?.(display.displayToSource(value), display.displayToResult(value));
    },
    [display, onHoverTime]
  );
  const range = (value: ReviewAnchor, inverse = false): ReviewAnchor => {
    const map = inverse ? display.displayToSource : display.sourceToDisplay;
    return value.kind === 'point'
      ? { kind: 'point', time: map(value.time) }
      : {
          kind: 'range',
          start: map(value.start),
          end: inverse ? map(value.end) : display.sourceToDisplay(value.end, 'end'),
        };
  };
  if (!display.parts.some((part) => part.segment.kind === 'freeze'))
    return (
      <ReviewPlaybackPresentationClockContext.Provider value={clock}>
        <ReviewTimelineSurface {...props} />
      </ReviewPlaybackPresentationClockContext.Provider>
    );
  const seek = (time: number, snap?: boolean) => {
    const part = display.parts.find((part) => time >= part.start && time < part.end);
    if (part?.segment.kind === 'freeze' && props.onSeekResult)
      props.onSeekResult(display.displayToResult(time));
    else props.onSeek(display.displayToSource(time), snap);
  };
  const originalEdit = (edit: ReviewEdit) =>
    props.edits?.find((item) => item.id === edit.id) ?? edit;
  const current =
    props.resultTime == null
      ? display.sourceToDisplay(props.time)
      : display.resultToDisplay(props.resultTime);
  const mappedEdits = (props.edits ?? [])
    .filter((edit) => edit.kind !== 'freeze')
    .map((edit) => ({
      ...edit,
      start: display.sourceToDisplay(edit.start),
      end: display.sourceToDisplay(edit.end, 'end'),
    }));
  const insertions = display.parts
    .filter((part) => part.segment.kind === 'freeze')
    .map((part) => {
      const edit = props.edits?.find((edit) => edit.id === part.segment.freezeId);
      if (!edit) return null;
      return (
        <ReviewEditBlock
          key={edit.id}
          edit={{ ...edit, start: part.start, end: part.end }}
          edits={mappedEdits}
          duration={display.duration}
          time={current}
          selection={range(props.selection)}
          annotations={[]}
          selectedEditId={props.selectedEditId}
          beforeAction={props.beforeAction}
          snapClock={{ output: display.sourceToDisplay, fromDisplay: (time) => time }}
          rangeEnabled={!props.busy}
          onSnap={() => {}}
          onEdit={(view) => {
            props.onEdit?.(originalEdit(view));
          }}
          onChangeEdit={async (_view, value) => {
            if (value.kind !== 'range') return;
            if (Math.abs(value.start - part.start) > 1e-7) {
              const withoutHold = createReviewDisplayMap(
                props.duration,
                (props.edits ?? []).filter((item) => item.id !== edit.id)
              );
              await props.onFreezeMove?.(edit, withoutHold.displayToSource(value.start));
            } else await props.onFreezeDurationChange?.(edit, value.end - value.start);
          }}
          onSeek={seek}
          onSelect={props.onSelect}
          onComment={props.onComment}
        />
      );
    });
  return (
    <ReviewPlaybackPresentationClockContext.Provider value={mappedClock}>
      <ReviewTimelineSurface
        {...props}
        interactionEditor={
          props.interactionEditor
            ? {
                ...props.interactionEditor,
                update: (marker, start, end, enabled) =>
                  props.interactionEditor!.update(
                    {
                      ...(props.markers.find(
                        (item) => item.ref.kind === marker.ref.kind && item.ref.id === marker.ref.id
                      ) ?? marker),
                      timeDomain: 'result',
                    },
                    display.displayToResult(start),
                    display.displayToResult(end),
                    enabled
                  ),
              }
            : undefined
        }
        duration={display.duration}
        snapClock={{ output: display.sourceToDisplay, fromDisplay: (time) => time }}
        time={current}
        sourceInsertions={insertions}
        edits={mappedEdits}
        selection={range(props.selection)}
        playbackRange={
          props.playbackRange
            ? {
                start: props.playbackRange.result
                  ? display.resultToDisplay(props.playbackRange.result.start)
                  : display.sourceToDisplay(props.playbackRange.start),
                end: props.playbackRange.result
                  ? display.resultToDisplay(props.playbackRange.result.end, 'end')
                  : display.sourceToDisplay(props.playbackRange.end, 'end'),
              }
            : props.playbackRange
        }
        {...(props.boundaries
          ? { boundaries: props.boundaries.map((time) => display.sourceToDisplay(time)) }
          : {})}
        snapTimes={props.snapTimes?.map((time) => display.sourceToDisplay(time))}
        zoomAnchor={
          props.zoomAnchor == null ? props.zoomAnchor : display.sourceToDisplay(props.zoomAnchor)
        }
        markers={props.markers.map((marker) => ({
          ...marker,
          start:
            marker.timeDomain === 'result'
              ? display.resultToDisplay(marker.start)
              : display.sourceToDisplay(marker.start),
          end:
            marker.timeDomain === 'result'
              ? display.resultToDisplay(marker.end, 'end')
              : display.sourceToDisplay(marker.end, 'end'),
        }))}
        annotations={props.annotations.map((note) => ({ ...note, anchor: range(note.anchor) }))}
        onSeek={seek}
        onSelect={(value) => props.onSelect(range(value, true))}
        {...(props.onEdit
          ? { onEdit: (edit: ReviewEdit) => props.onEdit!(originalEdit(edit)) }
          : {})}
        {...(props.onChangeEdit
          ? {
              onChangeEdit: (edit: ReviewEdit, value: ReviewAnchor) =>
                props.onChangeEdit!(originalEdit(edit), range(value, true)),
            }
          : {})}
        {...(props.onRangeCommit
          ? { onRangeCommit: (value: ReviewAnchor) => props.onRangeCommit!(range(value, true)) }
          : {})}
        onTrackRangeCommit={
          props.onTrackRangeCommit
            ? (value) => {
                const next = range(value, true);
                if (next.kind === 'range')
                  props.onPlaybackRange?.({
                    start: next.start,
                    end: next.end,
                    result: {
                      start: display.displayToResult(value.start),
                      end: display.displayToResult(value.end),
                    },
                  });
              }
            : undefined
        }
        onTextRangeCommit={
          props.onTextRangeCommit
            ? (value) => {
                const next = range(value, true);
                if (next.kind === 'range') props.onTextRangeCommit!(next);
              }
            : undefined
        }
        onFocusRangeCommit={
          props.onFocusRangeCommit
            ? (value) => props.onFocusRangeCommit!(range(value, true))
            : undefined
        }
        onFocusRangePreview={
          props.onFocusRangePreview
            ? (value) => props.onFocusRangePreview!(value ? range(value, true) : null)
            : undefined
        }
        onPlaybackRange={
          props.onPlaybackRange
            ? (value) =>
                props.onPlaybackRange!(
                  value
                    ? {
                        start: display.displayToSource(value.start),
                        end: display.displayToSource(value.end),
                        result: {
                          start: display.displayToResult(value.start),
                          end: display.displayToResult(value.end),
                        },
                      }
                    : null
                )
            : undefined
        }
        onHoverTime={onHoverTime ? previewHover : undefined}
        onHistoryRange={onHistoryRange ? mappedHistoryRange : undefined}
        onMarker={(marker) =>
          props.onMarker(
            props.markers.find(
              (item) => item.ref.kind === marker.ref.kind && item.ref.id === marker.ref.id
            ) ?? marker
          )
        }
        onComment={(note) =>
          props.onComment(props.annotations.find((item) => item.id === note.id) ?? note)
        }
      />
    </ReviewPlaybackPresentationClockContext.Provider>
  );
}
