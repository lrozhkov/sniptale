import type { ReviewTelemetryMarker } from '../../features/video/review/telemetry';
import { reviewEventLabel, reviewTimeLabel } from './controls';

/** Captured metadata is read-only; selecting an action never creates authored content. */
export function ReviewActionProperties({ marker }: { marker: ReviewTelemetryMarker | undefined }) {
  if (!marker) return null;
  return (
    <div className="space-y-2 text-sm" data-ui="gallery.videoReview.actionProperties">
      <p className="font-semibold">{reviewEventLabel(marker.eventType)}</p>
      <p className="tabular-nums text-[var(--sniptale-color-text-secondary)]">
        {reviewTimeLabel(marker.start)} – {reviewTimeLabel(marker.end)}
      </p>
      {marker.target ? <p className="break-words">{marker.target}</p> : null}
    </div>
  );
}
