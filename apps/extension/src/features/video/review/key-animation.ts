import type { ReviewTelemetryMarker } from './telemetry';
import type { ReviewTimeSegment } from './timeline';
import type { ReviewKeyAnimation, ReviewKeyStyle } from './advanced/key-animation';

export function isReviewKey(marker: ReviewTelemetryMarker): boolean {
  return marker.ref.kind === 'action' && marker.eventType === 'KEY';
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
    const index = segments.findIndex(
      (part) => marker.start >= part.sourceStart && marker.start < part.sourceEnd
    );
    const part = segments[index];
    if (!part || part.kind === 'cut') return [];
    let first = index,
      last = index;
    while (first > 0 && segments[first - 1]!.kind !== 'cut') first--;
    while (last + 1 < segments.length && segments[last + 1]!.kind !== 'cut') last++;
    const anchor = part.resultStart + (marker.start - part.sourceStart) / part.rate + style.offset;
    const start = Math.max(segments[first]!.resultStart, anchor - style.before);
    const end = Math.min(segments[last]!.resultEnd, anchor + style.after);
    return end > start ? [{ label: marker.target, settings: style, start, end }] : [];
  });
}
