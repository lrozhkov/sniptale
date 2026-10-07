import { isReviewClick } from '../../features/video/review/click-animation';
import { ReviewTimelineLabel } from './timeline-label';
import { reviewTimelineItemTone } from './controls';
import { useEffect, useMemo, useState } from 'react';
import { ProductSelect } from '@sniptale/ui/product-form-controls';
import {
  Activity,
  MousePointer2,
  MousePointerClick,
  Command,
  Keyboard,
  Mouse,
  Pause,
  MessageSquare,
  Clock,
  Focus,
} from 'lucide-react';
import { translate } from '../../platform/i18n';
import { formatPreciseTime } from '../../composition/library-preview/time-format';
import type { ReviewTelemetryMarker } from '../../features/video/review/telemetry';
import { layoutReviewActionLanes } from '../../features/video/review/action-lanes';
import { reviewEventLabel, reviewTimeLabel } from './controls';

const ACTION_MARKER_HEIGHT_PX = 20;
const ACTION_LANE_GAP_PX = 4;
const ACTION_LANE_PITCH_PX = ACTION_MARKER_HEIGHT_PX + ACTION_LANE_GAP_PX;
/** Dense history never adds a fourth row. */
const ACTION_LANE_MAX_VISIBLE = 3;

type TelemetryStripProps = {
  animatedIds?: ReadonlySet<string>;
  markers: readonly ReviewTelemetryMarker[];
  duration: number;
  time: number;
  width: number;
  zoom: number;
  selectedTelemetryRef?: ReviewTelemetryMarker['ref'];
  onMarker(marker: ReviewTelemetryMarker): void;
};

/** Stable strip height with bounded groups repacked only after zoom settles. */
export function ReviewTelemetryStrip(props: TelemetryStripProps) {
  const [settled, setSettled] = useState({ width: props.width, zoom: props.zoom });
  useEffect(() => {
    const timer = setTimeout(() => setSettled({ width: props.width, zoom: props.zoom }), 250);
    return () => clearTimeout(timer);
  }, [props.width, props.zoom]);
  const layout = useMemo(
    () =>
      layoutReviewActionLanes(props.markers, {
        duration: props.duration,
        width: Math.max(1, settled.width),
        zoom: settled.zoom,
      }),
    [props.markers, props.duration, settled]
  );
  const reserved = useMemo(
    () =>
      layoutReviewActionLanes(props.markers, {
        duration: props.duration,
        width: Math.max(1, props.width),
        zoom: 1,
      }).laneCount,
    [props.markers, props.duration, props.width]
  );
  const ratio =
    (Math.max(1, props.width) * props.zoom) / (Math.max(1, settled.width) * settled.zoom);
  const laneCount = Math.min(reserved, ACTION_LANE_MAX_VISIBLE);
  const height =
    laneCount === 0
      ? 0
      : laneCount * ACTION_MARKER_HEIGHT_PX + (laneCount - 1) * ACTION_LANE_GAP_PX;
  return (
    <div
      data-ui="gallery.videoReview.historyStrip"
      className="relative mb-1 overflow-hidden"
      style={{ height }}
    >
      {layout.items.map((item) => {
        const marker = item.marker;
        const selected =
          props.selectedTelemetryRef !== undefined &&
          marker.ref.kind === props.selectedTelemetryRef.kind &&
          marker.ref.id === props.selectedTelemetryRef.id;
        const animated = isReviewClick(marker) && props.animatedIds?.has(marker.ref.id);
        const tone = reviewTimelineItemTone(selected);
        if (item.members.length > 1)
          return (
            <ReviewHistoryCluster
              key={`${marker.ref.kind}:${marker.ref.id}`}
              members={item.members}
              left={item.left * ratio}
              width={item.width * ratio}
              top={item.lane * ACTION_LANE_PITCH_PX}
              onMarker={props.onMarker}
              selectedRef={props.selectedTelemetryRef}
              animatedIds={props.animatedIds}
            />
          );
        return (
          <button
            key={`${marker.ref.kind}:${marker.ref.id}`}
            type="button"
            aria-pressed={selected}
            data-animated={animated ? 'true' : 'false'}
            aria-label={[
              translate('gallery.videoReview.telemetry'),
              reviewEventLabel(marker.eventType),
              marker.target,
              animated ? translate('gallery.videoReview.clickAnimation') : undefined,
              `${reviewTimeLabel(marker.start)}–${reviewTimeLabel(marker.end)}`,
            ]
              .filter(Boolean)
              .join(' · ')}
            title={[
              reviewEventLabel(marker.eventType),
              marker.target,
              animated ? translate('gallery.videoReview.clickAnimation') : undefined,
              `${reviewTimeLabel(marker.start)}–${reviewTimeLabel(marker.end)}`,
            ]
              .filter(Boolean)
              .join(' · ')}
            onClick={() => props.onMarker(marker)}
            className={[
              'absolute flex min-w-1.5 items-center justify-center gap-1 overflow-hidden',
              'rounded-sm border text-[10px] transition-colors',
              tone,
              '!text-[var(--sniptale-color-text-secondary)]',
              animated ? '!bg-[color-mix(in_srgb,var(--sniptale-color-info)_15%,transparent)]' : '',
            ].join(' ')}
            style={{
              left: item.left * ratio,
              width: item.width * ratio,
              top: item.lane * ACTION_LANE_PITCH_PX,
              height: ACTION_MARKER_HEIGHT_PX,
            }}
          >
            <ReviewTimelineLabel
              icon={<ReviewEventIcon kind={marker.eventType} />}
              name={reviewEventLabel(marker.eventType)}
            />
          </button>
        );
      })}
    </div>
  );
}

/** Event-specific shapes remain identifiable in narrow point markers. */
function ReviewEventIcon({ kind }: { kind: string }) {
  const Icon =
    kind === 'DOUBLE_CLICK'
      ? MousePointerClick
      : kind === 'CLICK'
        ? MousePointer2
        : kind === 'KEY'
          ? Command
          : kind === 'typing'
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

/** Every grouped event remains selectable through the shared keyboard-accessible menu. */
function ReviewHistoryCluster(props: {
  members: ReviewTelemetryMarker[];
  left: number;
  width: number;
  top: number;
  selectedRef: ReviewTelemetryMarker['ref'] | undefined;
  animatedIds: ReadonlySet<string> | undefined;
  onMarker(marker: ReviewTelemetryMarker): void;
}) {
  const key = (marker: ReviewTelemetryMarker) => `${marker.ref.kind}:${marker.ref.id}`;
  const selected = props.members.some(
    (marker) =>
      props.selectedRef?.kind === marker.ref.kind && props.selectedRef.id === marker.ref.id
  );
  const animated = props.members.some(
    (marker) => isReviewClick(marker) && props.animatedIds?.has(marker.ref.id)
  );
  return (
    <div className="absolute" style={{ left: props.left, width: props.width, top: props.top }}>
      <ProductSelect
        dataUi="gallery.videoReview.historyCluster"
        value=""
        placeholder={props.members.length > 99 ? '99+' : String(props.members.length)}
        aria-label={`${translate('gallery.videoReview.telemetry')} · ${props.members.length}`}
        aria-pressed={selected}
        data-animated={animated ? 'true' : 'false'}
        containerClassName="!max-w-none"
        controlSize="sm"
        menuWidth={360}
        style={{
          minHeight: 20,
          height: 20,
          padding: '0 12px 0 3px',
          borderRadius: 2,
          fontSize: 11,
          background: 'var(--sniptale-color-surface-hover)',
          borderColor: selected
            ? 'var(--sniptale-color-accent)'
            : 'var(--sniptale-color-border-soft)',
        }}
        className={[
          reviewTimelineItemTone(selected),
          '[&_.sniptale-select-placeholder]:!text-current [&_.sniptale-select-placeholder]:font-medium',
          '!text-[var(--sniptale-color-text-secondary)]',
          '[&_.sniptale-select-chevron]:!h-2 [&_.sniptale-select-chevron]:!w-2 [&_.sniptale-select-chevron]:!right-1',
          animated ? '!bg-[color-mix(in_srgb,var(--sniptale-color-info)_15%,transparent)]' : '',
        ].join(' ')}
        onChange={(id) => {
          const marker = props.members.find((item) => key(item) === id);
          if (marker) props.onMarker(marker);
        }}
        options={props.members.map((marker) => ({
          value: key(marker),
          label: [
            marker.start === marker.end
              ? formatPreciseTime(marker.start)
              : `${reviewTimeLabel(marker.start)}–${reviewTimeLabel(marker.end)}`,
            reviewEventLabel(marker.eventType),
            marker.target,
            isReviewClick(marker) && props.animatedIds?.has(marker.ref.id)
              ? translate('gallery.videoReview.clickAnimation')
              : undefined,
          ]
            .filter(Boolean)
            .join(' · '),
          icon: <ReviewEventIcon kind={marker.eventType} />,
        }))}
      />
    </div>
  );
}
