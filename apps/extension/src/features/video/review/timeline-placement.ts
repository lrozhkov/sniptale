import type { ReviewTimeSegment } from './time-segment';
import type { CursorMotion } from '../project/cursor-motion';
import type { QuickEditWebcam } from './advanced/webcam';
import type { CursorFocusPath, CursorFocusKey } from '../project/cursor-focus-path/types';
import { evaluateCursorFocusSegment } from '../project/cursor-focus-path/evaluator';

// Authored values and time maps are immutable; playback must retain projected object identities.
const cursorPathProjections = new WeakMap<
  CursorFocusPath,
  WeakMap<readonly ReviewTimeSegment[], CursorFocusPath>
>();
const webcamProjections = new WeakMap<
  QuickEditWebcam,
  WeakMap<readonly ReviewTimeSegment[], QuickEditWebcam>
>();
const cursorMotionProjections = new WeakMap<
  readonly CursorMotion[],
  WeakMap<readonly ReviewTimeSegment[], CursorMotion[]>
>();

/** Recorded observations hold their captured position while the project clock keeps advancing. */
export function projectReviewCursorPath(
  path: CursorFocusPath | undefined,
  map?: readonly ReviewTimeSegment[]
): CursorFocusPath | undefined {
  if (!path || !map) return path;
  let projections = cursorPathProjections.get(path);
  const cached = projections?.get(map);
  if (cached) return cached;
  const projected: CursorFocusPath = {
    ...path,
    segments: path.segments.flatMap((segment) =>
      map.flatMap((part, index) => {
        if (part.kind === 'cut') return [];
        const hold = part.kind === 'freeze';
        const start = hold
          ? (part.frameTime ?? part.sourceStart)
          : Math.max(segment.start, part.sourceStart);
        const end = hold ? start : Math.min(segment.end, part.sourceEnd);
        if (start < segment.start || start > segment.end || (!hold && end <= start)) return [];
        const first = evaluateCursorFocusSegment(segment, start, path.smoothing);
        const last = hold ? first : evaluateCursorFocusSegment(segment, end, path.smoothing);
        if (!first || !last) return [];
        const resultStart = hold
          ? part.resultStart
          : part.resultStart + (start - part.sourceStart) / part.rate;
        const resultEnd = hold
          ? part.resultEnd
          : part.resultStart + (end - part.sourceStart) / part.rate;
        const keys: CursorFocusKey[] = [
          {
            id: `${segment.id}:${index}:start`,
            time: resultStart,
            x: first.x,
            y: first.y,
            anchor: 'boundary',
            interpolation: hold ? 'hold' : 'linear',
          },
          ...(!hold
            ? segment.keys
                .filter((key) => key.time > start && key.time < end)
                .map((key) => ({
                  ...key,
                  time: part.resultStart + (key.time - part.sourceStart) / part.rate,
                }))
            : []),
          {
            id: `${segment.id}:${index}:end`,
            time: resultEnd,
            x: last.x,
            y: last.y,
            anchor: 'boundary',
            interpolation: 'linear',
          },
        ];
        return [
          {
            ...segment,
            id: `${segment.id}:result:${index}`,
            binding: { kind: 'project' as const },
            start: resultStart,
            end: resultEnd,
            keys,
          },
        ];
      })
    ),
  };
  if (!projections) {
    projections = new WeakMap();
    cursorPathProjections.set(path, projections);
  }
  projections.set(map, projected);
  return projected;
}

/** Camera pixels use source time; authored placement and visibility use project time. */
export function projectReviewWebcam(
  webcam: QuickEditWebcam | undefined,
  segments?: readonly ReviewTimeSegment[]
): QuickEditWebcam | undefined {
  if (
    !webcam ||
    webcam.timeDomain === 'result' ||
    !segments ||
    !segments.some((segment) => segment.kind === 'freeze')
  )
    return webcam;
  let projections = webcamProjections.get(webcam);
  const cached = projections?.get(segments);
  if (cached) return cached;
  const point = (time: number) =>
    projectReviewVisualRange({ start: time, end: time + 1e-7 }, segments)?.start;
  const projected: QuickEditWebcam = {
    ...webcam,
    timeDomain: 'result',
    hiddenRanges: webcam.hiddenRanges.flatMap((range) => {
      const projected = projectReviewVisualRange(range, segments);
      return projected ? [{ ...range, ...projected }] : [];
    }),
    positions: webcam.positions.flatMap((position) => {
      const time = point(position.time);
      if (time === undefined) return [];
      const transition = projectReviewVisualRange(
        { start: position.time, end: position.time + Math.max(1e-7, position.transition.duration) },
        segments
      );
      return [
        {
          ...position,
          time,
          transition: {
            ...position.transition,
            duration:
              position.transition.duration > 0 && transition
                ? Math.min(60, transition.end - time)
                : 0,
          },
        },
      ];
    }),
  };
  if (!projections) {
    projections = new WeakMap();
    webcamProjections.set(webcam, projections);
  }
  projections.set(segments, projected);
  return projected;
}

/** Authored movement follows the visual interval, including held video frames. */
export function projectReviewCursorMotions(
  motions: readonly CursorMotion[] | undefined,
  segments?: readonly ReviewTimeSegment[]
) {
  if (!motions) return undefined;
  if (!segments) return [...motions];
  let projections = cursorMotionProjections.get(motions);
  const cached = projections?.get(segments);
  if (cached) return cached;
  const projected = motions.flatMap((motion) => {
    if (motion.timeDomain === 'result') return [motion];
    const range = projectReviewVisualRange(motion, segments);
    return range ? [{ ...motion, ...range, timeDomain: 'result' as const }] : [];
  });
  if (!projections) {
    projections = new WeakMap();
    cursorMotionProjections.set(motions, projections);
  }
  projections.set(segments, projected);
  return projected;
}

/** Visual intervals include inserted video time while their recorded source anchors stay immutable. */
export function projectReviewVisualRange(
  range: { start: number; end: number },
  segments: readonly ReviewTimeSegment[]
) {
  const spans = segments.flatMap((part) => {
    if (part.kind === 'cut') return [];
    if (part.kind === 'freeze')
      return range.start <= part.sourceStart && part.sourceStart < range.end
        ? [{ start: part.resultStart, end: part.resultEnd }]
        : [];
    const start = Math.max(range.start, part.sourceStart);
    const end = Math.min(range.end, part.sourceEnd);
    return end > start
      ? [
          {
            start: part.resultStart + (start - part.sourceStart) / part.rate,
            end: part.resultStart + (end - part.sourceStart) / part.rate,
          },
        ]
      : [];
  });
  return spans.length ? { start: spans[0]!.start, end: spans.at(-1)!.end } : null;
}

/** Result-time boundaries retain their position inside an inserted frame when video edits change. */
export function retimeReviewResultRange(
  range: { start: number; end: number },
  before: readonly ReviewTimeSegment[],
  after: readonly ReviewTimeSegment[]
) {
  const boundary = (time: number, end: boolean) => {
    const previous = before.find(
      (part) =>
        part.kind !== 'cut' &&
        (end
          ? time > part.resultStart && time <= part.resultEnd
          : time >= part.resultStart && time < part.resultEnd)
    );
    if (!previous) {
      const oldEnd = before.at(-1)?.resultEnd ?? 0;
      return Math.max(0, (after.at(-1)?.resultEnd ?? 0) + time - oldEnd);
    }
    if (previous.kind === 'freeze') {
      const next = after.find(
        (part) => part.freezeId === previous.freezeId && part.kind === 'freeze'
      );
      if (next)
        return (
          next.resultStart +
          Math.min(time - previous.resultStart, next.resultEnd - next.resultStart)
        );
    }
    const source =
      previous.kind === 'freeze'
        ? previous.sourceStart
        : previous.sourceStart + (time - previous.resultStart) * previous.rate;
    const next = after.find(
      (part) =>
        part.kind !== 'freeze' &&
        (end
          ? source > part.sourceStart && source <= part.sourceEnd
          : source >= part.sourceStart && source < part.sourceEnd)
    );
    return next
      ? next.resultStart + (next.kind === 'cut' ? 0 : (source - next.sourceStart) / next.rate)
      : source <= 0
        ? 0
        : (after.at(-1)?.resultEnd ?? 0);
  };
  return { start: boundary(range.start, false), end: boundary(range.end, true) };
}

/** Points inside removed video time disappear with that time instead of leaking onto its boundary. */
export function retimeReviewResultPoint(
  time: number,
  before: readonly ReviewTimeSegment[],
  after: readonly ReviewTimeSegment[]
) {
  const owner = before.find(
    (part) => part.kind === 'freeze' && time >= part.resultStart && time < part.resultEnd
  );
  if (owner) {
    const retained = after.find(
      (part) => part.kind === 'freeze' && part.freezeId === owner.freezeId
    );
    if (!retained || time - owner.resultStart >= retained.resultEnd - retained.resultStart)
      return null;
  }
  return retimeReviewResultRange({ start: time, end: time + 1e-7 }, before, after).start;
}
