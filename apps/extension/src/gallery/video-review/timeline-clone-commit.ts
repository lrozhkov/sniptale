import type { ReviewDocument, ReviewOperation } from '../../features/video/review/types';
import type { cloneReviewTimelineSelection } from './timeline-clone';

/** Publishes a completed clone plan through the existing ordered session command owner. */
export async function commitReviewTimelineClonePlan(
  session: { commit(operation: ReviewOperation): Promise<unknown> },
  document: Pick<ReviewDocument, 'advancedContent'>,
  plan: NonNullable<ReturnType<typeof cloneReviewTimelineSelection>>,
  advancedContentChanged: boolean
): Promise<void> {
  if (advancedContentChanged)
    await session.commit({
      id: crypto.randomUUID(),
      at: Date.now(),
      target: 'advancedContent',
      before: document.advancedContent,
      after: plan.content,
    });
  for (const after of plan.edits)
    await session.commit({
      id: crypto.randomUUID(),
      at: Date.now(),
      target: 'edit',
      before: null,
      after,
    });
}
