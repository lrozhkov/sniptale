export type TimeRange = {
  endTime: number;
  startTime: number;
};

export function mergeTimeRanges(ranges: readonly TimeRange[], gapSeconds: number): TimeRange[] {
  const sortedRanges = [...ranges].sort((left, right) => left.startTime - right.startTime);
  const merged: TimeRange[] = [];

  for (const range of sortedRanges) {
    const previous = merged.at(-1);
    if (!previous || range.startTime > previous.endTime + gapSeconds) {
      merged.push({ ...range });
      continue;
    }

    previous.endTime = Math.max(previous.endTime, range.endTime);
  }

  return merged;
}
