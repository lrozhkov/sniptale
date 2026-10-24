import { reviewCueWindow } from './cue-window';
import type { ReviewTelemetryMarker } from './telemetry';
import type { ReviewTimeSegment } from './timeline';
import type { ReviewClickAnimation, ReviewClickStyle } from './advanced/click-animation';

/** The semantic history projection is the only event identity source for presentation. */
export function isReviewClick(marker: ReviewTelemetryMarker): boolean {
  return (
    marker.ref.kind === 'action' &&
    (!!marker.gesture || marker.eventType === 'CLICK' || marker.eventType === 'DOUBLE_CLICK')
  );
}
export interface ReviewClickCue {
  id?: string;
  settings: ReviewClickStyle;
  point: { x: number; y: number };
  anchor: number;
  start: number;
  end: number;
  gesture?: {
    path: { time: number; x: number; y: number; captureSegment?: number }[];
    gaps?: { start: number; end: number }[];
  };
}
export interface ReviewClickFrame {
  effect: Exclude<ReviewClickStyle['effect'], 'off'>;
  point: { x: number; y: number };
  color: string;
  radius: number;
  stroke: number;
  opacity: number;
  path?: readonly { x: number; y: number }[];
  area?: { x: number; y: number; width: number; height: number };
  lens?: {
    scale: number;
    shape: 'circle' | 'rounded';
    shadow: number;
    optics?: 'flat' | 'optical';
    edgeWidth?: number;
  };
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
    if (!style || style.effect === 'off') return [];
    if (
      marker.gesture &&
      (marker.gesture.type !== 'click' || marker.gesture.completion !== 'released')
    ) {
      const gesture = marker.gesture;
      const end = gesture.upTime ?? marker.end;
      const path = gesture.path ?? [];
      return segments.flatMap<ReviewClickCue>((part, index) => {
        if (part.kind === 'cut') return [];
        const from = Math.max(gesture.downTime, part.sourceStart),
          to = Math.min(end, part.sourceEnd);
        if (to <= from) return [];
        const mapping = (time: number) => part.resultStart + (time - part.sourceStart) / part.rate;
        const previous = segments[index - 1],
          next = segments[index + 1];
        const before =
          previous && previous.kind !== 'cut' && previous.sourceEnd === part.sourceStart
            ? path.findLast((point) => point.time < part.sourceStart)
            : undefined;
        const after =
          next && next.kind !== 'cut' && next.sourceStart === part.sourceEnd
            ? path.find((point) => point.time > part.sourceEnd)
            : undefined;
        const points = [
          ...(before ? [before] : []),
          ...path.filter((point) => point.time >= part.sourceStart && point.time <= part.sourceEnd),
          ...(after ? [after] : []),
        ].map((point) => ({ ...point, time: mapping(point.time) }));
        if (!points.length) return [];
        return [
          {
            id: marker.ref.id,
            settings: style,
            point: { x: points[0]!.x, y: points[0]!.y },
            anchor: mapping(gesture.downTime),
            start: mapping(from),
            end: mapping(to),
            gesture: {
              path: points,
              ...(gesture.gaps
                ? {
                    gaps: gesture.gaps
                      .filter((gap) => gap.end > from && gap.start < to)
                      .map((gap) => ({
                        start: mapping(Math.max(from, gap.start)),
                        end: mapping(Math.min(to, gap.end)),
                      })),
                  }
                : {}),
            },
          },
        ];
      });
    }
    if (!marker.focusPoint) return [];
    const window = reviewCueWindow(segments, marker.start, style.offset, style.before, style.after);
    if (!window) return [];
    const { anchor, start, end } = window;
    return end > start
      ? [
          {
            id: marker.ref.id,
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
    if (cue.gesture) {
      if (cue.gesture.gaps?.some((gap) => time >= gap.start && time < gap.end)) return [];
      const points = cue.gesture.path;
      const next = points.findIndex((point) => point.time > time);
      const left = points[next < 0 ? points.length - 1 : Math.max(0, next - 1)]!;
      const right = next < 0 ? left : points[next]!;
      if (time < left.time) return [];
      const p =
        (left.captureSegment === undefined ||
          right.captureSegment === undefined ||
          left.captureSegment === right.captureSegment) &&
        right.time > left.time
          ? Math.min(1, Math.max(0, (time - left.time) / (right.time - left.time)))
          : 0;
      const point = { x: left.x + (right.x - left.x) * p, y: left.y + (right.y - left.y) * p };
      return [
        {
          effect: 'press',
          point,
          color: s.color,
          radius: s.radius * 0.45,
          stroke: s.stroke,
          opacity: s.opacity,
          ...(s.gestureAppearance === 'path'
            ? {
                path: [
                  ...points
                    .filter(
                      (item) =>
                        item.time <= time &&
                        (left.captureSegment === undefined ||
                          item.captureSegment === left.captureSegment)
                    )
                    .map((item) => ({ x: item.x, y: item.y })),
                  point,
                ],
              }
            : {}),
          ...(s.gestureAppearance === 'area' && s.gestureArea ? { area: s.gestureArea } : {}),
        },
      ];
    }
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
          lens: {
            scale,
            shape: s.lensShape ?? 'circle',
            shadow: (s.lensShadow ?? 20) * strength,
            optics: s.lensOptics ?? 'flat',
            ...(s.lensEdgeWidth === undefined ? {} : { edgeWidth: s.lensEdgeWidth }),
          },
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
