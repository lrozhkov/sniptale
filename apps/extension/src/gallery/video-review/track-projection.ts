import { buildReviewTimeMap } from '../../features/video/review/timeline';
import type { ReviewEdit } from '../../features/video/review/types';

/** Advanced clips retain result times while every lane displays the original source axis. */
export function createTrackProjection(duration: number, edits: readonly ReviewEdit[]) {
  const segments = buildReviewTimeMap(duration, edits);
  const resultDuration = segments.at(-1)?.resultEnd ?? 0;
  const source = (time: number, edge: 'start' | 'end' = 'start') => {
    const visible = segments.filter((segment) => segment.kind !== 'cut');
    const part = visible.find((segment) =>
      edge === 'end'
        ? time > segment.resultStart && time <= segment.resultEnd
        : time >= segment.resultStart && time < segment.resultEnd
    );
    return part
      ? part.sourceStart + (time - part.resultStart) * part.rate
      : time <= 0
        ? (visible[0]?.sourceStart ?? 0)
        : (visible.at(-1)?.sourceEnd ?? duration);
  };
  const output = (time: number) => {
    const part = segments.find(
      (segment) => time >= segment.sourceStart && time < segment.sourceEnd
    );
    return part
      ? part.resultStart + (part.kind === 'cut' ? 0 : (time - part.sourceStart) / part.rate)
      : time <= 0
        ? 0
        : resultDuration;
  };
  return {
    duration,
    source,
    output,
    cuts: segments.filter((segment) => segment.kind === 'cut'),
    position: (time: number, edge?: 'start' | 'end') => source(time, edge) / duration,
    delta: (at: number, pixels: number, width: number) =>
      output(at + (pixels / width) * duration) - output(at),
  };
}
export type ReviewTrackProjection = ReturnType<typeof createTrackProjection>;
