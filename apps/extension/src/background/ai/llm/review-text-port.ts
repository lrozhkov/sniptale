import { registerTextJobPort } from './text-job-port';
import {
  REVIEW_TEXT_PORT_NAME,
  parseReviewTextClientMessage,
} from '../../../contracts/ai/review-text';
import { isReviewTextSender } from './authorization/review-text';
import type { ReviewTextJobService } from './review-text-job';

export function registerReviewTextPorts(service: ReviewTextJobService): () => void {
  return registerTextJobPort({
    name: REVIEW_TEXT_PORT_NAME,
    isSender: isReviewTextSender,
    parse: parseReviewTextClientMessage,
    connect: (sender, send) => service.connect(sender, send),
  });
}
