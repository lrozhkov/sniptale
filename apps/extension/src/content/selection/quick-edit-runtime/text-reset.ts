import {
  applyDomMutationBatch,
  captureDomElementState,
  createDomMutationBatch,
  pagePreparationHistory,
} from '../../parser/page-preparation/history';
import { createQuickEditHistoryTracker } from './history';
import { browserAnnotationSession } from '../../parser/page-preparation/annotations';

/** Reports whether an exact live target has a modified canonical text baseline. */
export function canResetQuickEditText(target: Element): boolean {
  const ElementConstructor = target.ownerDocument.defaultView?.HTMLElement ?? HTMLElement;
  if (
    !(target instanceof HTMLElement || target instanceof ElementConstructor) ||
    !target.isConnected
  )
    return false;
  const hasTextChange = browserAnnotationSession
    .captureSnapshot()
    .domRecords.some(
      (record) =>
        record.textChange && browserAnnotationSession.getLiveTarget(record.annotationId) === target
    );
  if (!hasTextChange) return false;
  const baseline = pagePreparationHistory.getTextBaseline(target);
  return baseline !== null && baseline.html !== captureDomElementState(target).html;
}

/** Restores only original rich text through the canonical reversible text transaction. */
export function resetQuickEditText(target: Element): boolean {
  const ElementConstructor = target.ownerDocument.defaultView?.HTMLElement ?? HTMLElement;
  if (
    !(target instanceof HTMLElement || target instanceof ElementConstructor) ||
    !canResetQuickEditText(target)
  )
    return false;
  const baseline = pagePreparationHistory.getTextBaseline(target);
  if (!baseline || pagePreparationHistory.hasOpenTransactions()) return false;
  const tracker = createQuickEditHistoryTracker();
  const id = `text-reset-${crypto.randomUUID()}`;
  tracker.begin(target, id);
  try {
    const current = captureDomElementState(target);
    const batch = createDomMutationBatch([target]);
    const resetBatch = {
      patches: batch.patches.map((patch) => ({
        ...patch,
        before: current,
        after: { attributes: { ...current.attributes }, html: baseline.html },
      })),
    };
    try {
      if (!applyDomMutationBatch(resetBatch, 'redo').success) {
        tracker.cancel(id);
        return false;
      }
    } catch (error) {
      try {
        if (!applyDomMutationBatch(resetBatch, 'undo').success) {
          throw new Error('Text reset DOM compensation was refused', { cause: error });
        }
      } catch (rollbackError) {
        throw new AggregateError([error, rollbackError], 'Text reset and compensation failed', {
          cause: rollbackError,
        });
      }
      throw error;
    }
    return tracker.commit(target, id);
  } catch (error) {
    tracker.cancel(id);
    throw error;
  }
}
