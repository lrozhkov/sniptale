import { snapReviewRange } from './cuts';
import { buildReviewTimeMap, type ReviewTimeSegment } from './timeline';
import type { ReviewAnchor, ReviewEdit } from './types';

type Bounds = { start: number; end: number };
type SelectedHolds = ReadonlyMap<string, number | 'full'>;

/** A disposable fragment request. Result bounds preserve positions inside inserted video. */
export type ReviewFragmentSelection = Extract<ReviewAnchor, { kind: 'range' }> & {
  result?: Bounds;
};

function sourceAt(segment: ReviewTimeSegment, time: number): number {
  if (time <= segment.resultStart || segment.kind === 'freeze') return segment.sourceStart;
  if (time >= segment.resultEnd) return segment.sourceEnd;
  return Math.min(
    segment.sourceEnd,
    segment.sourceStart + (time - segment.resultStart) * segment.rate
  );
}

function resultProjection(map: readonly ReviewTimeSegment[], result: Bounds) {
  const { start, end } = result;
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start < 0 ||
    start >= end ||
    end > (map.at(-1)?.resultEnd ?? 0)
  )
    return null;

  const visible = map.filter(
    (part) => part.kind !== 'cut' && part.resultStart < end && part.resultEnd > start
  );
  const first = visible[0];
  const last = visible.at(-1);
  if (!first || !last) return null;
  const holds = new Map<string, number | 'full'>();
  for (const segment of visible) {
    if (segment.kind === 'freeze' && segment.freezeId !== undefined)
      holds.set(
        segment.freezeId,
        start <= segment.resultStart && end >= segment.resultEnd
          ? 'full'
          : Math.min(end, segment.resultEnd) - Math.max(start, segment.resultStart)
      );
  }
  return { start: sourceAt(first, start), end: sourceAt(last, end), holds };
}

function sourceFragmentOffset(map: readonly ReviewTimeSegment[], time: number): number {
  const segment = map.find(
    (part) => time < part.sourceEnd || (part.kind === 'freeze' && time === part.sourceStart)
  );
  if (!segment) return map.at(-1)?.resultEnd ?? 0;
  return (
    segment.resultStart +
    (segment.rate > 0 && segment.kind !== 'cut' ? (time - segment.sourceStart) / segment.rate : 0)
  );
}

/** Trim a temporary export. The requested clock names the clip, and result bounds align its effects. */
export function createReviewFragment(args: {
  selection: ReviewFragmentSelection | Extract<ReviewAnchor, { kind: 'point' }>;
  duration: number;
  boundaries: readonly number[];
  snapToKeyframes?: boolean;
  edits: readonly ReviewEdit[];
}): (Bounds & { result: Bounds; edits: ReviewEdit[] }) | null {
  const { selection, duration, boundaries } = args;
  const snap = args.snapToKeyframes !== false;
  if (
    selection.kind !== 'range' ||
    (snap && !boundaries.length) ||
    !Number.isFinite(duration) ||
    duration <= 0
  )
    return null;

  const exactResult = snap ? undefined : selection.result;
  if (
    !exactResult &&
    (!Number.isFinite(selection.start) ||
      !Number.isFinite(selection.end) ||
      selection.start < 0 ||
      selection.end > duration ||
      selection.start >= selection.end)
  )
    return null;
  const source = exactResult ? null : snapReviewRange(selection, boundaries, snap);
  if (source && (source.start < 0 || source.end > duration || source.start >= source.end))
    return null;

  const fullMap = buildReviewTimeMap(duration, args.edits);
  const projection: (Bounds & { holds?: SelectedHolds }) | null = exactResult
    ? resultProjection(fullMap, exactResult)
    : source;
  if (!projection) return null;
  const { start, end, holds } = projection;
  const edits = args.edits.flatMap((edit): ReviewEdit[] => {
    if (edit.kind === 'freeze') {
      if (holds) {
        const duration = holds.get(edit.id);
        if (duration === undefined) return [];
        return [
          {
            ...edit,
            duration: duration === 'full' ? edit.duration : Math.min(duration, edit.duration),
          },
        ];
      }
      return edit.start >= start && (edit.start < end || (end === duration && edit.start === end))
        ? [{ ...edit }]
        : [];
    }
    return start < end && edit.start < end && edit.end > start
      ? [{ ...edit, start: Math.max(start, edit.start), end: Math.min(end, edit.end) }]
      : [];
  });

  const ids = new Set(args.edits.map((edit) => edit.id));
  const exclude = (from: number, to: number) => {
    if (from >= to) return;
    let id = 'fragment-boundary';
    while (ids.has(id)) id += '-';
    ids.add(id);
    edits.push({ id, kind: 'cut', start: from, end: to, requestedStart: from, requestedEnd: to });
  };
  exclude(0, start);
  exclude(end, duration);
  edits.sort((left, right) => left.start - right.start);

  const length = buildReviewTimeMap(duration, edits).at(-1)?.resultEnd ?? 0;
  if (length <= 0) return null;
  const offset = exactResult?.start ?? sourceFragmentOffset(fullMap, start);
  return {
    ...(exactResult ?? { start, end }),
    result: exactResult ?? { start: offset, end: offset + length },
    edits,
  };
}
