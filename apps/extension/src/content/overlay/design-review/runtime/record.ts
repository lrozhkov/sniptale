import type { PageStyleProperty } from '@sniptale/runtime-contracts/page-style';
import {
  browserAnnotationSession,
  createBrowserAnnotationTargetEvidence,
  type BrowserDesignReviewAction,
  type BrowserDomAnnotationRecord,
} from '../../../parser/page-preparation/annotations';
import { pagePreparationHistory } from '../../../parser/page-preparation/history';
import { publishPageStyleAnnotation } from '../../../selection/design-review/style/annotation';
import {
  applyPageStyleMutationBatch,
  capturePageStyleMutationResidual,
  createPageStyleHistoryEffect,
} from '../../../selection/design-review/style/mutation';
import type {
  CssDeclarationPriority,
  PageStyleMutationBatch,
  PageStyleMutationElement,
} from '../../../selection/design-review/style/types';
import { flushPendingPageStyleHistory } from './actions';

let recordTransactionSequence = 0;

function createTransactionId(operation: string): string {
  recordTransactionSequence += 1;
  return `design-review-${operation}:${Date.now()}:${recordTransactionSequence}`;
}

export function readDesignReviewRecord(target: Element): BrowserDomAnnotationRecord | null {
  const annotationId = browserAnnotationSession.getAnnotationId(target);
  return annotationId === null
    ? null
    : (browserAnnotationSession
        .captureSnapshot()
        .domRecords.find((record) => record.annotationId === annotationId) ?? null);
}

export function commitDesignReviewAction(args: {
  action: BrowserDesignReviewAction | null;
  target: PageStyleMutationElement;
}): void {
  flushPendingPageStyleHistory();
  const rollbackPoint = browserAnnotationSession.captureFailedMutationRollbackPoint();
  const transactionId = createTransactionId('action');
  if (!pagePreparationHistory.beginTransaction(transactionId)) {
    throw new Error('Design Review action history transaction is unavailable');
  }

  try {
    browserAnnotationSession.setDesignReviewAction({
      action: args.action,
      evidence: createBrowserAnnotationTargetEvidence(args.target),
      target: args.target,
    });
    if (!pagePreparationHistory.commitTransaction(transactionId)) {
      throw new Error('Design Review action history transaction could not be committed');
    }
  } catch (error) {
    pagePreparationHistory.cancelTransaction(transactionId);
    if (!browserAnnotationSession.rollbackFailedMutation(rollbackPoint)) {
      throw new Error('Design Review action rollback was refused', { cause: error });
    }
    throw error;
  }
}

function normalizeDeclarationPriority(priority: string): CssDeclarationPriority {
  return priority === 'important' ? 'important' : '';
}

function createDesignReviewResetBatch(
  record: BrowserDomAnnotationRecord,
  target: PageStyleMutationElement
): PageStyleMutationBatch {
  return {
    declarations: record.propertyChanges.map((change) => ({
      after: {
        priority: normalizeDeclarationPriority(change.before.priority),
        value: change.before.value,
      },
      afterPolicy: { source: 'inspector' },
      before: {
        priority: normalizeDeclarationPriority(change.after.priority),
        value: change.after.value,
      },
      beforePolicy: { source: 'inspector' },
      order: change.order,
      property: change.property as PageStyleProperty,
    })),
    target,
  };
}

function publishDesignReviewRecovery(args: {
  evidence: BrowserDomAnnotationRecord['evidence'];
  mutation: PageStyleMutationBatch;
  target: PageStyleMutationElement;
}): string[] {
  try {
    publishPageStyleAnnotation({
      changes: args.mutation.declarations,
      evidence: args.evidence,
      target: args.target,
    });
    return [];
  } catch (error) {
    return [error instanceof Error ? error.message : 'Design Review recovery evidence failed'];
  }
}

function commitDesignReviewRecovery(args: {
  evidence: BrowserDomAnnotationRecord['evidence'];
  mutation: PageStyleMutationBatch;
  target: PageStyleMutationElement;
  transactionId: string;
}): string[] {
  const failures = publishDesignReviewRecovery(args);
  try {
    const committed = pagePreparationHistory.commitTransaction(
      args.transactionId,
      null,
      createPageStyleHistoryEffect(args.mutation, {
        onRecovery: (recoveryBatch) => {
          publishDesignReviewRecovery({ ...args, mutation: recoveryBatch });
        },
        recoveryOnly: true,
      })
    );
    if (!committed) {
      failures.push('Design Review recovery history transaction could not be committed');
    }
  } catch (error) {
    failures.push(error instanceof Error ? error.message : 'Design Review recovery commit failed');
  }
  return failures;
}

function retainDesignReviewRecovery(args: {
  evidence: BrowserDomAnnotationRecord['evidence'];
  mutation: PageStyleMutationBatch;
  target: PageStyleMutationElement;
}): string[] {
  if (args.mutation.declarations.length === 0) {
    return [];
  }
  const transactionId = createTransactionId('delete-recovery');
  if (!pagePreparationHistory.beginTransaction(transactionId)) {
    return ['Design Review recovery history transaction is unavailable'];
  }
  const failures = commitDesignReviewRecovery({ ...args, transactionId });
  if (failures.length > 0) {
    pagePreparationHistory.cancelTransaction(transactionId);
  }
  return failures;
}

export function deleteDesignReviewRecord(target: PageStyleMutationElement): void {
  flushPendingPageStyleHistory();
  const record = readDesignReviewRecord(target);
  if (!record) {
    return;
  }

  const transactionId = createTransactionId('delete');
  const rollbackPoint = browserAnnotationSession.captureFailedMutationRollbackPoint();
  if (!pagePreparationHistory.beginTransaction(transactionId)) {
    throw new Error('Design Review delete history transaction is unavailable');
  }

  const resetMutation = createDesignReviewResetBatch(record, target);
  const resetResult = applyPageStyleMutationBatch(resetMutation, 'redo');
  if (!resetResult.success) {
    if (resetResult.recoveryBatch?.declarations.length) {
      const recoveryFailures = commitDesignReviewRecovery({
        evidence: record.evidence,
        mutation: resetResult.recoveryBatch,
        target,
        transactionId,
      });
      throw new Error(
        `Design Review delete failed: ${[...resetResult.failures, ...recoveryFailures].join(', ')}`
      );
    }
    pagePreparationHistory.cancelTransaction(transactionId);
    throw new Error(`Design Review delete failed: ${resetResult.failures.join(', ')}`);
  }

  try {
    browserAnnotationSession.clearDesignReview(target);
    const effect = resetMutation.declarations.length
      ? createPageStyleHistoryEffect(resetMutation)
      : null;
    if (!pagePreparationHistory.commitTransaction(transactionId, null, effect)) {
      throw new Error('Design Review delete history transaction could not be committed');
    }
  } catch (error) {
    pagePreparationHistory.cancelTransaction(transactionId);
    const failures: string[] = [];
    const styleRollback = applyPageStyleMutationBatch(resetMutation, 'undo');
    if (!styleRollback.success) {
      failures.push(...styleRollback.failures.map((failure) => `CSS compensation: ${failure}`));
    }
    if (!browserAnnotationSession.rollbackFailedMutation(rollbackPoint)) {
      failures.push('Design Review session compensation was refused');
    }
    if (!styleRollback.success) {
      failures.push(
        ...retainDesignReviewRecovery({
          evidence: record.evidence,
          mutation: capturePageStyleMutationResidual(resetMutation, 'before'),
          target,
        })
      );
    }
    if (failures.length > 0) {
      throw new Error(`Design Review delete rollback failed: ${failures.join(', ')}`, {
        cause: error,
      });
    }
    throw error;
  }
}

export function serializeDesignReviewRecord(target: Element): string {
  const record = readDesignReviewRecord(target);
  const evidence = record?.evidence ?? createBrowserAnnotationTargetEvidence(target);
  return JSON.stringify(
    {
      action: record?.designReview?.action ?? 'refine',
      comment: record?.comment ?? '',
      element: {
        path: evidence.targetPath,
        selector: evidence.targetSelector,
        tag: target.localName.toUpperCase(),
      },
      properties: record?.propertyChanges ?? [],
    },
    null,
    2
  );
}
