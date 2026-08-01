// policyStateIds: [] - this document-local promise only coalesces one teardown and grants no authority.
import { browserAnnotationSession } from '../../../parser/page-preparation/annotations';
import { pagePreparationHistory } from '../../../parser/page-preparation/history';
import { isPageStyleRestorationElement } from '../../../selection/design-review/style/element';
import {
  applyPageStyleMutationBatch,
  capturePageStyleMutationResidual,
  mergePageStyleMutationBatches,
} from '../../../selection/design-review/style/mutation';
import type { PageStyleMutationBatch } from '../../../selection/design-review/style/types';
import { finalizeDesignReviewCommentDraft } from '../session/comment-draft-finalization';
import { flushPendingPageStyleHistory } from './actions';
import { createDesignReviewResetBatch, retainDesignReviewRecovery } from './record';

let pendingTeardown: Promise<void> | null = null;

interface AppliedDesignReviewBatch {
  batch: PageStyleMutationBatch;
  evidence: Parameters<typeof retainDesignReviewRecovery>[0]['evidence'];
}

function recoverPreviewEndpoint(args: AppliedDesignReviewBatch): string[] {
  const recoveryResult = applyPageStyleMutationBatch(args.batch, 'undo');
  if (recoveryResult.success) {
    return [];
  }

  const factualRecovery = mergePageStyleMutationBatches(
    args.batch,
    capturePageStyleMutationResidual(args.batch, 'after')
  );
  const retentionFailures = retainDesignReviewRecovery({
    evidence: args.evidence,
    mutation: factualRecovery,
    target: factualRecovery.target,
  });
  return [
    ...recoveryResult.failures.map((failure) => `current-recovery:${failure}`),
    ...retentionFailures.map((failure) => `recovery-retention:${failure}`),
  ];
}

function compensateAppliedBatches(appliedBatches: AppliedDesignReviewBatch[]): string[] {
  const compensationBatches = [...appliedBatches];
  compensationBatches.reverse();
  return compensationBatches.flatMap((applied) => {
    const result = applyPageStyleMutationBatch(applied.batch, 'undo');
    if (result.success) {
      return [];
    }

    const factualCompensation = mergePageStyleMutationBatches(
      applied.batch,
      capturePageStyleMutationResidual(applied.batch, 'after')
    );
    return [
      ...result.failures.map((failure) => `compensation:${failure}`),
      ...recoverPreviewEndpoint({
        batch: factualCompensation,
        evidence: applied.evidence,
      }).map((failure) => `compensation:${failure}`),
    ];
  });
}

function restoreDesignReviewStyles(): void {
  flushPendingPageStyleHistory();
  const appliedBatches: AppliedDesignReviewBatch[] = [];

  try {
    for (const record of browserAnnotationSession.captureSnapshot().domRecords) {
      if (record.propertyChanges.length === 0) continue;
      const target = browserAnnotationSession.getLiveTarget(record.annotationId);
      if (!target || !isPageStyleRestorationElement(target)) {
        throw new Error(
          `Design Review target ${record.annotationId} is unavailable for restoration`
        );
      }

      const batch = createDesignReviewResetBatch(record, target);
      const result = applyPageStyleMutationBatch(batch, 'redo');
      if (!result.success) {
        const recoveryFailures = result.recoveryBatch?.declarations.length
          ? recoverPreviewEndpoint({
              batch: result.recoveryBatch,
              evidence: record.evidence,
            })
          : [];
        throw new Error(
          `Design Review session restoration failed: ${[
            ...result.failures,
            ...recoveryFailures,
          ].join(', ')}`
        );
      }
      appliedBatches.push({ batch, evidence: record.evidence });
    }
  } catch (error) {
    const compensationFailures = compensateAppliedBatches(appliedBatches);
    const restorationFailure =
      error instanceof Error ? error.message : 'Design Review session restoration failed';
    throw new Error([restorationFailure, ...compensationFailures].join(', '), { cause: error });
  }
}

function waitForUiTransition(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

/** Restores Design Review DOM mutations, then clears its session after the UI has closed drafts. */
export function teardownDesignReviewSessionAfterUiTransition(
  transitionUi: () => void
): Promise<void> {
  if (!pendingTeardown) {
    pendingTeardown = Promise.resolve()
      .then(() => {
        finalizeDesignReviewCommentDraft();
        restoreDesignReviewStyles();
        transitionUi();
      })
      .then(waitForUiTransition)
      .then(() => {
        pagePreparationHistory.clear();
        browserAnnotationSession.resetForDocument();
      })
      .finally(() => {
        pendingTeardown = null;
      });
  }

  return pendingTeardown;
}
