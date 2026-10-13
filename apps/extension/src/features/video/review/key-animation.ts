import { reviewCueWindow } from './cue-window';
import type { ReviewTelemetryMarker } from './telemetry';
import type { ReviewTimeSegment } from './timeline';
import type { ReviewKeyAnimation, ReviewKeyStyle } from './advanced/key-animation';

export function isReviewKey(marker: ReviewTelemetryMarker): boolean {
  return (
    marker.ref.kind === 'action' && ['KEY', 'KEY_HOLD', 'KEY_MODIFIERS'].includes(marker.eventType)
  );
}
export interface ReviewKeyCue {
  label: string;
  settings: ReviewKeyStyle;
  start: number;
  end: number;
}
/** Fixed viewport captions use result time, with cuts bounding their authored lifetime. */
export function scheduleReviewKeys(
  markers: readonly ReviewTelemetryMarker[],
  settings: readonly ReviewKeyAnimation[],
  segments: readonly ReviewTimeSegment[]
): ReviewKeyCue[] {
  const styles = new Map(settings.map((item) => [item.id, item]));
  return markers.flatMap((marker) => {
    const style = isReviewKey(marker) ? styles.get(marker.ref.id) : undefined;
    if (!style?.enabled || !marker.target) return [];
    const window = reviewCueWindow(segments, marker.start, style.offset, style.before, style.after);
    if (!window) return [];
    const { start, end } = window;
    return end > start ? [{ label: marker.target, settings: style, start, end }] : [];
  });
}
