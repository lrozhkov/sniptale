import type { ReviewHistoryMove } from '../../features/video/review/types';
import type { createVideoReviewSession } from '../../workflows/video-review/session';

/** History transitions own staged flush and success reporting without owning document state. */
export function createReviewHistoryActions(args: {
  session: Pick<ReturnType<typeof createVideoReviewSession>, 'flush' | 'flushAutosave' | 'history'>;
  flushStaged(): Promise<void>;
  reset(): Promise<void>;
  run(action: () => Promise<unknown>): Promise<unknown>;
}) {
  const flush = async (retryHistory = false) => {
    await args.flushStaged();
    await args.session.flush(retryHistory ? { retryHistory: true } : undefined);
  };
  const move = async (direction: ReviewHistoryMove | 'reset') => {
    if (direction === 'reset') return args.reset();
    await args.flushStaged();
    await args.session.flushAutosave();
    await args.session.history(direction);
  };
  const run = async (direction: ReviewHistoryMove | 'reset') => {
    let completed = false;
    await args.run(async () => {
      await move(direction);
      completed = true;
    });
    return completed;
  };
  return { flush, move, run };
}
