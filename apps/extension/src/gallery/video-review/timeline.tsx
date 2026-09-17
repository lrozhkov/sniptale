import { ReviewRuler, ReviewToolbar } from './timeline-chrome';
import { ReviewSourceLane } from './timeline-selection';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { translate } from '../../platform/i18n';
import type { ReviewAnchor, ReviewAnnotation, ReviewEdit } from '../../features/video/review/types';
import type { ReviewTelemetryMarker } from '../../features/video/review/telemetry';
import { ReviewTelemetryStrip } from './timeline-telemetry';
import { useReviewTimelinePlaneDrag } from './timeline-drag';
import { reviewTimeLabel } from './controls';
import { createReviewTimeMap } from '../../features/video/review/timeline';

type TimelineProps = {
  duration: number;
  time: number;
  playing: boolean;
  volume?: number;
  onVolume?(value: number): void;
  selection: ReviewAnchor;
  annotations: readonly ReviewAnnotation[];
  edits?: readonly ReviewEdit[];
  tools?: ReactNode;
  zoomTrack?: ReactNode;
  boundaries?: readonly number[];
  onRangeCommit?(range: ReviewAnchor): void;
  onChangeEdit?(edit: ReviewEdit, range: ReviewAnchor): void;
  onEdit?(edit: ReviewEdit): void;
  markers: readonly ReviewTelemetryMarker[];
  selectedTelemetryRef?: ReviewTelemetryMarker['ref'];
  onSeek(time: number, snap?: boolean): void;
  onSelect(value: ReviewAnchor): void;
  onPlay(): void;
  onMarker(marker: ReviewTelemetryMarker): void;
  onComment(annotation: ReviewAnnotation): void;
};
const percent = (time: number, duration: number) => `${(time / duration) * 100}%`;
/** One source lane, with an independent ruler/playhead rather than browser slider chrome. */
export function ReviewTimeline(props: TimelineProps) {
  const [zoom, setZoom] = useState(1);
  const viewport = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  useEffect(() => {
    const node = viewport.current;
    if (!node) return;
    const measure = () => setWidth(Math.max(1, node.clientWidth));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const plane = useReviewTimelinePlaneDrag(props);
  return (
    <section
      data-ui="gallery.videoReview.timeline"
      className="@container min-w-0 max-w-full shrink-0 overflow-hidden pt-2"
    >
      <ReviewToolbar
        {...props}
        resultDuration={createReviewTimeMap(props.duration, props.edits ?? []).getDuration()}
        zoom={zoom}
        onZoom={setZoom}
      />
      <div
        ref={viewport}
        data-ui="gallery.videoReview.timelineViewport"
        className="w-full min-w-0 max-w-full overflow-x-auto overscroll-x-contain"
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
          className="relative cursor-crosshair pb-4 pt-1 outline-none focus-visible:ring-1
              focus-visible:ring-inset focus-visible:ring-[var(--sniptale-color-accent)]"
          style={{ width: Math.max(1, width * zoom) }}
          onPointerDown={plane.onPointerDown}
          onPointerMove={plane.onPointerMove}
          onPointerUp={plane.onPointerUp}
          onPointerCancel={plane.onPointerCancel}
        >
          {props.markers.length ? (
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
          ) : null}
          <div className="relative">
            <ReviewRuler duration={props.duration} width={Math.max(1, width * zoom)} />
            <ReviewSourceLane {...props} />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 z-20 w-px bg-[var(--sniptale-color-accent)]"
              style={{ left: percent(props.time, props.duration) }}
            >
              <span
                className="absolute -left-1.5 top-0 h-3 w-3 rounded-b-[5px] border
          border-[var(--sniptale-color-border-accent-strong)]
          bg-[var(--sniptale-color-accent-emphasis)]"
              />
            </div>
          </div>
          {props.zoomTrack}
        </div>
      </div>
    </section>
  );
}
