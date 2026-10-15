import { evaluateCursorFocusSegment } from './evaluator';
import type {
  CursorFocusKey,
  CursorFocusPath,
  CursorFocusPoint,
  CursorFocusSegment,
} from './types';

const unit = (value: number) => Math.max(0, Math.min(1, value));

/** Stable ephemeral selection target for an explicit captured-anchor focus override. */
export const cursorFocusOverrideId = (id: string) => `focus-override:${id}`;

/** Clamps manual key time into its observed segment without mutating captured anchors. */
export function updateCursorFocusKey(
  path: CursorFocusPath,
  id: string,
  patch: Partial<
    Pick<CursorFocusKey, 'time' | 'x' | 'y' | 'incoming' | 'outgoing' | 'interpolation'>
  >
): CursorFocusPath {
  let changed = false;
  const captured = path.segments.flatMap((segment) => segment.keys).find((key) => key.id === id);
  if (
    captured &&
    captured.anchor !== 'manual' &&
    captured.anchor !== 'movement' &&
    (patch.time !== undefined || patch.x !== undefined || patch.y !== undefined)
  ) {
    const segment = path.segments.find((item) => item.keys.some((key) => key.id === id))!;
    const overrideId = cursorFocusOverrideId(id);
    const existing = segment.keys.find((key) => key.id === overrideId);
    if (
      !existing &&
      (patch.time ?? captured.time) === captured.time &&
      unit(patch.x ?? captured.x) === captured.x &&
      unit(patch.y ?? captured.y) === captured.y
    )
      return path;
    const base = existing
      ? path
      : insertCursorFocusKey(path, segment.id, {
          id: overrideId,
          time: captured.time,
          x: captured.x,
          y: captured.y,
        });
    return updateCursorFocusKey(base, overrideId, patch);
  }
  const result = {
    ...path,
    segments: path.segments.map((segment) => ({
      ...segment,
      keys: segment.keys
        .map((key) => {
          if (key.id !== id) return key;
          const geometryAllowed = key.anchor === 'manual' || key.anchor === 'movement';
          const updated = {
            ...key,
            ...patch,
            time: geometryAllowed
              ? Math.max(segment.start, Math.min(segment.end, patch.time ?? key.time))
              : key.time,
            x: geometryAllowed ? unit(patch.x ?? key.x) : key.x,
            y: geometryAllowed ? unit(patch.y ?? key.y) : key.y,
          };
          if (JSON.stringify(updated) === JSON.stringify(key)) return key;
          changed = true;
          return { ...updated, authored: true as const };
        })
        .sort((a, b) => compareCursorFocusKeys(a, b)),
    })),
  };
  return changed ? result : path;
}

/** Manual focus overrides preserve the original nearby captured anchor. */
export function insertCursorFocusKey(
  path: CursorFocusPath,
  segmentId: string,
  key: { id: string; time: number } & CursorFocusPoint
): CursorFocusPath {
  return {
    ...path,
    segments: path.segments.map((segment) =>
      segment.id === segmentId && key.time >= segment.start && key.time <= segment.end
        ? {
            ...segment,
            keys: [
              ...segment.keys,
              {
                ...key,
                x: unit(key.x),
                y: unit(key.y),
                anchor: 'manual' as const,
                interpolation: 'smooth' as const,
              },
            ].sort((a, b) => compareCursorFocusKeys(a, b)),
          }
        : segment
    ),
  };
}

/** Only explicitly authored keys can be deleted; reset discards the authored path instead. */
export function deleteCursorFocusKey(path: CursorFocusPath, id: string): CursorFocusPath {
  if (
    !path.segments.some((segment) =>
      segment.keys.some((key) => key.id === id && key.anchor === 'manual')
    )
  )
    return path;
  return {
    ...path,
    segments: path.segments
      .map((segment) => ({
        ...segment,
        keys: segment.keys.filter((key) => key.id !== id || key.anchor !== 'manual'),
      }))
      .filter((segment) => segment.keys.length > 0),
  };
}

/** Geometric simplification removes recording jitter from focus, retaining facts and authored anchors. */
export function simplifyCursorFocusPath(
  path: CursorFocusPath,
  retainedKeyId?: string
): CursorFocusPath {
  return {
    ...path,
    segments: path.segments.map((segment) => {
      if (segment.keys.length < 3) return segment;
      const keep = new Set<number>([0, segment.keys.length - 1]);
      for (let index = 0; index < segment.keys.length; index++)
        if (
          segment.keys[index]!.anchor !== 'movement' ||
          segment.keys[index]!.id === retainedKeyId ||
          segment.keys[index]!.authored ||
          segment.keys[index]!.incoming ||
          segment.keys[index]!.outgoing
        )
          keep.add(index);
      const anchors = [...keep].sort((a, b) => a - b);
      const pending = anchors.slice(1).map((end, index) => ({ start: anchors[index]!, end }));
      while (pending.length) {
        const interval = pending.pop()!;
        const first = segment.keys[interval.start]!;
        const last = segment.keys[interval.end]!;
        const dx = last.x - first.x;
        const dy = last.y - first.y;
        const distance = dx * dx + dy * dy;
        let furthestProgress = 0;
        let furthestIndex = interval.start;
        let worst = -1;
        let error = 0.002;
        for (let index = interval.start + 1; index < interval.end; index++) {
          const key = segment.keys[index]!;
          const progress =
            distance > 0 ? unit(((key.x - first.x) * dx + (key.y - first.y) * dy) / distance) : 0;
          const deviation = Math.hypot(
            key.x - first.x - (last.x - first.x) * progress,
            key.y - first.y - (last.y - first.y) * progress
          );
          if (deviation > error) {
            error = deviation;
            worst = index;
          }
          const reversal = (furthestProgress - progress) * Math.sqrt(distance);
          if (reversal > error) {
            error = reversal;
            worst = furthestIndex;
          }
          if (progress > furthestProgress) {
            furthestProgress = progress;
            furthestIndex = index;
          }
        }
        if (worst >= 0) {
          keep.add(worst);
          pending.push({ start: interval.start, end: worst }, { start: worst, end: interval.end });
        }
      }
      return { ...segment, keys: segment.keys.filter((_, index) => keep.has(index)) };
    }),
  };
}

/** Recorded anchors precede a deliberate manual override at the same source timestamp. */
export function compareCursorFocusKeys(a: CursorFocusKey, b: CursorFocusKey): number {
  const priority = { movement: 0, boundary: 1, click: 2, dwell: 3, manual: 4 };
  return (
    a.time - b.time ||
    priority[a.anchor] - priority[b.anchor] ||
    Number(a.authored === true) - Number(b.authored === true) ||
    a.id.localeCompare(b.id)
  );
}

/** Persistence stores deliberate content only; derived anchors and automatic controls are disposable. */
export function authoredCursorFocusPath(path: CursorFocusPath): CursorFocusPath {
  return {
    ...path,
    segments: path.segments
      .map((segment) => ({
        ...segment,
        keys: segment.keys.filter(
          (key) =>
            key.anchor === 'manual' ||
            key.authored === true ||
            key.incoming !== undefined ||
            key.outgoing !== undefined
        ),
      }))
      .filter((segment) => segment.keys.length > 0),
  };
}

/** Captured anchor geometry always comes from facts; sparse authored controls merge onto that base. */
export function resolveAuthoredCursorFocusPath(
  derived: CursorFocusPath,
  authored: CursorFocusPath | undefined
): CursorFocusPath {
  if (!authored) return derived;
  const segments = derived.segments.map((segment) => ({
    ...segment,
    keys: segment.keys.map((key) => ({ ...key })),
  }));
  for (const edit of authored.segments) {
    const matches = segments.filter(
      (segment) =>
        JSON.stringify(segment.binding) === JSON.stringify(edit.binding) &&
        segment.end >= edit.start &&
        segment.start <= edit.end
    );
    if (!matches.length) {
      const keys = edit.keys.filter(
        (key) => key.anchor === 'manual' || (key.anchor === 'movement' && key.authored)
      );
      if (keys.length) segments.push({ ...edit, keys });
      continue;
    }
    for (const segment of matches) mergeAuthoredSegmentKeys(segment, edit);
    appendAuthoredGapSegments(segments, matches, edit);
  }
  return { ...authored, segments };
}

/** Explicit source-clock authoring can fill unavailable coverage without creating captured facts. */
export function addReviewCursorFocusKey(
  path: CursorFocusPath,
  time: number,
  duration: number,
  id: string
): CursorFocusPath {
  const bounded = Math.max(0, Math.min(duration, time));
  const segment = path.segments.find((item) => bounded >= item.start && bounded <= item.end);
  if (segment) {
    const point = evaluateCursorFocusSegment(segment, bounded, path.smoothing)!;
    return insertCursorFocusKey(path, segment.id, { id, time: bounded, x: point.x, y: point.y });
  }
  const start = Math.max(
    0,
    ...path.segments.filter((item) => item.end <= bounded).map((item) => item.end)
  );
  const end = Math.min(
    duration,
    ...path.segments.filter((item) => item.start >= bounded).map((item) => item.start)
  );
  return {
    ...path,
    segments: [
      ...path.segments,
      {
        id: `manual-segment:${id}`,
        binding: { kind: 'project' },
        start,
        end,
        keys: [{ id, time: bounded, x: 0.5, y: 0.5, anchor: 'manual', interpolation: 'smooth' }],
      },
    ],
  };
}

function mergeAuthoredSegmentKeys(segment: CursorFocusSegment, edit: CursorFocusSegment): void {
  for (const key of edit.keys) {
    if (key.time < segment.start || key.time > segment.end) continue;
    const index = segment.keys.findIndex((item) => item.id === key.id);
    const captured = segment.keys[index];
    if (captured)
      segment.keys[index] =
        captured.anchor === 'movement' || captured.anchor === 'manual'
          ? { ...captured, ...key }
          : {
              ...captured,
              authored: true,
              interpolation: key.interpolation,
              ...(key.incoming ? { incoming: key.incoming } : {}),
              ...(key.outgoing ? { outgoing: key.outgoing } : {}),
            };
    else if (key.anchor === 'manual' || (key.anchor === 'movement' && key.authored))
      segment.keys.push(key);
  }
  segment.keys.sort(compareCursorFocusKeys);
}

function appendAuthoredGapSegments(
  segments: CursorFocusSegment[],
  matches: CursorFocusSegment[],
  edit: CursorFocusSegment
): void {
  // A deliberate key may occupy missing observations; adjacent captured boundaries
  // must not erase that authored interval when its disposable base is rebuilt.
  const uncovered = edit.keys.filter(
    (key) =>
      (key.anchor === 'manual' || (key.anchor === 'movement' && key.authored)) &&
      !matches.some((segment) => key.time >= segment.start && key.time <= segment.end)
  );
  const gaps = new Map<string, { start: number; end: number; keys: CursorFocusKey[] }>();
  for (const key of uncovered) {
    const start = Math.max(
      edit.start,
      ...matches.filter((segment) => segment.end < key.time).map((segment) => segment.end)
    );
    const end = Math.min(
      edit.end,
      ...matches.filter((segment) => segment.start > key.time).map((segment) => segment.start)
    );
    const identity = `${start}:${end}`;
    const gap = gaps.get(identity) ?? { start, end, keys: [] };
    gap.keys.push(key);
    gaps.set(identity, gap);
  }
  for (const gap of gaps.values()) {
    const id = segments.some((segment) => segment.id === edit.id)
      ? `${edit.id}:authored-gap:${gap.start}:${gap.end}`
      : edit.id;
    segments.push({ ...edit, ...gap, id, keys: gap.keys.toSorted(compareCursorFocusKeys) });
  }
}

/** Finish a nonempty captured run without changing its authored end or observed keys. */
export function finishCapturedCursorSegment(segment: CursorFocusSegment): void {
  segment.keys.sort(compareCursorFocusKeys);
  const last = segment.keys.at(-1)!;
  if (last.time < segment.end)
    segment.keys.push({ ...last, id: `end:${segment.id}`, time: segment.end, anchor: 'boundary' });
  else if (last.anchor === 'movement') last.anchor = 'boundary';
}
