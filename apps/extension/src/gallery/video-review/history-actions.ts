import type { ReviewHistoryDirection } from '../../features/video/review/types';
import type { createVideoReviewSession } from '../../workflows/video-review/session';

/** History transitions own staged flush and success reporting without owning document state. */
export function createReviewHistoryActions(args: {
  session: ReturnType<typeof createVideoReviewSession>;
  flushStaged(): Promise<void>;
  reset(): Promise<void>;
  run(action: () => Promise<unknown>): Promise<unknown>;
}) {
  const flush = async (retryHistory = false) => {
    await args.flushStaged();
    await args.session.flush(retryHistory ? { retryHistory: true } : undefined);
  };
  const move = async (direction: ReviewHistoryDirection | 'reset') => {
    if (direction === 'reset') return args.reset();
    await flush(true);
    await args.session.history(direction);
  };
  const run = async (direction: ReviewHistoryDirection | 'reset') => {
    let completed = false;
    await args.run(async () => {
      await move(direction);
      completed = true;
    });
    return completed;
  };
  return { flush, move, run };
}
