import {
  applyDomMutationBatch,
  captureDomElementState,
  captureDomStateMap,
  createDomMutationBatch,
  pagePreparationHistory,
  type PageDomMutationBatch,
  type PageDomElementState,
} from '../../parser/page-preparation/history';
import { browserAnnotationSession } from '../../parser/page-preparation/annotations';
import {
  captureQuickEditTextAnnotation,
  publishCommittedQuickEditTextChanges,
  type QuickEditTextAnnotationCapture,
} from './annotation';

interface QuickEditOpenHistory {
  annotation: QuickEditTextAnnotationCapture;
  beforeState: PageDomElementState;
  beforeStates: Map<string, PageDomElementState>;
}

type HistoryDomStateById = Map<string, QuickEditOpenHistory>;

function rollbackFailedQuickEditCommit(args: {
  batch: PageDomMutationBatch;
  rollbackPoint: ReturnType<typeof browserAnnotationSession.captureFailedMutationRollbackPoint>;
  transactionId: string;
}): Error[] {
  const failures: Error[] = [];
  try {
    pagePreparationHistory.cancelTransaction(args.transactionId);
  } catch (error) {
    failures.push(new Error('Quick Edit transaction cancellation failed', { cause: error }));
  }
  try {
    const domRollback = applyDomMutationBatch(args.batch, 'undo');
    if (!domRollback.success) {
      failures.push(
        new Error(`Quick Edit DOM rollback failed: ${domRollback.missingLocators.join(', ')}`)
      );
    }
  } catch (error) {
    failures.push(new Error('Quick Edit DOM rollback threw', { cause: error }));
  }
  try {
    if (!browserAnnotationSession.rollbackFailedMutation(args.rollbackPoint)) {
      failures.push(new Error('Quick Edit annotation-session rollback was refused'));
    }
  } catch (error) {
    failures.push(new Error('Quick Edit annotation-session rollback threw', { cause: error }));
  }
  return failures;
}

function throwQuickEditCommitFailure(error: unknown, rollbackFailures: Error[]): never {
  if (rollbackFailures.length > 0) {
    throw new AggregateError(
      [error instanceof Error ? error : new Error('Quick Edit commit failed'), ...rollbackFailures],
      'Quick Edit commit and compensation failed'
    );
  }
  throw error;
}

export function createQuickEditHistoryTracker() {
  const historyDomStateById: HistoryDomStateById = new Map();

  return {
    begin(element: HTMLElement, id: string) {
      const transactionId = `quick-edit:${id}`;
      if (!pagePreparationHistory.beginTransaction(transactionId)) {
        throw new Error('Quick Edit history transaction is unavailable');
      }
      try {
        historyDomStateById.set(id, {
          annotation: captureQuickEditTextAnnotation(element),
          beforeState: captureDomElementState(element),
          beforeStates: captureDomStateMap([element]),
        });
      } catch (error) {
        pagePreparationHistory.cancelTransaction(transactionId);
        throw error;
      }
    },
    commit(element: HTMLElement, id: string | undefined) {
      if (!id) {
        return false;
      }

      const openHistory = historyDomStateById.get(id);
      const transactionId = `quick-edit:${id}`;
      if (!openHistory || !element.isConnected || element !== openHistory.annotation.target) {
        historyDomStateById.delete(id);
        pagePreparationHistory.cancelTransaction(transactionId);
        if (openHistory && element !== openHistory.annotation.target) {
          throw new Error('Quick Edit history target does not match the captured element');
        }
        return false;
      }

      let batch: PageDomMutationBatch;
      try {
        const capturedBatch = createDomMutationBatch([element], openHistory.beforeStates);
        batch = {
          patches: capturedBatch.patches.map((patch) => {
            const locatorId = patch.before.attributes['data-sniptale-id'];
            return {
              ...patch,
              before: {
                ...openHistory.beforeState,
                attributes: {
                  ...openHistory.beforeState.attributes,
                  ...(locatorId ? { 'data-sniptale-id': locatorId } : {}),
                },
              },
            };
          }),
        };
      } catch (error) {
        pagePreparationHistory.cancelTransaction(transactionId);
        historyDomStateById.delete(id);
        throw error;
      }
      const rollbackPoint = browserAnnotationSession.captureFailedMutationRollbackPoint();
      try {
        publishCommittedQuickEditTextChanges([
          { after: element.textContent ?? '', capture: openHistory.annotation },
        ]);
        if (!pagePreparationHistory.commitTransaction(transactionId, batch)) {
          throw new Error('Quick Edit history transaction was lost before commit');
        }
        historyDomStateById.delete(id);
        return true;
      } catch (error) {
        historyDomStateById.delete(id);
        throwQuickEditCommitFailure(
          error,
          rollbackFailedQuickEditCommit({ batch, rollbackPoint, transactionId })
        );
      }
    },
    cancel(id: string | undefined) {
      if (!id) {
        return;
      }

      pagePreparationHistory.cancelTransaction(`quick-edit:${id}`);
      historyDomStateById.delete(id);
    },
  };
}
