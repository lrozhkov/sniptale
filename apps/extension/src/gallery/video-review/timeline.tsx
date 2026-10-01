import type { ReviewBeforeAction } from './note-transitions';
import { Activity } from 'lucide-react';
import { ReviewTrackRow } from './track-row';
import { ReviewRuler, ReviewToolbar } from './timeline-chrome';
import { ReviewSourceLane } from './timeline-selection';
import { useEffect, useMemo, useState, type ReactNode, type CSSProperties } from 'react';
import { translate } from '../../platform/i18n';
import type { ReviewAnchor, ReviewAnnotation, ReviewEdit } from '../../features/video/review/types';
import type { ReviewTelemetryMarker } from '../../features/video/review/telemetry';
import { ReviewTelemetryStrip } from './timeline-telemetry';
import { useReviewTimelinePlaneDrag } from './timeline-drag';
import { ReviewTimelineHoverGuide, useReviewTimelineHover } from './timeline-hover';
import { useReviewTimelineGeometry } from './timeline-geometry';
import { reviewTimeLabel } from './controls';
import { createReviewTimeMap } from '../../features/video/review/timeline';
import { reviewTimelineNavigationBounds } from './track-projection';

type TimelineProps = {
  beforeAction?: ReviewBeforeAction | undefined;
  busy?: boolean;
  duration: number;
  time: number;
  playing: boolean;
  selection: ReviewAnchor;
  annotations: readonly ReviewAnnotation[];
  edits?: readonly ReviewEdit[];
  selectedEditId?: string | undefined;
  historyControls?: ReactNode;
  tools?: ReactNode;
  trackControls?: ReactNode;
  expandedTools?: boolean;
  zoomTrack?: ReactNode;
  audioTrack?: ReactNode;
  boundaries?: readonly number[];
  onRangeCommit?(range: ReviewAnchor): void;
  onFocusRangeCommit?: ((range: ReviewAnchor) => void) | undefined;
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
  onMarker(marker: ReviewTelemetryMarker): void;
  onComment(annotation: ReviewAnnotation): void;
};

function revealBoundary(
  node: HTMLDivElement | null,
  target: number,
  navigation: { start: number; end: number },
  duration: number,
  gutter: number,
  width: number,
  zoom: number
) {
  if (!node || duration <= 0) return;
  const x = gutter + (target / duration) * width * zoom;
  if (x < node.scrollLeft + 16 || x > node.scrollLeft + node.clientWidth - 24)
    node.scrollLeft = target === navigation.start ? 0 : Math.max(0, x - node.clientWidth + 24);
}

/** One source lane, with an independent ruler/playhead rather than browser slider chrome. */
export function ReviewTimeline(props: TimelineProps) {
  const [zoom, setZoom] = useState(1);
  const audioVisible = !!props.audioTrack;
  const zoomVisible = !!props.zoomTrack;
  const { viewport, gutter, width } = useReviewTimelineGeometry(
    audioVisible,
    zoomVisible,
    props.markers.length
  );
  const navigation = useMemo(
    () => reviewTimelineNavigationBounds(props.duration, props.edits ?? []),
    [props.duration, props.edits]
  );
  useEffect(() => {
    if (props.time === navigation.start || props.time === navigation.end)
      revealBoundary(viewport.current, props.time, navigation, props.duration, gutter, width, zoom);
  }, [props.time, navigation, props.duration, zoom, gutter, width, viewport]);
  const navigate = (target: number) => {
    (props.beforeAction ?? ((action) => action()))(() => {
      props.onSeek(target, false);
      revealBoundary(viewport.current, target, navigation, props.duration, gutter, width, zoom);
    });
  };
  const plane = useReviewTimelinePlaneDrag({ ...props, gutter });
  const hover = useReviewTimelineHover({
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
      data-ui="gallery.videoReview.timeline"
      className="@container flex min-h-0 max-h-[min(42dvh,calc(100dvh-420px))] min-w-0 max-w-full shrink-0 flex-col
        overflow-hidden border-t border-[var(--sniptale-color-border-soft)]"
    >
      <ReviewToolbar
        {...props}
        navigation={navigation}
        onNavigate={navigate}
        resultDuration={createReviewTimeMap(props.duration, props.edits ?? []).getDuration()}
        zoom={zoom}
        onPlay={() => (props.beforeAction ?? ((action) => action()))(props.onPlay)}
        onZoom={(value) => (props.beforeAction ?? ((action) => action()))(() => setZoom(value))}
      />
      <div
        ref={viewport}
        data-ui="gallery.videoReview.timelineViewport"
        style={{ overflowX: zoom === 1 ? 'hidden' : 'auto' }}
        onScroll={hover.clear}
        className="w-full min-h-0 min-w-0 max-w-full overflow-auto overscroll-contain"
      >
        <div
          ref={plane.plane}
          data-ui="gallery.videoReview.timePlane"
          role="slider"
          tabIndex={0}
          aria-label={translate('gallery.videoReview.position')}
          aria-valuemin={0}
          aria-valuemax={props.duration}
          aria-valuenow={props.time}
          aria-valuetext={reviewTimeLabel(props.time)}
          className="group/plane relative overflow-clip pb-2 outline-none"
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
          onPointerMove={(event) => {
            plane.onPointerMove(event);
            hover.move(event, plane.activeLane());
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
          <ReviewTimelineHoverGuide
            hover={hover.hover}
            viewport={viewport}
            gutter={gutter}
            width={width}
          />
          <ReviewTrackRow label="" icon={props.trackControls}>
            <ReviewRuler duration={props.duration} width={Math.max(1, width * zoom)} />
          </ReviewTrackRow>
          <div inert={props.busy}>
            {props.markers.length ? (
              <ReviewTrackRow
                label={translate('gallery.videoReview.telemetry')}
                icon={<Activity size={14} aria-hidden="true" />}
              >
                <ReviewTelemetryStrip
                  markers={props.markers}
                  duration={props.duration}
                  time={props.time}
                  width={width}
                  zoom={zoom}
                  {...(props.selectedTelemetryRef
                    ? { selectedTelemetryRef: props.selectedTelemetryRef }
                    : {})}
                  onMarker={props.onMarker}
                />
              </ReviewTrackRow>
            ) : null}
            <ReviewSourceLane
              {...props}
              rangeEnabled={!props.onFocusRangeCommit}
              snapToKeyframes={!!props.boundaries}
            />
          </div>
          <div
            aria-hidden="true"
            data-ui="gallery.videoReview.playhead"
            className="pointer-events-none absolute bottom-2 top-0 z-20
              bg-[var(--sniptale-color-accent-emphasis)] group-focus-visible/plane:brightness-125"
            style={{
              left:
                gutter +
                Math.max(0, Math.min(1, props.time / props.duration)) * Math.max(1, width * zoom) -
                5,
              width: 10,
              clipPath: 'polygon(0 0, 100% 0, 55% 8px, 55% 100%, 45% 100%, 45% 8px)',
            }}
          />
          <div inert={props.busy}>
            {props.zoomTrack}
            {props.audioTrack}
          </div>
        </div>
      </div>
    </section>
  );
}
