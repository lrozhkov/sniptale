import { useState } from 'react';
import { ReviewButton, reviewIconButtonClassName } from './controls';
import type { ReviewClickAnimation } from '../../features/video/review/advanced/click-animation';
import { ReviewPlaybackRangeOverlay, useReviewRulerRange } from './ruler-range';
import type { ReviewPlaybackRange } from './playback-range';
import type { ReviewBeforeAction } from './note-transitions';
import { Activity, List, Filter } from 'lucide-react';
import { ReviewTrackRow } from './track-row';
import { ReviewPlayhead, ReviewRulerRow, ReviewToolbar } from './timeline-chrome';
import { ReviewSourceLane } from './timeline-selection';
import type { ReactNode, CSSProperties } from 'react';
import { translate } from '../../platform/i18n';
import type { ReviewAnchor, ReviewAnnotation, ReviewEdit } from '../../features/video/review/types';
import type { ReviewTelemetryMarker } from '../../features/video/review/telemetry';
import { ReviewTelemetryStrip } from './timeline-telemetry';
import { useReviewTimelinePlaneDrag } from './timeline-drag';
import {
  ReviewTimelineHoverGuide,
  useReviewTimelineHover,
  type ReviewPlacementHints,
} from './timeline-hover';
import {
  useReviewTimelineGeometry,
  useReviewTimelineNavigation,
  useReviewToolLaneNavigation,
} from './timeline-geometry';
import { reviewTimeLabel } from './controls';
import { createReviewTimeMap } from '../../features/video/review/timeline';

type TimelineProps = {
  onOpenHistory?: (() => void) | undefined;
  keyAnimations?:
    | readonly import('../../features/video/review/advanced/key-animation').ReviewKeyAnimation[]
    | undefined;
  clickAnimations?: readonly ReviewClickAnimation[] | undefined;
  fillHeight?: boolean | undefined;
  sourceCompact?: boolean | undefined;
  placementHints?: ReviewPlacementHints | undefined;
  beforeAction?: ReviewBeforeAction | undefined;
  busy?: boolean;
  playbackRange?: ReviewPlaybackRange | null | undefined;
  onPlaybackRange?: ((range: ReviewPlaybackRange | null) => void) | undefined;
  sourceRangeTool?: boolean;
  duration: number;
  time: number;
  playing: boolean;
  selection: ReviewAnchor;
  annotations: readonly ReviewAnnotation[];
  edits?: readonly ReviewEdit[];
  selectedEditId?: string | undefined;
  zoomAnchor?: number | null | undefined;
  historyControls?: ReactNode;
  tools?: ReactNode;
  trackControls?: ReactNode;
  expandedTools?: boolean;
  zoomTrack?: ReactNode;
  webcamTrack?: ReactNode;
  audioTrack?: ReactNode;
  boundaries?: readonly number[];
  onRangeCommit?(range: ReviewAnchor): void;
  onFocusRangeCommit?: ((range: ReviewAnchor) => void) | undefined;
  onFocusRangePreview?: ((range: ReviewAnchor | null) => void) | undefined;
  originalRangeTool?: boolean;
  snapRangePreview?: boolean;
  onChangeEdit?(edit: ReviewEdit, range: ReviewAnchor): void | Promise<void>;
  onEdit?(edit: ReviewEdit): void;
  markers: readonly ReviewTelemetryMarker[];
  selectedTelemetryRef?: ReviewTelemetryMarker['ref'];
  onSeek(time: number, snap?: boolean): void;
  onClearSelection?(): void;
  onSelect(value: ReviewAnchor): void;
  onPlay(): void;
  onOpenExport?: (() => void) | undefined;
  exportActive?: boolean | undefined;
  onMarker(marker: ReviewTelemetryMarker): void;
  onComment(annotation: ReviewAnnotation): void;
};

/** One source lane, with an independent ruler/playhead rather than browser slider chrome. */
export function ReviewTimeline(props: TimelineProps) {
  const audioVisible = !!props.audioTrack;
  const zoomVisible = !!props.zoomTrack;
  const { viewport, gutter, width } = useReviewTimelineGeometry(
    audioVisible,
    zoomVisible,
    props.markers.length
  );
  const { zoom, navigation, navigate, onZoom, wheelTarget } = useReviewTimelineNavigation(props, {
    viewport,
    gutter,
    width,
  });
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
  });
  const plane = useReviewTimelinePlaneDrag({ ...props, gutter });
  const hover = useReviewTimelineHover({
    placementHints: props.placementHints,
    busy: !!props.busy,
    duration: props.duration,
    gutter,
    width,
    zoom,
    focusEnabled: !!props.onFocusRangeCommit,
    originalEnabled: !!props.originalRangeTool,
    snapRangePreview: !!props.snapRangePreview,
    boundaries: props.boundaries,
  });
  return (
    <section
      ref={wheelTarget}
      data-ui="gallery.videoReview.timeline"
      className={`@container flex min-h-0 ${
        props.fillHeight ? 'h-full' : 'max-h-[min(42dvh,calc(100dvh-420px))]'
      } min-w-0 max-w-full shrink-0 flex-col
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
      <div
        ref={viewport}
        data-ui="gallery.videoReview.timelineViewport"
        style={{ overflowX: zoom === 1 ? 'hidden' : 'auto' }}
        onScroll={hover.clear}
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
          onPointerDownCapture={hover.clear}
          onPointerDown={plane.onPointerDown}
          onPointerMoveCapture={(event) => hover.move(event, plane.activeLane())}
          onPointerMove={plane.onPointerMove}
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
          <ReviewTimelineHoverGuide
            hover={hover.hover}
            viewport={viewport}
            gutter={gutter}
            width={width}
          />
          <ReviewRulerRow
            controls={props.trackControls}
            interaction={ruler.interaction}
            time={props.time}
            duration={props.duration}
            gutter={gutter}
            width={Math.max(1, width * zoom)}
          />
          <div inert={props.busy}>
            <ReviewTimelineEvents {...props} width={width} zoom={zoom} />
            <ReviewSourceLane
              {...props}
              rangeEnabled={!props.onFocusRangeCommit && !props.originalRangeTool}
              snapToKeyframes={!!props.boundaries}
            />
          </div>
          <ReviewPlayhead
            time={props.time}
            duration={props.duration}
            gutter={gutter}
            width={Math.max(1, width * zoom)}
          />
          <div inert={props.busy}>
            {props.zoomTrack}
            {props.webcamTrack}
            {props.audioTrack}
          </div>
        </div>
      </div>
    </section>
  );
}

/** Telemetry row presentation is independent of ruler gestures and transport. */
function ReviewTimelineEvents(
  props: Pick<
    TimelineProps,
    | 'markers'
    | 'duration'
    | 'time'
    | 'selectedTelemetryRef'
    | 'onMarker'
    | 'onOpenHistory'
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
  return props.markers.length ? (
    <ReviewTrackRow
      label={translate('gallery.videoReview.telemetry')}
      icon={<Activity size={14} aria-hidden="true" />}
      controls={
        <>
          <ReviewButton
            label={translate('gallery.videoReview.historyOpen')}
            className={reviewIconButtonClassName}
            onClick={props.onOpenHistory}
          >
            <List size={14} aria-hidden="true" />
          </ReviewButton>
          <ReviewButton
            label={translate('gallery.videoReview.historyAnimatedOnly')}
            className={reviewIconButtonClassName}
            aria-pressed={animatedOnly}
            onClick={() => setAnimatedOnly((value) => !value)}
          >
            <Filter size={14} aria-hidden="true" />
          </ReviewButton>
        </>
      }
    >
      <div className="min-h-7" data-ui="gallery.videoReview.historyTrack">
        <ReviewTelemetryStrip
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
        />
      </div>
    </ReviewTrackRow>
  ) : null;
}
