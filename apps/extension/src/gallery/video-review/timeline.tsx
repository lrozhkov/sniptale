import { ReviewRuler, ReviewToolbar } from './timeline-chrome';
import { ReviewSourceLane } from './timeline-selection';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { translate } from '../../platform/i18n';
import type { ReviewAnchor, ReviewAnnotation, ReviewEdit } from '../../features/video/review/types';
import type { ReviewTelemetryMarker } from '../../features/video/review/telemetry';
import { reviewEventLabel, reviewTimeLabel } from './controls';
import { buildReviewTimeMap } from '../../features/video/review/timeline';

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
  boundaries?: readonly number[];
  onRangeCommit?(range: ReviewAnchor): void;
  onChangeEdit?(edit: ReviewEdit, range: ReviewAnchor): void;
  onEdit?(edit: ReviewEdit): void;
  markers: readonly ReviewTelemetryMarker[];
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
  const plane = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    start: number;
    x: number;
    range: ReviewAnchor | null;
    selection: ReviewAnchor;
    time: number;
    pointerId: number;
  } | null>(null);
  const [width, setWidth] = useState(640);
  useEffect(() => {
    const cancel = (event: KeyboardEvent) => {
      const current = drag.current;
      if (event.key !== 'Escape' || !current) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      drag.current = null;
      if (plane.current?.hasPointerCapture(current.pointerId))
        plane.current.releasePointerCapture(current.pointerId);
      props.onSeek(current.time, false);
      props.onSelect(current.selection);
    };
    window.addEventListener('keydown', cancel, true);
    return () => window.removeEventListener('keydown', cancel, true);
  });
  useEffect(() => {
    const node = viewport.current;
    if (!node) return;
    const measure = () => setWidth(Math.max(1, node.clientWidth));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return (
    <section
      data-ui="gallery.videoReview.timeline"
      className="@container min-w-0 max-w-full shrink-0 overflow-hidden pt-2"
    >
      <ReviewToolbar
        {...props}
        resultDuration={buildReviewTimeMap(props.duration, props.edits ?? []).at(-1)!.resultEnd}
        zoom={zoom}
        onZoom={setZoom}
      />
      <div
        ref={viewport}
        data-ui="gallery.videoReview.timelineViewport"
        className="w-full min-w-0 max-w-full overflow-x-auto overscroll-x-contain"
      >
        <div
          ref={plane}
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
          onPointerDown={(event) => {
            if (
              event.button !== 0 ||
              (event.target instanceof Element && event.target.closest('button'))
            )
              return;
            const bounds = event.currentTarget.getBoundingClientRect();
            const time = Math.max(
              0,
              Math.min(
                props.duration,
                ((event.clientX - bounds.left) / bounds.width) * props.duration
              )
            );
            drag.current = {
              start: time,
              x: event.clientX,
              range: null,
              selection: props.selection,
              time: props.time,
              pointerId: event.pointerId,
            };
            event.currentTarget.setPointerCapture(event.pointerId);
            props.onSeek(time);
            if (
              props.selection.kind !== 'range' ||
              time < props.selection.start ||
              time > props.selection.end
            )
              props.onSelect({ kind: 'point', time });
          }}
          onPointerMove={(event) => {
            const current = drag.current;
            if (!current || Math.abs(event.clientX - current.x) < 4) return;
            const bounds = event.currentTarget.getBoundingClientRect();
            const time = Math.max(
              0,
              Math.min(
                props.duration,
                ((event.clientX - bounds.left) / bounds.width) * props.duration
              )
            );
            current.range = {
              kind: 'range',
              start: Math.min(current.start, time),
              end: Math.max(current.start, time),
            };
            props.onSelect(current.range);
          }}
          onPointerUp={(event) => {
            const current = drag.current;
            drag.current = null;
            if (event.currentTarget.hasPointerCapture(event.pointerId))
              event.currentTarget.releasePointerCapture(event.pointerId);
            if (current?.range) props.onRangeCommit?.(current.range);
          }}
          onPointerCancel={() => {
            drag.current = null;
          }}
        >
          {props.markers.length ? (
            <ReviewTelemetryStrip
              markers={props.markers}
              duration={props.duration}
              zoom={zoom}
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
        </div>
      </div>
    </section>
  );
}

/** Recorded cursor samples are grouped for display; full telemetry remains in the report. */
function ReviewTelemetryStrip(
  props: Pick<TimelineProps, 'markers' | 'duration' | 'onMarker'> & { zoom: number }
) {
  const markers = useMemo(() => {
    const occupied = new Set<number>();
    return props.markers.filter((marker) => {
      if (marker.ref.kind !== 'cursor') return true;
      const bucket = Math.floor((marker.start / props.duration) * 120 * props.zoom);
      if (occupied.has(bucket)) return false;
      occupied.add(bucket);
      return true;
    });
  }, [props.markers, props.duration, props.zoom]);
  return (
    <div className="relative mb-1 h-5">
      {markers.map((marker) => (
        <button
          key={`${marker.ref.kind}:${marker.ref.id}`}
          type="button"
          aria-label={[
            translate('gallery.videoReview.telemetry'),
            reviewEventLabel(marker.eventType),
            reviewTimeLabel(marker.start),
          ].join(' · ')}
          title={`${reviewEventLabel(marker.eventType)} · ${reviewTimeLabel(marker.start)}`}
          onClick={() => props.onMarker(marker)}
          className="absolute top-1 h-2.5 min-w-1.5 -translate-x-1/2 rounded-sm border
          border-[var(--sniptale-color-border-accent-strong)]
          bg-[var(--sniptale-color-accent-soft)]"
          style={{
            left: percent(marker.start, props.duration),
            width:
              marker.end > marker.start ? percent(marker.end - marker.start, props.duration) : 6,
          }}
        />
      ))}
    </div>
  );
}
