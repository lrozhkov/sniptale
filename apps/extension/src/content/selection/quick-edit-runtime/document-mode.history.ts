import { addEventListenerToAllWindowsDynamic } from '../../platform/frame';
import { createLogger } from '@sniptale/platform/observability/logger';
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
import {
  isIgnoredDocumentModeTarget,
  resolveDocumentModeEditRoot,
  type QuickEditDocumentModeEditTarget,
} from './document-mode.targets';

const DOCUMENT_MODE_HISTORY_KEY = 'quick-edit-document-mode';
const logger = createLogger({ namespace: 'ContentQuickEditDocumentModeHistory' });

interface DocumentModeHistoryState {
  annotationCaptures: Map<HTMLElement, QuickEditTextAnnotationCapture>;
  beforeStates: Map<string, PageDomElementState>;
  beforeStatesByRoot: Map<Element, PageDomElementState>;
  capturedRoots: Set<HTMLElement>;
  cleanupListeners: (() => void) | null;
  dirtyRoots: Set<HTMLElement>;
  failure: Error | null;
  isActive: boolean;
  pendingInputRecovery: PendingDocumentModeInputRecovery | null;
}

interface PendingDocumentModeInputRecovery {
  before: PageDomElementState;
  root: HTMLElement;
}

interface QuickEditDocumentModeHistoryTracker {
  begin: () => void;
  cancel: () => void;
  commit: () => void;
  recordPotentialEditTarget: (target: QuickEditDocumentModeEditTarget) => void;
}

interface QuickEditDocumentModeHistoryOptions {
  onCaptureFailure?: (error: Error) => boolean;
  onRecoveryFailure?: (error: Error) => void;
}

export class QuickEditDocumentModeRecoveryPendingError extends AggregateError {}

function createDocumentModeHistoryState(): DocumentModeHistoryState {
  return {
    annotationCaptures: new Map(),
    beforeStates: new Map(),
    beforeStatesByRoot: new Map(),
    capturedRoots: new Set(),
    cleanupListeners: null,
    dirtyRoots: new Set(),
    failure: null,
    isActive: false,
    pendingInputRecovery: null,
  };
}

function mergeBeforeStates(
  target: Map<string, PageDomElementState>,
  nextStates: Map<string, PageDomElementState>
): void {
  nextStates.forEach((state, locator) => {
    target.set(locator, state);
  });
}

function registerDocumentModeHistoryListeners(props: {
  onBeforeInput: (event: InputEvent) => void;
  onInput: (event: InputEvent) => void;
}): () => void {
  const cleanupBeforeInput = addEventListenerToAllWindowsDynamic<InputEvent>(
    'beforeinput',
    props.onBeforeInput,
    { capture: true }
  );
  const cleanupInput = addEventListenerToAllWindowsDynamic<InputEvent>('input', props.onInput, {
    capture: true,
  });

  return () => {
    cleanupBeforeInput();
    cleanupInput();
  };
}

function resetDocumentModeHistoryState(state: DocumentModeHistoryState): void {
  state.cleanupListeners?.();
  state.annotationCaptures.clear();
  state.beforeStates.clear();
  state.beforeStatesByRoot.clear();
  state.capturedRoots.clear();
  state.dirtyRoots.clear();
  state.cleanupListeners = null;
  state.failure = null;
  state.isActive = false;
  state.pendingInputRecovery = null;
}

function resolveConnectedDirtyRoots(state: DocumentModeHistoryState): HTMLElement[] {
  const roots: HTMLElement[] = [];

  state.dirtyRoots.forEach((root) => {
    if (root.isConnected && !isIgnoredDocumentModeTarget(root)) {
      roots.push(root);
      return;
    }

    logger.warn('Skipped disconnected document-mode edit root during history commit', {
      tagName: root.tagName,
    });
  });

  return roots;
}

export function createQuickEditDocumentModeHistoryTracker(
  options: QuickEditDocumentModeHistoryOptions = {}
): QuickEditDocumentModeHistoryTracker {
  const state = createDocumentModeHistoryState();

  return {
    begin: () => beginDocumentModeHistory(state, options),
    cancel: () => cancelDocumentModeHistory(state),
    commit: () => commitDocumentModeHistory(state),
    recordPotentialEditTarget: (target) => recordPotentialEditTarget(state, target),
  };
}

function captureBeforeState(state: DocumentModeHistoryState, root: HTMLElement): void {
  if (state.capturedRoots.has(root)) {
    return;
  }

  const before = captureDomElementState(root);
  state.pendingInputRecovery = { before, root };
  mergeBeforeStates(state.beforeStates, captureDomStateMap([root]));
  state.beforeStatesByRoot.set(root, before);
  state.annotationCaptures.set(root, captureQuickEditTextAnnotation(root));
  state.capturedRoots.add(root);
  state.pendingInputRecovery = null;
}

function recordPotentialEditTarget(
  state: DocumentModeHistoryState,
  target: QuickEditDocumentModeEditTarget
): void {
  if (!state.isActive) {
    return;
  }

  const root = resolveDocumentModeEditRoot(target);
  if (root) {
    captureBeforeState(state, root);
  }
}

function markDirtyTarget(
  state: DocumentModeHistoryState,
  target: QuickEditDocumentModeEditTarget
): void {
  const root = resolveDocumentModeEditRoot(target);
  if (!state.isActive || !root) {
    return;
  }

  captureBeforeState(state, root);
  state.dirtyRoots.add(root);
}

function beginDocumentModeHistory(
  state: DocumentModeHistoryState,
  options: QuickEditDocumentModeHistoryOptions
): void {
  if (state.isActive) {
    return;
  }

  if (!pagePreparationHistory.beginTransaction(DOCUMENT_MODE_HISTORY_KEY)) {
    throw new Error('Quick Edit document-mode history transaction is unavailable');
  }
  state.isActive = true;
  try {
    state.cleanupListeners = registerDocumentModeHistoryListeners({
      onBeforeInput: (event) => {
        if (state.failure) {
          event.preventDefault();
          return;
        }
        runDocumentModeHistoryStep(state, options, event, () => {
          recordPotentialEditTarget(state, event.target);
        });
      },
      onInput: (event) => {
        if (state.failure) {
          recoverFailedNonCancelableInput(state, options, event.target);
          return;
        }
        runDocumentModeHistoryStep(state, options, null, () => {
          markDirtyTarget(state, event.target);
        });
      },
    });
  } catch (error) {
    cancelDocumentModeHistory(state);
    throw error;
  }
}

function runDocumentModeHistoryStep(
  state: DocumentModeHistoryState,
  options: QuickEditDocumentModeHistoryOptions,
  beforeInputEvent: InputEvent | null,
  operation: () => void
): void {
  try {
    operation();
  } catch (error) {
    const failure = new Error('Failed to capture document-mode history state', { cause: error });
    beforeInputEvent?.preventDefault();
    state.failure = failure;
    try {
      pagePreparationHistory.cancelTransaction(DOCUMENT_MODE_HISTORY_KEY);
    } catch (cancelError) {
      logger.error('Failed to cancel document-mode history after capture failure', cancelError);
    }
    logger.error('Failed to capture document-mode history state', error);
    if (
      beforeInputEvent !== null &&
      !beforeInputEvent.cancelable &&
      state.pendingInputRecovery !== null
    ) {
      return;
    }
    finishDocumentModeCaptureFailure(state, options, failure);
  }
}

function finishDocumentModeCaptureFailure(
  state: DocumentModeHistoryState,
  options: QuickEditDocumentModeHistoryOptions,
  failure: Error
): void {
  let handled = options.onCaptureFailure === undefined;
  try {
    handled = options.onCaptureFailure?.(failure) ?? true;
  } catch (handlerError) {
    logger.error('Failed to handle document-mode capture failure', handlerError);
  }
  if (handled) {
    resetDocumentModeHistoryState(state);
  }
}

function recoverFailedNonCancelableInput(
  state: DocumentModeHistoryState,
  options: QuickEditDocumentModeHistoryOptions,
  target: EventTarget | null
): void {
  const pending = state.pendingInputRecovery;
  const failure = state.failure;
  if (!pending || !failure || resolveDocumentModeEditRoot(target) !== pending.root) {
    return;
  }

  const recoveryFailure = tryRecoverPendingInput(state, failure);
  if (!recoveryFailure) {
    finishDocumentModeCaptureFailure(state, options, failure);
    return;
  }

  state.failure = recoveryFailure;
  logger.error('Failed to recover non-cancelable document-mode input', recoveryFailure);
  try {
    options.onRecoveryFailure?.(recoveryFailure);
  } catch (handlerError) {
    logger.error('Failed to handle non-cancelable document-mode recovery failure', handlerError);
  }
}

function tryRecoverPendingInput(
  state: DocumentModeHistoryState,
  precedingFailure: Error
): QuickEditDocumentModeRecoveryPendingError | null {
  const pending = state.pendingInputRecovery;
  if (!pending) {
    return null;
  }

  try {
    const batch = createBatchWithCapturedBefore(
      [pending.root],
      new Map([[pending.root, pending.before]])
    );
    const result = applyDomMutationBatch(batch, 'undo');
    if (!result.success) {
      throw new Error(`Document-mode input recovery failed: ${result.missingLocators.join(', ')}`);
    }
    state.pendingInputRecovery = null;
    return null;
  } catch (error) {
    return new QuickEditDocumentModeRecoveryPendingError(
      [
        precedingFailure,
        error instanceof Error ? error : new Error('Document-mode input recovery failed'),
      ],
      'Document-mode capture and input recovery failed'
    );
  }
}

function cancelDocumentModeHistory(state: DocumentModeHistoryState): void {
  if (!state.isActive) {
    return;
  }

  try {
    pagePreparationHistory.cancelTransaction(DOCUMENT_MODE_HISTORY_KEY);
  } finally {
    resetDocumentModeHistoryState(state);
  }
}

function commitDocumentModeHistory(state: DocumentModeHistoryState): void {
  if (!state.isActive) {
    return;
  }

  if (state.failure) {
    const failure = state.failure;
    if (state.pendingInputRecovery) {
      const recoveryFailure = tryRecoverPendingInput(state, failure);
      if (recoveryFailure) {
        state.failure = recoveryFailure;
        throw recoveryFailure;
      }
    }
    resetDocumentModeHistoryState(state);
    if (failure instanceof QuickEditDocumentModeRecoveryPendingError) {
      throw new Error('Document-mode input recovery succeeded only after an earlier failure', {
        cause: failure,
      });
    }
    throw failure;
  }

  const changedRoots = resolveConnectedDirtyRoots(state);
  if (changedRoots.length === 0) {
    cancelDocumentModeHistory(state);
    return;
  }

  try {
    commitChangedRoots(state, changedRoots);
  } catch (error) {
    logger.error('Failed to commit document-mode history transaction', error);
    if (state.isActive) {
      try {
        cancelDocumentModeHistory(state);
      } catch (cancelError) {
        throw new AggregateError(
          [error, cancelError],
          'Quick Edit document-mode commit and cancellation failed',
          { cause: cancelError }
        );
      }
    }
    throw error;
  }
}

function commitChangedRoots(state: DocumentModeHistoryState, changedRoots: HTMLElement[]): void {
  const batch = createBatchWithCapturedBefore(
    changedRoots,
    state.beforeStatesByRoot,
    state.beforeStates
  );
  const rollbackPoint = browserAnnotationSession.captureFailedMutationRollbackPoint();
  try {
    publishCommittedQuickEditTextChanges(
      changedRoots.flatMap((target) => {
        const capture = state.annotationCaptures.get(target);
        return capture ? [{ after: target.textContent ?? '', capture }] : [];
      })
    );
    if (!pagePreparationHistory.commitTransaction(DOCUMENT_MODE_HISTORY_KEY, batch)) {
      throw new Error('Quick Edit document-mode history transaction was lost before commit');
    }
    resetDocumentModeHistoryState(state);
  } catch (error) {
    throwDocumentModeCommitFailure(
      error,
      rollbackFailedDocumentModeCommit(state, batch, rollbackPoint)
    );
  }
}

function createBatchWithCapturedBefore(
  roots: HTMLElement[],
  beforeStatesByRoot: Map<Element, PageDomElementState>,
  beforeStates = new Map<string, PageDomElementState>()
): PageDomMutationBatch {
  const capturedBatch = createDomMutationBatch(roots, beforeStates);
  return {
    patches: capturedBatch.patches.map((patch) => {
      const capturedBefore = beforeStatesByRoot.get(patch.target) ?? patch.before;
      const locatorId = patch.before.attributes['data-sniptale-id'];
      return {
        ...patch,
        before: {
          ...capturedBefore,
          attributes: {
            ...capturedBefore.attributes,
            ...(locatorId ? { 'data-sniptale-id': locatorId } : {}),
          },
        },
      };
    }),
  };
}

function rollbackFailedDocumentModeCommit(
  state: DocumentModeHistoryState,
  batch: PageDomMutationBatch,
  rollbackPoint: ReturnType<typeof browserAnnotationSession.captureFailedMutationRollbackPoint>
): Error[] {
  const failures: Error[] = [];
  try {
    pagePreparationHistory.cancelTransaction(DOCUMENT_MODE_HISTORY_KEY);
  } catch (error) {
    failures.push(new Error('Document-mode transaction cancellation failed', { cause: error }));
  }
  try {
    const domRollback = applyDomMutationBatch(batch, 'undo');
    if (!domRollback.success) {
      failures.push(
        new Error(`Document-mode DOM rollback failed: ${domRollback.missingLocators.join(', ')}`)
      );
    }
  } catch (error) {
    failures.push(new Error('Document-mode DOM rollback threw', { cause: error }));
  }
  try {
    if (!browserAnnotationSession.rollbackFailedMutation(rollbackPoint)) {
      failures.push(new Error('Document-mode annotation-session rollback was refused'));
    }
  } catch (error) {
    failures.push(new Error('Document-mode annotation-session rollback threw', { cause: error }));
  } finally {
    resetDocumentModeHistoryState(state);
  }
  return failures;
}

function throwDocumentModeCommitFailure(error: unknown, rollbackFailures: Error[]): never {
  if (rollbackFailures.length > 0) {
    throw new AggregateError(
      [
        error instanceof Error ? error : new Error('Document-mode commit failed'),
        ...rollbackFailures,
      ],
      'Quick Edit document-mode commit and compensation failed'
    );
  }
  throw error;
}
