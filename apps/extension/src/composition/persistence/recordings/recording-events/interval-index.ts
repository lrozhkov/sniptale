/** Exact dyadic node in the nonnegative safe-integer microsecond domain. */
type RecordingEventIntervalBucket = readonly [level: number, index: number];
interface RecordingEventIntervalQueryRange {
  level: number;
  from: number;
  to: number;
}

function admitInterval(from: number, to: number): void {
  if (!Number.isSafeInteger(from) || from < 0 || !Number.isSafeInteger(to) || to < from)
    throw new Error('Invalid recording event interval.');
}

export function isRecordingEventIntervalBucket(
  value: unknown
): value is RecordingEventIntervalBucket {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    Number.isSafeInteger(value[0]) &&
    value[0] >= 0 &&
    value[0] <= 53 &&
    Number.isSafeInteger(value[1]) &&
    value[1] >= 0 &&
    value[1] < 2 ** (53 - value[0])
  );
}

/** Covers an inclusive source interval with at most 106 exact nodes. No duration quota applies. */
export function recordingEventIntervalBuckets(
  from: number,
  to: number
): RecordingEventIntervalBucket[] {
  admitInterval(from, to);
  const buckets: RecordingEventIntervalBucket[] = [];
  let left = from;
  let right = to;
  for (let level = 0; level <= 53; level++) {
    if (left % 2 === 1) {
      buckets.push([level, left]);
      if (left === right) break;
      left++;
    }
    if (right % 2 === 0) {
      buckets.push([level, right]);
      if (left === right) break;
      right--;
    }
    left = Math.floor(left / 2);
    right = Math.floor(right / 2);
  }
  return buckets.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}

/** Each level uses one bounded index range, including instant and whole-recording queries. */
export function recordingEventIntervalQuery(
  from: number,
  to: number
): RecordingEventIntervalQueryRange[] {
  admitInterval(from, to);
  return Array.from({ length: 54 }, (_, level) => ({
    level,
    from: Math.floor(from / 2 ** level),
    to: Math.floor(to / 2 ** level),
  }));
}

/** A cursor emits a fact only at this node. Overlapping nodes need no accumulated ID set. */
export function firstRecordingEventIntervalMatch(
  buckets: readonly RecordingEventIntervalBucket[],
  from: number,
  to: number
): RecordingEventIntervalBucket | null {
  admitInterval(from, to);
  if (buckets.length < 1 || buckets.length > 106 || !buckets.every(isRecordingEventIntervalBucket))
    throw new Error('Invalid recording event interval index.');
  let first: RecordingEventIntervalBucket | null = null;
  for (const bucket of buckets) {
    const [level, index] = bucket;
    if (index < Math.floor(from / 2 ** level) || index > Math.floor(to / 2 ** level)) continue;
    if (!first || level < first[0] || (level === first[0] && index < first[1])) first = bucket;
  }
  return first;
}
