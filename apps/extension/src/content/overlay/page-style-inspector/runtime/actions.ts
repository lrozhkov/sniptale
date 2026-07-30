import type { PageStylePatch } from '@sniptale/runtime-contracts/page-style';
import {
  createBrowserAnnotationTargetEvidence,
  type BrowserAnnotationTargetEvidence,
} from '../../../parser/page-preparation/annotations';
import { pagePreparationHistory } from '../../../parser/page-preparation/history';
import {
  applyPreparedPageStylePatchMutation,
  preparePageStylePatchMutation,
  type PageStylePatchApplyResult,
} from '../../../selection/quick-edit-runtime/page-style/apply';
import { publishPageStyleAnnotation } from '../../../selection/quick-edit-runtime/page-style/annotation';
import {
  applyPageStyleMutationBatch,
  capturePageStyleMutationResidual,
  createPageStyleHistoryEffect,
  mergePageStyleMutationBatches,
} from '../../../selection/quick-edit-runtime/page-style/mutation';
import type {
  PageStyleMutationBatch,
  PageStyleMutationElement,
} from '../../../selection/quick-edit-runtime/page-style/types';

interface PendingPageStyleHistory {
  element: PageStyleMutationElement;
  evidence: BrowserAnnotationTargetEvidence;
  mutation: PageStyleMutationBatch | null;
  recoveryOnly: boolean;
  timer: number | null;
  transactionId: string;
}

let inspectorMutationSequence = 0;
let pendingHistoryCommit: PendingPageStyleHistory | null = null;
const PAGE_STYLE_HISTORY_IDLE_COMMIT_MS = 500;

function createInspectorMutationId(prefix: string): string {
  inspectorMutationSequence += 1;
  return `${prefix}:${Date.now()}:${inspectorMutationSequence}`;
}

function clearPendingHistoryTimer(): void {
  if (!pendingHistoryCommit?.timer) return;
  window.clearTimeout(pendingHistoryCommit.timer);
  pendingHistoryCommit.timer = null;
}

export function flushPendingPageStyleHistory(): void {
  if (!pendingHistoryCommit) return;

  clearPendingHistoryTimer();
  const pending = pendingHistoryCommit;
  try {
    pagePreparationHistory.commitTransaction(
      pending.transactionId,
      null,
      pending.mutation
        ? createPageStyleHistoryEffect(pending.mutation, {
            onRecovery: (recoveryBatch) =>
              tryPublishPageStyleRecovery(recoveryBatch, pending.evidence, pending.element),
            recoveryOnly: pending.recoveryOnly,
          })
        : null
    );
    pendingHistoryCommit = null;
  } catch (error) {
    pagePreparationHistory.cancelTransaction(pending.transactionId);
    pendingHistoryCommit = null;
    throw error;
  }
}

function cancelPendingPageStyleHistory(): void {
  if (!pendingHistoryCommit) return;
  clearPendingHistoryTimer();
  pagePreparationHistory.cancelTransaction(pendingHistoryCommit.transactionId);
  pendingHistoryCommit = null;
}

function ensurePendingPageStyleHistory(
  element: PageStyleMutationElement,
  evidence: BrowserAnnotationTargetEvidence
): PendingPageStyleHistory {
  if (pendingHistoryCommit && pendingHistoryCommit.element !== element) {
    flushPendingPageStyleHistory();
  }

  if (!pendingHistoryCommit) {
    pendingHistoryCommit = {
      element,
      evidence,
      mutation: null,
      recoveryOnly: false,
      timer: null,
      transactionId: createInspectorMutationId('page-style-inspector'),
    };
    if (!pagePreparationHistory.beginTransaction(pendingHistoryCommit.transactionId)) {
      pendingHistoryCommit = null;
      throw new Error('Page style history transaction is unavailable');
    }
  }

  return pendingHistoryCommit;
}

function tryPublishPageStyleRecovery(
  mutation: PageStyleMutationBatch,
  evidence: BrowserAnnotationTargetEvidence,
  target: PageStyleMutationElement
): void {
  try {
    publishPageStyleAnnotation({ changes: mutation.declarations, evidence, target });
  } catch {
    // Hostile residuals remain recovery-only and are never trusted as annotation evidence.
  }
}

function retainPageStyleRecovery(args: {
  element: PageStyleMutationElement;
  evidence: BrowserAnnotationTargetEvidence;
  mutation: PageStyleMutationBatch;
  pending: PendingPageStyleHistory;
}): void {
  if (args.mutation.declarations.length === 0) {
    return;
  }
  args.pending.mutation = mergePageStyleMutationBatches(args.pending.mutation, args.mutation);
  args.pending.recoveryOnly = true;
  tryPublishPageStyleRecovery(args.mutation, args.evidence, args.element);
}

function throwFailedPageStyleMutation(args: {
  element: PageStyleMutationElement;
  evidence: BrowserAnnotationTargetEvidence;
  pending: PendingPageStyleHistory;
  result: PageStylePatchApplyResult;
}): never {
  if (args.result.recoveryMutation) {
    retainPageStyleRecovery({
      element: args.element,
      evidence: args.evidence,
      mutation: args.result.recoveryMutation,
      pending: args.pending,
    });
  }
  throw new Error(
    args.result.diagnostics.map((diagnostic) => diagnostic.message).join('; ') ||
      'Page style mutation failed'
  );
}

function publishAppliedPageStyleMutation(args: {
  element: PageStyleMutationElement;
  evidence: BrowserAnnotationTargetEvidence;
  mutation: PageStyleMutationBatch;
  pending: PendingPageStyleHistory;
}): void {
  const nextMutation = mergePageStyleMutationBatches(args.pending.mutation, args.mutation);
  try {
    publishPageStyleAnnotation({
      changes: args.mutation.declarations,
      evidence: args.evidence,
      target: args.element,
    });
  } catch (error) {
    const rollback = applyPageStyleMutationBatch(args.mutation, 'undo');
    if (!rollback.success) {
      retainPageStyleRecovery({
        element: args.element,
        evidence: args.evidence,
        mutation: capturePageStyleMutationResidual(args.mutation, 'before'),
        pending: args.pending,
      });
      throw new Error(
        `Page style evidence failed and rollback failed: ${rollback.failures.join(', ')}`,
        { cause: error }
      );
    }
    throw error;
  }
  args.pending.mutation = nextMutation;
}

function schedulePendingPageStyleHistoryCommit(): void {
  if (!pendingHistoryCommit) return;
  clearPendingHistoryTimer();
  pendingHistoryCommit.timer = window.setTimeout(
    flushPendingPageStyleHistory,
    PAGE_STYLE_HISTORY_IDLE_COMMIT_MS
  );
}

export async function applyPageStylePatchWithHistory(args: {
  element: PageStyleMutationElement;
  patch: PageStylePatch;
}): Promise<PageStylePatchApplyResult> {
  const evidence = createBrowserAnnotationTargetEvidence(args.element);
  const operationId = createInspectorMutationId('inspector-preview');

  try {
    const prepared = preparePageStylePatchMutation({ ...args, operationId });
    const pending = ensurePendingPageStyleHistory(args.element, evidence);
    const result = applyPreparedPageStylePatchMutation(prepared);
    if (!result.applied) {
      throwFailedPageStyleMutation({ element: args.element, evidence, pending, result });
    }
    if (!result.mutation) {
      throw new Error('Page style mutation returned no applied delta');
    }

    publishAppliedPageStyleMutation({
      element: args.element,
      evidence,
      mutation: result.mutation,
      pending,
    });
    schedulePendingPageStyleHistoryCommit();
    return result;
  } catch (error) {
    if (!pendingHistoryCommit?.mutation) {
      cancelPendingPageStyleHistory();
    } else {
      schedulePendingPageStyleHistoryCommit();
    }
    throw error;
  }
}
