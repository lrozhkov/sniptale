import { useMemo } from 'react';
import {
  Activity,
  MousePointer2,
  Keyboard,
  Mouse,
  Pause,
  MessageSquare,
  Clock,
  Focus,
} from 'lucide-react';
import { translate } from '../../platform/i18n';
import type { ReviewTelemetryMarker } from '../../features/video/review/telemetry';
import { layoutReviewActionLanes } from '../../features/video/review/action-lanes';
import { reviewEventLabel, reviewTimeLabel } from './controls';

const ACTION_MARKER_HEIGHT_PX = 20;
const ACTION_LANE_GAP_PX = 4;
const ACTION_LANE_PITCH_PX = ACTION_MARKER_HEIGHT_PX + ACTION_LANE_GAP_PX;
/** Height cap on the packed lane stack; a denser history scrolls inside the strip. */
const ACTION_LANE_MAX_VISIBLE = 3;

type TelemetryStripProps = {
  markers: readonly ReviewTelemetryMarker[];
  duration: number;
  time: number;
  width: number;
  zoom: number;
  selectedTelemetryRef?: ReviewTelemetryMarker['ref'];
  onMarker(marker: ReviewTelemetryMarker): void;
};

/** Compactly packed action history: colliding events split into lanes and every marker
 * stays clickable; the strip bounds the lane stack height and scrolls the dense tail. */
export function ReviewTelemetryStrip(props: TelemetryStripProps) {
  const layout = useMemo(
    () =>
      layoutReviewActionLanes(props.markers, {
        duration: props.duration,
        width: Math.max(1, props.width),
        zoom: props.zoom,
      }),
    [props.markers, props.duration, props.width, props.zoom]
  );
  const laneCount = Math.min(layout.laneCount, ACTION_LANE_MAX_VISIBLE);
  const height =
    laneCount === 0
      ? 0
      : laneCount * ACTION_MARKER_HEIGHT_PX + (laneCount - 1) * ACTION_LANE_GAP_PX;
  const isActive = (marker: ReviewTelemetryMarker) =>
    props.time >= marker.start && props.time < Math.max(marker.end, marker.start + 0.05);
  return (
    <div className="relative mb-1 overflow-x-hidden overflow-y-auto" style={{ height }}>
      {layout.items.map((item) => {
        const marker = item.marker;
        const selected =
          props.selectedTelemetryRef !== undefined &&
          marker.ref.kind === props.selectedTelemetryRef.kind &&
          marker.ref.id === props.selectedTelemetryRef.id;
        const active = isActive(marker);
        const tone = selected
          ? 'border-[var(--sniptale-color-accent-emphasis)] bg-[var(--sniptale-color-accent-emphasis)]'
          : 'border-[var(--sniptale-color-border-accent-strong)] bg-[var(--sniptale-color-accent-soft)]';
        return (
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
            className={[
              'absolute flex min-w-1.5 items-center justify-center gap-1 overflow-hidden',
              'rounded-sm border text-[10px] transition-colors',
              tone,
              active ? 'ring-1 ring-[var(--sniptale-color-accent)]' : '',
            ].join(' ')}
            style={{
              left: item.left,
              width: item.width,
              top: item.lane * ACTION_LANE_PITCH_PX,
              height: ACTION_MARKER_HEIGHT_PX,
            }}
          >
            <ReviewEventIcon kind={marker.eventType} />
            {item.width >= 64 ? (
              <span className="truncate">{reviewEventLabel(marker.eventType)}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/** Event-specific shapes remain identifiable in narrow point markers. */
function ReviewEventIcon({ kind }: { kind: string }) {
  const Icon =
    kind === 'CLICK' || kind === 'DOUBLE_CLICK'
      ? MousePointer2
      : kind === 'typing' || kind === 'KEY'
        ? Keyboard
        : kind === 'SCROLL'
          ? Mouse
          : kind === 'PAUSE'
            ? Pause
            : kind === 'CALLOUT'
              ? MessageSquare
              : kind === 'cursor-idle'
                ? Clock
                : kind === 'static-frame'
                  ? Focus
                  : Activity;
  return <Icon size={12} className="shrink-0" aria-hidden="true" />;
}
