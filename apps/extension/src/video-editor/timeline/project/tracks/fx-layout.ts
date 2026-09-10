import type { VideoProjectEffectInstance } from '../../../../features/video/project/effect-instance/types';

/** Presentation lanes only: never reorder the project's effect processing stack. */
export function packTimelineFxRows(instances: readonly VideoProjectEffectInstance[]): string[][] {
  const rows: string[][] = [];
  const ends: number[] = [];
  for (const instance of instances.toSorted((a, b) => a.startTime - b.startTime)) {
    let row = ends.findIndex((end) => end <= instance.startTime + 1e-9);
    if (row < 0) {
      row = rows.length;
      rows.push([]);
    }
    rows[row]!.push(instance.id);
    ends[row] = instance.startTime + instance.duration;
  }
  return rows;
}

/** Union coverage for the collapsed, non-editable overview. */
export function resolveTimelineFxCoverage(instances: readonly VideoProjectEffectInstance[]) {
  const ranges: Array<{ startTime: number; duration: number }> = [];
  for (const instance of instances.toSorted((a, b) => a.startTime - b.startTime)) {
    const previous = ranges.at(-1);
    if (previous && instance.startTime <= previous.startTime + previous.duration + 1e-9) {
      previous.duration = Math.max(
        previous.duration,
        instance.startTime + instance.duration - previous.startTime
      );
    } else {
      ranges.push({ startTime: instance.startTime, duration: instance.duration });
    }
  }
  return ranges;
}
