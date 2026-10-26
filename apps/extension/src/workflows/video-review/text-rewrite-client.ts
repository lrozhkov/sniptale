import { runTextRequestPort } from '../ai-session/text-request-port';
import {
  REVIEW_TEXT_PORT_NAME,
  REVIEW_TEXT_TIMEOUT_MS,
  REVIEW_TEXT_KEEPALIVE_MS,
  parseReviewTextServerMessage,
  parseReviewTextProposal,
  type ReviewTextStart,
  type ReviewTextServerMessage,
  type ReviewTextProposal,
} from '../../contracts/ai/review-text';

/** One explicit request, one connection; interruption never retries a paid call. */
export function runReviewTextJob(
  start: ReviewTextStart,
  signal: AbortSignal
): Promise<ReviewTextProposal> {
  return runTextRequestPort<ReviewTextStart, ReviewTextServerMessage, ReviewTextProposal>({
    name: REVIEW_TEXT_PORT_NAME,
    start,
    signal,
    timeoutMs: REVIEW_TEXT_TIMEOUT_MS,
    keepaliveMs: REVIEW_TEXT_KEEPALIVE_MS,
    cancelMessage: 'Cancelled',
    parse: parseReviewTextServerMessage,
    readResult: (message) =>
      message.type === 'proposal' ? parseReviewTextProposal(message.proposal, start.context) : null,
  });
}
