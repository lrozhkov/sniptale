import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import {
  applyReviewOperation,
  replayReviewHistory,
  ReviewHistoryError,
} from '../../../features/video/review/document';
import type { ReviewOperation, ReviewSource } from '../../../features/video/review/types';
import type { QuickEditAdvancedContent } from '../../../features/video/review/advanced/types';

/** Successful content admission drops only the known text-only header; never infer from malformed data. */
export function isDiscardedHeaderChange(raw: unknown, parsed: ReviewOperation): boolean {
  if (parsed.target !== 'advancedContent' || !isRecord(raw)) return false;
  const before = raw['before'];
  const after = raw['after'];
  return (
    isRecord(before) &&
    isRecord(after) &&
    parsed.before.windowHeader === undefined &&
    parsed.after.windowHeader === undefined &&
    JSON.stringify(before['windowHeader']) !== JSON.stringify(after['windowHeader'])
  );
}

/** Validate even dropped operations against their before-state, and retain the complete redo suffix. */
export function replayStoredReviewHistory(args: {
  history: readonly ReviewOperation[];
  discardedHeaderChanges: ReadonlySet<number>;
  cursor: number;
  source: ReviewSource;
  baseline: QuickEditAdvancedContent;
}) {
  let current = replayReviewHistory([], 0, args.source, args.baseline);
  let document = current;
  let cursor = 0;
  const history: ReviewOperation[] = [];
  for (const [index, operation] of args.history.entries()) {
    try {
      current = applyReviewOperation(current, operation, args.source);
      history.push(operation);
    } catch (error) {
      if (
        !(
          error instanceof ReviewHistoryError &&
          error.reason === 'no-change' &&
          args.discardedHeaderChanges.has(index)
        )
      ) {
        throw new ReviewHistoryError(
          error instanceof ReviewHistoryError ? error.reason : 'unexpected-replay-failure',
          index,
          operation.target
        );
      }
    }
    if (index < args.cursor) {
      document = current;
      cursor = history.length;
    }
  }
  return { document, history, cursor };
}
