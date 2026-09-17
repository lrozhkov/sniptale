import { useMemo } from 'react';
import { ProductSelect } from '@sniptale/ui/product-form-controls';
import { translate } from '../../platform/i18n';
import type { ReviewTelemetryMarker } from '../../features/video/review/telemetry';
import { layoutReviewActionLanes } from '../../features/video/review/action-lanes';
import { reviewEventLabel, reviewTimeLabel } from './controls';

const ACTION_LANE_ROW_PX = 7;

type TelemetryStripProps = {
  markers: readonly ReviewTelemetryMarker[];
  duration: number;
  time: number;
  width: number;
  zoom: number;
  selectedTelemetryRef?: ReviewTelemetryMarker['ref'];
  onMarker(marker: ReviewTelemetryMarker): void;
};

/** Compactly packed action history: colliding events split into lanes, the dense tail
 * collapses into one overflow chip; nothing ever draws on top of itself inside a lane. */
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
  const rows = layout.collapsed ? layout.visibleLanes + 1 : layout.laneCount;
  const isActive = (marker: ReviewTelemetryMarker) =>
    props.time >= marker.start && props.time < Math.max(marker.end, marker.start + 0.05);
  return (
    <div className="relative mb-1" style={{ height: rows * ACTION_LANE_ROW_PX }}>
      {layout.items
        .filter((item) => item.visible)
        .map((item) => {
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
                'absolute h-2.5 min-w-1.5 rounded-sm border transition-colors',
                tone,
                active ? 'ring-1 ring-[var(--sniptale-color-accent)]' : '',
              ].join(' ')}
              style={{
                left: item.left,
                width: item.width,
                top: item.lane * ACTION_LANE_ROW_PX,
              }}
            />
          );
        })}
      {layout.collapsed ? (
        <ProductSelect
          dataUi="gallery.videoReview.actionOverflow"
          controlSize="sm"
          value=""
          placeholder={`+${layout.overflowCount}`}
          aria-label={`${translate('gallery.videoReview.telemetry')} · +${layout.overflowCount}`}
          options={layout.items
            .filter((item) => !item.visible)
            .map((item) => ({
              value: item.marker.ref.id,
              label: `${reviewEventLabel(item.marker.eventType)} · ${reviewTimeLabel(
                item.marker.start
              )}`,
            }))}
          onChange={(id) => {
            const item = layout.items.find((entry) => entry.marker.ref.id === id);
            if (item) props.onMarker(item.marker);
          }}
          className="absolute left-0 h-4 !w-16"
          style={{ top: layout.visibleLanes * ACTION_LANE_ROW_PX }}
        />
      ) : null}
    </div>
  );
}
