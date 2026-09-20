import { GripVertical } from 'lucide-react';
import { ReviewTrackRow } from './track-row';
import { ReviewRuler, ReviewToolbar } from './timeline-chrome';
import { ReviewSourceLane } from './timeline-selection';
import { useEffect, useRef, useState, type ReactNode, type CSSProperties } from 'react';
import { translate } from '../../platform/i18n';
import type { ReviewAnchor, ReviewAnnotation, ReviewEdit } from '../../features/video/review/types';
import type { ReviewTelemetryMarker } from '../../features/video/review/telemetry';
import { ReviewTelemetryStrip } from './timeline-telemetry';
import { useReviewTimelinePlaneDrag } from './timeline-drag';
import { reviewTimeLabel } from './controls';
import { createReviewTimeMap } from '../../features/video/review/timeline';

type TimelineProps = {
  busy?: boolean;
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
  audioTrack?: ReactNode;
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
/** One source lane, with an independent ruler/playhead rather than browser slider chrome. */
export function ReviewTimeline(props: TimelineProps) {
  const [zoom, setZoom] = useState(1);
  const [gutter, setGutter] = useState(192);
  const resize = useRef<{ x: number; width: number } | null>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  useEffect(() => {
    const node = viewport.current;
    if (!node) return;
    const measure = () => setWidth(Math.max(1, node.clientWidth - gutter));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [gutter]);
  const plane = useReviewTimelinePlaneDrag({ ...props, gutter });
  return (
    <section
      data-ui="gallery.videoReview.timeline"
      className="@container flex min-h-0 max-h-[55%] min-w-0 max-w-full shrink-0 flex-col overflow-hidden pt-2"
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
        className="w-full min-h-0 min-w-0 max-w-full overflow-auto overscroll-contain"
      >
        <div
          inert={props.busy}
          ref={plane.plane}
          data-ui="gallery.videoReview.timePlane"
          role="slider"
          tabIndex={0}
          aria-label={translate('gallery.videoReview.position')}
          aria-valuemin={0}
          aria-valuemax={props.duration}
          aria-valuenow={props.time}
          aria-valuetext={reviewTimeLabel(props.time)}
          className="group/plane relative cursor-crosshair overflow-clip pb-2 pt-1 outline-none"
          style={
            {
              width: gutter + Math.max(1, width * zoom),
              '--review-track-gutter': `${gutter}px`,
            } as CSSProperties
          }
          onPointerDown={plane.onPointerDown}
          onPointerMove={plane.onPointerMove}
          onPointerUp={plane.onPointerUp}
          onPointerCancel={plane.onPointerCancel}
        >
          <ReviewTrackRow
            label=""
            controls={
              <button
                type="button"
                role="separator"
                aria-orientation="vertical"
                aria-label={translate('gallery.videoReview.trackControlsWidth')}
                aria-valuemin={156}
                aria-valuemax={300}
                aria-valuenow={gutter}
                title={translate('gallery.videoReview.trackControlsWidth')}
                className="cursor-col-resize rounded p-1 text-[var(--sniptale-color-text-muted)]
                  focus-visible:ring-2 focus-visible:ring-[var(--sniptale-color-accent)]"
                onPointerDown={(event) => {
                  event.stopPropagation();
                  resize.current = { x: event.clientX, width: gutter };
                  event.currentTarget.setPointerCapture(event.pointerId);
                }}
                onPointerMove={(event) => {
                  if (resize.current)
                    setGutter(
                      Math.max(
                        156,
                        Math.min(300, resize.current.width + event.clientX - resize.current.x)
                      )
                    );
                }}
                onPointerUp={(event) => {
                  resize.current = null;
                  event.currentTarget.releasePointerCapture(event.pointerId);
                }}
                onPointerCancel={() => {
                  resize.current = null;
                }}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                    event.preventDefault();
                    event.stopPropagation();
                    setGutter((value) =>
                      Math.max(156, Math.min(300, value + (event.key === 'ArrowRight' ? 8 : -8)))
                    );
                  }
                }}
              >
                <GripVertical size={12} aria-hidden="true" />
              </button>
            }
          >
            <ReviewRuler duration={props.duration} width={Math.max(1, width * zoom)} />
          </ReviewTrackRow>
          {props.markers.length ? (
            <ReviewTrackRow label={translate('gallery.videoReview.telemetry')}>
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
          <ReviewSourceLane {...props} />
          <div
            aria-hidden="true"
            data-ui="gallery.videoReview.playhead"
            className="pointer-events-none absolute bottom-2 top-1 z-20
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
          {props.zoomTrack}
          {props.audioTrack}
        </div>
      </div>
    </section>
  );
}
