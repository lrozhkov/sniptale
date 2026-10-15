import { buildReviewTimeMap } from '../../features/video/review/timeline';
import type { ReviewEdit } from '../../features/video/review/types';
import type { VideoExportSampleWindow } from '../../features/video/project/export/size-estimate';
type Segment = ReturnType<typeof buildReviewTimeMap>[number];

export interface ReviewFrameWindow {
  segment: Segment;
  /** Output timestamps of the window's frames, on the fps lattice. */
  timestamps: number[];
  /** Source positions sampled for each output timestamp. */
  sourceTimes: number[];
}

/** Output frame schedule over kept segments; the last frame never passes the segment end. */
export function reviewRenderFrameSchedule(
  duration: number,
  edits: readonly ReviewEdit[],
  fps: number,
  ranges?: readonly VideoExportSampleWindow[]
): ReviewFrameWindow[] {
  if (!Number.isFinite(fps) || fps <= 0) throw new Error('Render frame rate is invalid.');
  return buildReviewTimeMap(duration, edits)
    .filter((part) => part.kind !== 'cut')
    .flatMap((segment) =>
      (ranges ?? [{ start: segment.resultStart, end: segment.resultEnd }]).flatMap((range) => {
        const startFrame = Math.max(0, Math.ceil((range.start - segment.resultStart) * fps - 1e-9));
        const end = Math.min(range.end, segment.resultEnd);
        const count = Math.max(0, Math.ceil((end - segment.resultStart) * fps - 1e-9) - startFrame);
        if (!count) return [];
        return [
          {
            segment,
            timestamps: Array.from(
              { length: count },
              (_, k) => segment.resultStart + (startFrame + k) / fps
            ),
            sourceTimes: Array.from(
              { length: count },
              (_, k) => segment.sourceStart + ((startFrame + k) / fps) * segment.rate
            ),
          },
        ];
      })
    );
}
