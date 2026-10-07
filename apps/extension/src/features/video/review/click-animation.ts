import type { ReviewTelemetryMarker } from './telemetry';
import type { ReviewTimeSegment } from './timeline';
import type { ReviewClickAnimation, ReviewClickStyle } from './advanced/click-animation';

/** The semantic history projection is the only event identity source for presentation. */
export function isReviewClick(marker: ReviewTelemetryMarker): boolean {
  return (
    marker.ref.kind === 'action' &&
    (marker.eventType === 'CLICK' || marker.eventType === 'DOUBLE_CLICK')
  );
}
export interface ReviewClickCue {
  settings: ReviewClickStyle;
  point: { x: number; y: number };
  anchor: number;
  start: number;
  end: number;
}
export interface ReviewClickFrame {
  effect: Exclude<ReviewClickStyle['effect'], 'off'>;
  point: { x: number; y: number };
  color: string;
  radius: number;
  stroke: number;
  opacity: number;
  lens?: { scale: number; shape: 'circle' | 'rounded'; shadow: number };
}

/** Resolve once per edit revision, in global result time; only cuts bound the lifetime. */
export function scheduleReviewClicks(
  markers: readonly ReviewTelemetryMarker[],
  settings: readonly ReviewClickAnimation[],
  segments: readonly ReviewTimeSegment[]
): ReviewClickCue[] {
  const styles = new Map(settings.map((item) => [item.id, item]));
  return markers.flatMap((marker) => {
    const style = isReviewClick(marker) ? styles.get(marker.ref.id) : undefined;
    if (!style || style.effect === 'off' || !marker.focusPoint) return [];
    const index = segments.findIndex(
      (part) => marker.start >= part.sourceStart && marker.start < part.sourceEnd
    );
    const part = segments[index];
    if (!part || part.kind === 'cut') return [];
    let first = index;
    let last = index;
    while (first > 0 && segments[first - 1]!.kind !== 'cut') first--;
    while (last + 1 < segments.length && segments[last + 1]!.kind !== 'cut') last++;
    const anchor = part.resultStart + (marker.start - part.sourceStart) / part.rate + style.offset;
    const start = Math.max(segments[first]!.resultStart, anchor - style.before);
    const end = Math.min(segments[last]!.resultEnd, anchor + style.after);
    return end > start
      ? [
          {
            settings: style,
            point: { x: marker.focusPoint.x + style.x, y: marker.focusPoint.y + style.y },
            anchor,
            start,
            end,
          },
        ]
      : [];
  });
}

/** Before-phase prepares the click; after-phase emits evenly spaced authored pulses. */
export function evaluateReviewClicks(
  cues: readonly ReviewClickCue[],
  time: number
): ReviewClickFrame[] {
  return cues.flatMap<ReviewClickFrame>((cue) => {
    const s = cue.settings;
    if (time < cue.start || time >= cue.end || s.effect === 'off') return [];
    const before = time < cue.anchor;
    const progress = before
      ? Math.max(0, Math.min(1, (time - cue.anchor + s.before) / Math.max(0.001, s.before)))
      : (((time - cue.anchor) / s.after) * s.pulses) % 1;
    const eased =
      s.easing === 'linear'
        ? progress
        : s.easing === 'ease-out'
          ? 1 - (1 - progress) ** 3
          : progress * progress * (3 - 2 * progress);
    if (s.effect === 'magnify') {
      // A single identity-to-identity pulse, independent of decorative ripple count.
      const phase = before
        ? (time - cue.start) / Math.max(0.001, cue.anchor - cue.start)
        : 1 - (time - cue.anchor) / Math.max(0.001, cue.end - cue.anchor);
      const p = Math.max(0, Math.min(1, phase));
      const strength =
        s.easing === 'linear'
          ? p
          : s.easing === 'ease-out'
            ? 1 - (1 - p) ** 3
            : p * p * (3 - 2 * p);
      const scale = 1 + ((s.magnification ?? 1.6) - 1) * strength;
      return [
        {
          effect: s.effect,
          point: cue.point,
          color: s.color,
          radius: s.radius * scale,
          stroke: s.stroke,
          opacity: strength * s.opacity,
          lens: { scale, shape: s.lensShape ?? 'circle', shadow: (s.lensShadow ?? 20) * strength },
        },
      ];
    }
    const radius = before
      ? s.radius * (0.2 + 0.1 * eased)
      : s.effect === 'ripple'
        ? s.radius * (0.3 + 0.7 * eased)
        : s.radius * (0.3 + 0.2 * Math.sin(eased * Math.PI));
    return [
      {
        effect: s.effect,
        point: cue.point,
        color: s.color,
        radius,
        stroke: s.stroke,
        opacity: s.opacity * (before ? progress : 1 - progress),
      },
    ];
  });
}
