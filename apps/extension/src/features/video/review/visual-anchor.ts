import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import type { ReviewTimeSegment } from './time-segment';

interface VisualSpan {
  start: number;
  end: number;
  offset: number;
  rate: number;
  freezeId?: string;
  sourceTime?: number;
}

export interface ReviewVisualPlacement {
  start: number;
  end: number;
  /** Source intervals, or offsets within an identified freeze, in authored phase order. */
  visualAnchor?: VisualSpan[];
}

interface ReviewVisualDisplay {
  parts: readonly { segment: ReviewTimeSegment; start: number; end: number }[];
  resultToDisplay(time: number, edge?: 'start' | 'end'): number;
  sourceToDisplay(time: number, edge?: 'start' | 'end'): number;
  displayToResult(time: number): number;
}

export function parseReviewVisualAnchor(
  value: unknown,
  duration: number
): VisualSpan[] | undefined | null {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length === 0 || value.length > 4096) return null;
  const result: VisualSpan[] = [];
  const bounded = (time: unknown): time is number =>
    typeof time === 'number' && Number.isFinite(time) && time >= 0 && time <= 172800;
  let previousEnd = 0;
  for (const span of value) {
    if (!isRecord(span)) return null;
    const { start, end, offset, rate, freezeId, sourceTime } = span;
    if (
      !bounded(start) ||
      !bounded(end) ||
      end <= start ||
      !bounded(offset) ||
      offset < previousEnd - 1e-7 ||
      !bounded(rate) ||
      rate < 0.01 ||
      rate > 100 ||
      (freezeId !== undefined &&
        (typeof freezeId !== 'string' ||
          !freezeId ||
          freezeId.length > 256 ||
          rate !== 1 ||
          !bounded(sourceTime)))
    )
      return null;
    previousEnd = offset + (end - start) / rate;
    if (previousEnd > duration + 1e-7) return null;
    result.push({
      start,
      end,
      offset,
      rate,
      ...(freezeId && typeof sourceTime === 'number' ? { freezeId, sourceTime } : {}),
    });
  }
  return result;
}

/** Uses the complete original clock for an effect authored directly on source frames. */
export function anchorReviewVisualSource(range: { start: number; end: number }) {
  return [{ start: range.start, end: range.end, offset: 0, rate: 1 }];
}

export function reviewVisualAnchorDuration(
  anchor: NonNullable<ReviewVisualPlacement['visualAnchor']>
) {
  const last = anchor.at(-1)!;
  return last.offset + (last.end - last.start) / last.rate;
}

/** Capture the authored phase before any visible duration is removed. */
export function anchorReviewVisual<T extends ReviewVisualPlacement>(
  item: T,
  segments: readonly ReviewTimeSegment[]
): T {
  if (item.visualAnchor) return item;
  const visualAnchor = segments.flatMap((segment) => {
    if (segment.kind === 'cut') return [];
    const start = Math.max(item.start, segment.resultStart);
    const end = Math.min(item.end, segment.resultEnd);
    if (end <= start) return [];
    const rate = segment.kind === 'freeze' ? 1 : segment.rate;
    const base = segment.kind === 'freeze' ? 0 : segment.sourceStart;
    return [
      {
        start: base + (start - segment.resultStart) * rate,
        end:
          end === segment.resultEnd && segment.kind !== 'freeze'
            ? segment.sourceEnd
            : base + (end - segment.resultStart) * rate,
        offset: start - item.start,
        rate,
        ...(segment.freezeId
          ? { freezeId: segment.freezeId, sourceTime: segment.sourceStart }
          : {}),
      },
    ];
  });
  return visualAnchor.length ? { ...item, visualAnchor } : item;
}

const projectedAnchors = new WeakMap<
  NonNullable<ReviewVisualPlacement['visualAnchor']>,
  WeakMap<readonly ReviewTimeSegment[], ReturnType<typeof buildReviewVisualSlices>>
>();

/** Each retained slice carries its phase on the complete authored interval. */
export function projectReviewVisualAnchor(
  anchor: NonNullable<ReviewVisualPlacement['visualAnchor']>,
  segments: readonly ReviewTimeSegment[]
) {
  let projections = projectedAnchors.get(anchor);
  if (!projections) {
    projections = new WeakMap();
    projectedAnchors.set(anchor, projections);
  }
  const previous = projections.get(segments);
  if (previous) return previous;
  const projected = buildReviewVisualSlices(anchor, segments);
  projections.set(segments, projected);
  return projected;
}

function buildReviewVisualSlices(
  anchor: NonNullable<ReviewVisualPlacement['visualAnchor']>,
  segments: readonly ReviewTimeSegment[]
) {
  return segments.flatMap((segment) => {
    if (segment.kind === 'cut') return [];
    const freeze = segment.kind === 'freeze';
    const origin = freeze ? 0 : segment.sourceStart;
    const limit = freeze ? segment.resultEnd - segment.resultStart : segment.sourceEnd;
    const rate = freeze ? 1 : segment.rate;
    return anchor.flatMap((span) => {
      if (span.freezeId !== segment.freezeId) return [];
      const start = Math.max(origin, span.start);
      const end = Math.min(limit, span.end);
      return end > start
        ? [
            {
              start: segment.resultStart + (start - origin) / rate,
              end: segment.resultStart + (end - origin) / rate,
              sourceStart: freeze ? segment.sourceStart : start,
              sourceEnd: freeze ? segment.sourceEnd : end,
              offset: span.offset + (start - span.start) / span.rate,
              rate: rate / span.rate,
            },
          ]
        : [];
    });
  });
}

/** Bounds on the source axis, including parts currently hidden by a cut. */
export function reviewVisualAnchorSourceRange(
  anchor: NonNullable<ReviewVisualPlacement['visualAnchor']>
) {
  const first = anchor[0]!;
  const last = anchor.at(-1)!;
  return { start: first.sourceTime ?? first.start, end: last.sourceTime ?? last.end };
}

/** Timeline geometry includes cut intervals, using the existing source and freeze display axes. */
export function displayReviewVisualAnchor(
  item: ReviewVisualPlacement,
  display: ReviewVisualDisplay,
  phase = 0
) {
  const anchor = item.visualAnchor;
  if (!anchor) return display.resultToDisplay(item.start + phase, phase ? 'end' : 'start');
  const span =
    anchor.find((span) => phase <= span.offset + (span.end - span.start) / span.rate) ??
    anchor.at(-1)!;
  const position = Math.min(
    span.end,
    Math.max(span.start, span.start + (phase - span.offset) * span.rate)
  );
  if (!span.freezeId) return display.sourceToDisplay(position, phase ? 'end' : 'start');
  const part = display.parts.find(({ segment }) => segment.freezeId === span.freezeId);
  if (part) return Math.min(part.end, part.start + position);
  return display.sourceToDisplay(span.sourceTime ?? 0);
}

/** A deliberate lane gesture creates a new placement, including the portion under a cut. */
export function anchorReviewVisualDisplay(
  range: { start: number; end: number },
  display: ReviewVisualDisplay
): ReviewVisualPlacement {
  let offset = 0;
  const visualAnchor = display.parts.flatMap((part) => {
    const from = Math.max(part.start, range.start);
    const to = Math.min(part.end, range.end);
    if (to <= from) return [];
    const { segment } = part;
    const base = segment.kind === 'freeze' ? 0 : segment.sourceStart;
    const rate = segment.kind === 'freeze' ? 1 : segment.rate;
    const span = {
      start: base + (from - part.start),
      end: base + (to - part.start),
      offset,
      rate,
      ...(segment.freezeId ? { freezeId: segment.freezeId, sourceTime: segment.sourceStart } : {}),
    };
    offset += (to - from) / rate;
    return [span];
  });
  const start = display.displayToResult(range.start);
  return { start, end: start + offset, visualAnchor };
}
