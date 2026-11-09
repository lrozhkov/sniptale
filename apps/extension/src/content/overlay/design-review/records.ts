import type {
  BrowserDesignReviewAction,
  BrowserDomAnnotationRecord,
} from '../../parser/page-preparation/annotations';

/** Only current-origin evidence can affect the page-readable feedback view. */
export function isDesignReviewRecordFromCurrentOrigin(record: BrowserDomAnnotationRecord): boolean {
  try {
    return new URL(record.evidence.pageUrl).origin === location.origin;
  } catch {
    return false;
  }
}

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
