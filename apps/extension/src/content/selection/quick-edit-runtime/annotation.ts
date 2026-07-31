import {
  browserAnnotationSession,
  createBrowserAnnotationTargetEvidence,
  type BrowserAnnotationTargetEvidence,
  type BrowserAnnotationTextChangeInput,
} from '../../parser/page-preparation/annotations';

export interface QuickEditTextAnnotationCapture {
  before: string;
  evidence: BrowserAnnotationTargetEvidence;
  target: HTMLElement;
}

interface QuickEditCommittedTextChange {
  after: string;
  capture: QuickEditTextAnnotationCapture;
}

/** Captures text independently from the private DOM-history snapshot. */
export function captureQuickEditTextAnnotation(
  target: HTMLElement
): QuickEditTextAnnotationCapture {
  return {
    before: target.textContent ?? '',
    evidence: createBrowserAnnotationTargetEvidence(target),
    target,
  };
}

/** Publishes one committed Quick Edit operation as one annotation-session mutation. */
export function publishCommittedQuickEditTextChanges(
  changes: readonly QuickEditCommittedTextChange[]
): void {
  const inputs: BrowserAnnotationTextChangeInput[] = changes.map(({ after, capture }) => ({
    after,
    before: capture.before,
    evidence: capture.evidence,
    target: capture.target,
  }));
  browserAnnotationSession.recordTextChanges(inputs);
}
