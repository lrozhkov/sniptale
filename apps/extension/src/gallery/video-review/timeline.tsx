import { ReviewTrackVisibilityButton } from './track-row';
import { ReviewTimelinePanes } from './timeline-panes';
import { ReviewTimelineResizeGuide } from './timeline-resize-guide';
import type { RecordingTelemetryCapabilities } from '../../features/video/project/types';
import { Fragment, useState } from 'react';
import { REVIEW_TRACK_ORDER } from './track-order';
import type { QuickEditTrack } from '../../features/video/review/advanced/types';
import {
  ReviewButton,
  reviewIconButtonClassName,
  reviewTrackStatusButtonClassName,
} from './controls';
import type { ReviewClickAnimation } from '../../features/video/review/advanced/click-animation';
import { ReviewPlaybackRangeOverlay, useReviewRulerRange } from './ruler-range';
import type { ReviewPlaybackRange } from './playback-range';
import type { ReviewBeforeAction } from './note-transitions';
import { Activity, Search, Filter, Eye, EyeOff } from 'lucide-react';
import { ReviewTrackRow } from './track-row';
import { ReviewPlayhead, ReviewRulerRow, ReviewToolbar } from './timeline-chrome';
import { ReviewSourceLane } from './timeline-selection';
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
  sourceId?: string | undefined;
  actionsEnabled?: boolean | undefined;
  onToggleActions?: (() => void) | undefined;
  onOpenHistory?: (() => void) | undefined;
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
  annotationTool?: boolean;
  annotationDrawing?: boolean;
  sourceRangeTool?: boolean;
  sourceRangeKind?: 'cut' | 'speed' | undefined;
  duration: number;
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
  tools?: ReactNode;
  trackControls?: ReactNode;
  expandedTools?: boolean;
  zoomTrack?: ReactNode;
  webcamTrack?: ReactNode;
  audioTracks?: Partial<Record<'originalAudio' | 'voiceover' | 'music', ReactNode>>;
  trackOrder?: readonly QuickEditTrack[];
  textTrack?: ReactNode;
  annotationEffectsTrack?: ReactNode;
  boundaries?: readonly number[];
  snapTimes?: readonly number[] | undefined;
  onRangeCommit?(range: ReviewAnchor): void;
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
export function ReviewTimeline(props: TimelineProps) {
  const { viewport, gutter, width } = useReviewTimelineGeometry();
  const { zoom, navigation, navigate, onZoom, wheelTarget, follow } = useReviewTimelineNavigation(
    props,
    {
      viewport,
      gutter,
      width,
    }
  );
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
    actions: <ReviewTimelineEvents {...props} width={width} zoom={zoom} />,
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
      <ReviewToolbar
        {...props}
        playbackRange={props.playbackRange}
        onClearPlaybackRange={ruler.clear}
        navigation={navigation}
        onNavigate={navigate}
        resultDuration={createReviewTimeMap(props.duration, props.edits ?? []).getDuration()}
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
              if (event.target instanceof Node && event.currentTarget.contains(event.target))
                hover.clear();
            }}
            onPointerDown={plane.onPointerDown}
            onPointerMoveCapture={(event) => {
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
              hover.clear();
            }}
            onPointerCancel={() => {
              plane.onPointerCancel();
              hover.clear();
            }}
            onPointerLeave={hover.clear}
          >
            <ReviewPlaybackRangeOverlay
              range={ruler.range}
              duration={props.duration}
              gutter={gutter}
              width={Math.max(1, width * zoom)}
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
    'fillHeight' | 'markers' | 'onAddCursorFocusKey' | 'actionsTrackVisible'
  >
) {
  if (props.fillHeight) return 'h-full';
  return props.actionsTrackVisible !== false && (props.markers.length || props.onAddCursorFocusKey)
    ? 'max-h-[max(160px,min(42dvh,calc(100dvh-420px)))]'
    : 'max-h-[min(42dvh,calc(100dvh-420px))]';
}

/** Telemetry row presentation is independent of ruler gestures and transport. */
function ReviewTimelineEvents(
  props: Pick<
    TimelineProps,
    | 'markers'
    | 'captureCapabilities'
    | 'actionsTrackVisible'
    | 'cursorFocusKeys'
    | 'selectedCursorFocusId'
    | 'onCursorFocusKey'
    | 'onNavigateCursorFocus'
    | 'onMoveCursorFocus'
    | 'playing'
    | 'onAddCursorFocusKey'
    | 'duration'
    | 'time'
    | 'selectedTelemetryRef'
    | 'onMarker'
    | 'onOpenHistory'
    | 'actionsEnabled'
    | 'onToggleActions'
    | 'keyAnimations'
    | 'clickAnimations'
  > & { width: number; zoom: number }
) {
  const [animatedOnly, setAnimatedOnly] = useState(false);
  const animated = new Set([
    ...(props.clickAnimations ?? []).filter((item) => item.effect !== 'off').map((item) => item.id),
    ...(props.keyAnimations ?? []).filter((item) => item.enabled).map((item) => item.id),
  ]);
  const markers = animatedOnly
    ? props.markers.filter((marker) => marker.ref.kind === 'action' && animated.has(marker.ref.id))
    : props.markers;
  return props.actionsTrackVisible !== false &&
    (props.markers.length || props.onAddCursorFocusKey) ? (
    <ReviewTrackRow
      track="actions"
      muted={props.actionsEnabled === false}
      label={translate('gallery.videoReview.telemetry')}
      icon={<Activity size={14} aria-hidden="true" />}
      controls={
        <>
          <ReviewButton
            label={translate('gallery.videoReview.historyOpen')}
            className={reviewIconButtonClassName}
            onClick={props.onOpenHistory}
          >
            <Search size={14} aria-hidden="true" />
          </ReviewButton>
          <ReviewButton
            label={translate('gallery.videoReview.historyAnimatedOnly')}
            className={reviewIconButtonClassName}
            aria-pressed={animatedOnly}
            onClick={() => setAnimatedOnly((value) => !value)}
          >
            <Filter size={14} aria-hidden="true" />
          </ReviewButton>
          {props.onToggleActions ? (
            <ReviewTrackVisibilityButton
              track={'actions'}
              label={translate('gallery.videoReview.historyEffectsEnabled')}
              className={reviewTrackStatusButtonClassName}
              aria-pressed={props.actionsEnabled !== false}
              onClick={props.onToggleActions}
            >
              {props.actionsEnabled === false ? <EyeOff size={14} /> : <Eye size={14} />}
            </ReviewTrackVisibilityButton>
          ) : null}
        </>
      }
    >
      <div className="min-h-7" data-ui="gallery.videoReview.historyTrack">
        <ReviewTelemetryStrip
          captureCapabilities={props.captureCapabilities}
          markers={markers}
          animatedIds={animated}
          duration={props.duration}
          time={props.time}
          width={props.width}
          zoom={props.zoom}
          {...(props.selectedTelemetryRef
            ? { selectedTelemetryRef: props.selectedTelemetryRef }
            : {})}
          onMarker={props.onMarker}
          {...(props.cursorFocusKeys ? { cursorFocusKeys: props.cursorFocusKeys } : {})}
          {...(props.selectedCursorFocusId
            ? { selectedCursorFocusId: props.selectedCursorFocusId }
            : {})}
          {...(props.onCursorFocusKey ? { onCursorFocusKey: props.onCursorFocusKey } : {})}
          playing={props.playing}
          {...(props.onNavigateCursorFocus
            ? { onNavigateCursorFocus: props.onNavigateCursorFocus }
            : {})}
          {...(props.onMoveCursorFocus ? { onMoveCursorFocus: props.onMoveCursorFocus } : {})}
          {...(props.onAddCursorFocusKey ? { onAddCursorFocusKey: props.onAddCursorFocusKey } : {})}
        />
      </div>
    </ReviewTrackRow>
  ) : null;
}
