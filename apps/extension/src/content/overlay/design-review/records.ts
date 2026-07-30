import type {
  BrowserDesignReviewAction,
  BrowserDomAnnotationRecord,
} from '../../parser/page-preparation/annotations';

export function isDesignReviewFeedbackRecord(record: BrowserDomAnnotationRecord): boolean {
  return Boolean(
    record.comment || record.designReview?.action || record.propertyChanges.length > 0
  );
}

export function getDesignReviewRecordAction(
  record: BrowserDomAnnotationRecord
): BrowserDesignReviewAction {
  return record.designReview?.action ?? 'refine';
}
