import {
  browserAnnotationSession,
  type BrowserAnnotationTargetEvidence,
} from '../../../parser/page-preparation/annotations';
import { pagePreparationHistory } from '../../../parser/page-preparation/history';
import type { PageStyleMutationElement } from '../../../selection/design-review/style/types';
import { flushPendingPageStyleHistory } from './actions';

interface PropertiesCommentState {
  comment: string;
  marker: number | null;
}

let propertiesCommentTransactionSequence = 0;

function createPropertiesCommentTransactionId(): string {
  propertiesCommentTransactionSequence += 1;
  return `page-style-comment:${Date.now()}:${propertiesCommentTransactionSequence}`;
}

export function readPropertiesComment(target: Element): PropertiesCommentState {
  const annotationId = browserAnnotationSession.getAnnotationId(target);
  if (annotationId === null) {
    return { comment: '', marker: null };
  }

  const record = browserAnnotationSession
    .captureSnapshot()
    .domRecords.find((candidate) => candidate.annotationId === annotationId);
  return {
    comment: record?.comment ?? '',
    marker: record?.markerNumber ?? null,
  };
}

/** Commits one Properties comment as a standalone session/history transaction. */
export function commitPropertiesComment(args: {
  comment: string;
  evidence: BrowserAnnotationTargetEvidence;
  target: PageStyleMutationElement;
}): number | null {
  flushPendingPageStyleHistory();

  const rollbackPoint = browserAnnotationSession.captureFailedMutationRollbackPoint();
  const transactionId = createPropertiesCommentTransactionId();
  if (!pagePreparationHistory.beginTransaction(transactionId)) {
    throw new Error('Properties comment history transaction is unavailable');
  }

  try {
    const marker = browserAnnotationSession.setComment(args);
    pagePreparationHistory.commitTransaction(transactionId);
    return marker;
  } catch (error) {
    pagePreparationHistory.cancelTransaction(transactionId);
    if (!browserAnnotationSession.rollbackFailedMutation(rollbackPoint)) {
      throw new Error('Properties comment annotation rollback was refused', { cause: error });
    }
    throw error;
  }
}
