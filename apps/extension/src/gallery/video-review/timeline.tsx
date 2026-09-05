import { ReviewRuler, ReviewToolbar } from './timeline-chrome';
import { ReviewSourceLane, ReviewRangeFields } from './timeline-selection';
import { useEffect, useMemo, useRef, useState } from 'react';
import { translate } from '../../platform/i18n';
import type { ReviewAnchor, ReviewAnnotation, ReviewEdit } from '../../features/video/review/types';
import type { ReviewTelemetryMarker } from '../../features/video/review/telemetry';
import { reviewEventLabel, reviewTimeLabel } from './controls';

type TimelineProps = {
  duration: number;
  time: number;
  playing: boolean;
  selection: ReviewAnchor;
  annotations: readonly ReviewAnnotation[];
  edits?: readonly ReviewEdit[];
  onEdit?(edit: ReviewEdit): void;
  markers: readonly ReviewTelemetryMarker[];
  onSeek(time: number): void;
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
  return (
    <section data-ui="gallery.videoReview.timeline" className="shrink-0 space-y-3 pt-3">
      <ReviewToolbar {...props} zoom={zoom} onZoom={setZoom} />
      <div
        ref={viewport}
        className="overflow-x-auto overscroll-x-contain rounded-[var(--sniptale-radius-sm)] border
          border-[var(--sniptale-color-border-soft)]
          bg-[var(--sniptale-color-surface-canvas)]"
      >
        <div className="relative min-w-full px-3 pb-3 pt-1" style={{ width: `${zoom * 100}%` }}>
          {props.markers.length ? (
            <ReviewTelemetryStrip
              markers={props.markers}
              duration={props.duration}
              zoom={zoom}
              onMarker={props.onMarker}
            />
          ) : null}
          <div className="relative">
            <ReviewRuler duration={props.duration} width={Math.max(1, width * zoom - 24)} />
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
      {props.selection.kind === 'range' ? (
        <ReviewRangeFields
          duration={props.duration}
          selection={props.selection}
          onSelect={props.onSelect}
        />
      ) : null}
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
