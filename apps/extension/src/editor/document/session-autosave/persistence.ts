import {
  createImageWorkspaceCommit,
  type CommitImageWorkspaceResult,
  StaleImageWorkspaceError,
} from '../../../composition/persistence/image-aggregates';
import { createAutosaveCoordinator } from '@sniptale/platform/data/autosave';
import type { EditorDocument } from '../../../features/editor/document/types';
import { createLogger } from '@sniptale/platform/observability/logger';
import { createUserFacingErrorMessage } from '../../../platform/i18n/user-facing-error';
import { useEditorStore } from '../../state/useEditorStore';
import { scheduleImagePresentation } from './presentation';
import { EDITOR_AUTOSAVE_POLICY } from '../../../features/autosave/policy';
import {
  checkpointEditForAutosave,
  settleAutosaveCheckpointEdit,
  cancelPendingAutosaveRequest,
  interruptImagePresentation,
  type EditorCheckpointExit,
  type EditorSessionAutosaveState,
  type EditorAutosaveCapture,
  type EditorSaveSnapshot,
} from './state';

const logger = createLogger({ namespace: 'EditorSession' });

export function setEditorSaveState(state: 'idle' | 'saving' | 'saved' | 'error'): void {
  useEditorStore.getState().setSaveState(state);
}

function setEditorSaveErrorMessage(message: string | null): void {
  useEditorStore.getState().setSaveErrorMessage(message);
}

function captureDocumentForSave(
  state: EditorSessionAutosaveState,
  getDocument: () => EditorDocument
): Pick<EditorSaveSnapshot, 'document' | 'history'> {
  const document = getDocument();
  const history = state.prepareHistory?.(document, 'explicit')?.();
  if (history === null) throw new Error('Editor history is still loading.');
  return { document, ...(history ? { history } : {}) };
}

/** Captures Save As without publishing to the source; the token protects later UI adoption. */
export function captureEditorSaveSnapshot(
  state: EditorSessionAutosaveState,
  getDocument: () => EditorDocument
): EditorSaveSnapshot {
  if (!state.activeContext || state.hydration) throw new Error('Editor document is still loading.');
  const snapshot = captureDocumentForSave(state, getDocument);
  const { contextGeneration, hydrationGeneration, autosaveRevision, interactionRevision } = state;
  return {
    ...snapshot,
    isCurrent: () =>
      state.contextGeneration === contextGeneration &&
      state.hydrationGeneration === hydrationGeneration &&
      state.autosaveRevision === autosaveRevision &&
      state.interactionRevision === interactionRevision &&
      !state.interactionActive &&
      !state.pendingCompletionActive &&
      !state.hydration,
  };
}

function adoptWorkspaceAcknowledgement(
  state: EditorSessionAutosaveState,
  capture: EditorAutosaveCapture,
  result: CommitImageWorkspaceResult
): boolean {
  if (!isSameContext(state, capture) || !state.activeContext) return false;
  if (state.activeContext.durableRevision > result.revision) return false;
  state.activeContext.durableRevision = result.revision;
  state.activeContext.sourceGeneration = result.sourceGeneration ?? null;
  state.activeContext.requireExistingRoot = true;
  state.documentAssetsByRuntimeUrl = result.documentAssetsByRuntimeUrl;
  if (result.historyAssetsByValue) state.historyAssetsByValue = result.historyAssetsByValue;
  // A later insertion can publish a definition while this older document awaits its ACK.
  state.documentAssetsByVectorDefinitionId = new Map([
    ...result.documentAssetsByVectorDefinitionId,
    ...state.documentAssetsByVectorDefinitionId,
  ]);
  return true;
}

async function persistEditorSessionDocument(
  args: EditorAutosaveCapture & {
    state: EditorSessionAutosaveState;
  }
): Promise<void> {
  const edit = checkpointEditForAutosave(args.state);
  let writing = false;
  try {
    if (edit) await edit.acquired;
    if (!isCurrentCapture(args.state, args) || edit?.retired) return;
    if (edit) {
      edit.writes++;
      writing = true;
    }
    let result: CommitImageWorkspaceResult | undefined;
    const unfinished = args.state.pendingCommit;
    if (unfinished && isCurrentCapture(args.state, unfinished.capture)) {
      const acknowledged = await unfinished.commit();
      if (edit) edit.committed = true;
      if (args.state.pendingCommit === unfinished) args.state.pendingCommit = null;
      if (!isCurrentCapture(args.state, args)) return;
      if (
        unfinished.capture.revision === args.revision &&
        unfinished.capture.document === args.document
      )
        result = acknowledged;
      else {
        if (!adoptWorkspaceAcknowledgement(args.state, unfinished.capture, acknowledged)) return;
        args.context = args.state.activeContext ?? args.context;
      }
    } else if (unfinished) args.state.pendingCommit = null;
    if (!result) {
      if (!isCurrentCapture(args.state, args)) return;
      const { state: _state, ...capture } = args;
      const publication = {
        capture,
        commit: createImageWorkspaceCommit({
          aggregateId: args.context.aggregateId,
          ...(args.context.capturedAt === undefined
            ? {}
            : { captureTime: args.context.capturedAt }),
          document: args.document,
          ...(args.history ? { history: args.history } : {}),
          reusableHistoryAssetsByValue: args.state.historyAssetsByValue,
          expectedRevision: args.context.durableRevision,
          expectedGeneration: args.context.sourceGeneration ?? null,
          ...(args.context.requireExistingRoot ? { requireExistingRoot: true } : {}),
          sourceUrl: args.context.sourceUrl,
          sourceTitle: args.document.displayName ?? args.context.sourceTitle,
          reusableAssetsByRuntimeUrl: args.state.documentAssetsByRuntimeUrl,
          reusableAssetsByVectorDefinitionId: args.state.documentAssetsByVectorDefinitionId,
        }),
      };
      args.state.pendingCommit = publication;
      result = await publication.commit();
      if (args.state.pendingCommit === publication) args.state.pendingCommit = null;
    }

    if (edit) edit.committed = true;
    if (!adoptWorkspaceAcknowledgement(args.state, args, result)) return;
    args.context = args.state.activeContext ?? args.context;
    if (!isCurrentCapture(args.state, args)) return;
    args.state.lastWriteError = null;
    args.state.presentationRetryAttempt = 0;

    if (
      args.state.activeContext?.aggregateId === args.context.aggregateId &&
      args.revision === args.state.autosaveRevision &&
      !args.state.pendingCompletionActive
    ) {
      args.state.lastCheckpointReceipt = result.checkpointReceipt
        ? { ...result.checkpointReceipt }
        : null;
      args.state.hasUnsavedChanges = false;
      setEditorSaveErrorMessage(null);
      setEditorSaveState('saved');
    }
    scheduleImagePresentation(args.context, result.revision, args.revision, args.state);
  } catch (error) {
    if (!isCurrentCapture(args.state, args)) return;
    args.state.lastWriteError = error;
    logger.error('Failed to persist draft', error);

    setEditorSaveErrorMessage(
      createUserFacingErrorMessage({
        cause: error,
        detail: 'storage',
        summaryKey: 'common.errors.saveFailed',
      })
    );
    setEditorSaveState('error');
    throw error;
  } finally {
    if (edit && writing) edit.writes--;
    settleAutosaveCheckpointEdit(args.state, edit);
  }
}

function isCurrentCapture(
  state: EditorSessionAutosaveState,
  capture: EditorAutosaveCapture
): boolean {
  return isSameContext(state, capture) && state.hydrationGeneration === capture.hydrationGeneration;
}

function isSameContext(state: EditorSessionAutosaveState, capture: EditorAutosaveCapture): boolean {
  return (
    state.contextGeneration === capture.contextGeneration &&
    state.activeContext?.aggregateId === capture.context.aggregateId &&
    (state.activeContext?.sourceGeneration ?? null) === (capture.context.sourceGeneration ?? null)
  );
}

function getAutosaveCoordinator(state: EditorSessionAutosaveState) {
  if (state.coordinator) return state.coordinator;
  state.coordinator = createAutosaveCoordinator<'document', EditorAutosaveCapture | null>({
    now: () => Date.now(),
    schedule: (callback, delay) => {
      const timer = window.setTimeout(callback, delay);
      return () => window.clearTimeout(timer);
    },
    capture: () => {
      if (!state.activeContext || !state.pendingDocument || !state.enabled || state.hydration)
        return null;
      const history = state.pendingHistoryCapture?.();
      if (history === null) return null;
      const captured = {
        context: state.activeContext,
        contextGeneration: state.contextGeneration,
        hydrationGeneration: state.hydrationGeneration,
        document: state.pendingDocument,
        ...(history ? { history } : {}),
        revision: state.autosaveRevision,
      };
      state.pendingDocument = null;
      state.pendingHistoryCapture = undefined;
      return captured;
    },
    commit: async (capture) => {
      if (!capture || !isCurrentCapture(state, capture)) return;
      setEditorSaveState('saving');
      try {
        await persistEditorSessionDocument({ ...capture, state });
      } catch (error) {
        if (!isCurrentCapture(state, capture)) return;
        if (capture.revision === state.autosaveRevision) {
          state.pendingDocument = capture.document;
          const history = capture.history;
          state.pendingHistoryCapture = history ? () => history : undefined;
        }
        throw error;
      }
    },
    classifyFailure: (error) => (error instanceof StaleImageWorkspaceError ? 'stop' : 'retry'),
  });
  return state.coordinator;
}

export function queuePendingAutosave(
  state: EditorSessionAutosaveState,
  document: EditorDocument
): void {
  if (!state.activeContext || state.hydration) return;
  state.autosaveRevision += 1;
  interruptImagePresentation(state);
  state.hasUnsavedChanges = true;
  if (!state.enabled) return;

  state.pendingDocument = document;
  state.pendingHistoryCapture = state.prepareHistory?.(document, 'background');
  setEditorSaveErrorMessage(null);
  setEditorSaveState('idle');
  schedulePendingAutosaveWrite(state);
}

export function schedulePendingAutosaveWrite(state: EditorSessionAutosaveState): void {
  if (!state.pendingDocument || !state.enabled || state.hydration) return;
  getAutosaveCoordinator(state).request('document', EDITOR_AUTOSAVE_POLICY);
}

type AutosaveGeneration = Pick<
  EditorSessionAutosaveState,
  'contextGeneration' | 'hydrationGeneration'
>;

function requireAutosaveGeneration(
  state: EditorSessionAutosaveState,
  generation: AutosaveGeneration,
  cause?: unknown
): void {
  if (
    state.contextGeneration !== generation.contextGeneration ||
    state.hydrationGeneration !== generation.hydrationGeneration
  ) {
    throw new Error('Editor document changed while waiting to save.', { cause });
  }
}

async function flushAutosaveBarrier(
  state: EditorSessionAutosaveState,
  generation: AutosaveGeneration,
  previousError: unknown
): Promise<boolean> {
  const interactionRevision = state.interactionRevision;
  const documentRevision = state.autosaveRevision;
  const coordinator = getAutosaveCoordinator(state);
  try {
    await coordinator.flushCaptured(['document']);
  } catch (error) {
    requireAutosaveGeneration(state, generation, error);
    if (!state.enabled) return false;
    if (
      state.lastWriteError &&
      (state.lastWriteError !== previousError || state.lastWriteError === error)
    )
      throw state.lastWriteError;
    if (state.autosaveRevision !== documentRevision) {
      await coordinator
        .runOrdered(async () => undefined)
        .catch((cause: unknown) => {
          requireAutosaveGeneration(state, generation, cause);
          throw cause;
        });
    } else if (state.interactionRevision !== interactionRevision) {
      return false;
    } else throw error;
  }
  return true;
}

export async function flushPendingAutosave(
  state: EditorSessionAutosaveState,
  getDocument: () => EditorDocument
): Promise<void> {
  if (!state.activeContext || !state.enabled || state.hydration) {
    return;
  }

  const generation = {
    contextGeneration: state.contextGeneration,
    hydrationGeneration: state.hydrationGeneration,
  };
  const previousError = state.lastWriteError;
  do {
    if (state.interactionActive) {
      await new Promise<void>((resolve) => state.interactionWaiters.push(resolve));
    }
    requireAutosaveGeneration(state, generation);
    if (!state.enabled || state.hydration) return;
    if (state.lastWriteError instanceof StaleImageWorkspaceError) throw state.lastWriteError;
    if (state.lastWriteError && state.lastWriteError !== previousError) throw state.lastWriteError;
    if (!state.pendingDocument) {
      // A capture is absent while its ordered write is active. Join that ACK before
      // deciding whether a newer dirty document still needs to be captured.
      await getAutosaveCoordinator(state).runOrdered(async () => undefined);
      requireAutosaveGeneration(state, generation);
      if (!state.enabled || state.hydration) return;
      if (state.lastWriteError && state.lastWriteError !== previousError)
        throw state.lastWriteError;
      if (!state.hasUnsavedChanges && !state.interactionActive) return;
      if (state.interactionActive) continue;
      if (!state.pendingDocument) queuePendingAutosave(state, getDocument());
    }
    if (!(await flushAutosaveBarrier(state, generation, previousError))) continue;
    requireAutosaveGeneration(state, generation);
    if (state.lastWriteError) throw state.lastWriteError;
  } while (
    state.contextGeneration === generation.contextGeneration &&
    state.hydrationGeneration === generation.hydrationGeneration &&
    state.enabled &&
    (state.pendingDocument !== null || state.hasUnsavedChanges || state.interactionActive)
  );
}

export async function persistAutosaveSnapshot(
  state: EditorSessionAutosaveState,
  getDocument: () => EditorDocument
): Promise<void> {
  if (!state.activeContext || !state.enabled || state.hydration) {
    return;
  }

  await saveEditorSessionSnapshot(state, getDocument);
}

export async function saveEditorSessionSnapshot(
  state: EditorSessionAutosaveState,
  getDocument: () => EditorDocument,
  hydration?: { isCurrent: () => boolean }
): Promise<void> {
  if (!state.activeContext) return;
  if (hydration ? state.hydration !== hydration || !hydration.isCurrent() : state.hydration)
    throw new Error('Editor document is still loading.');

  const { document, history } = captureDocumentForSave(state, getDocument);
  cancelPendingAutosaveRequest(state);
  state.pendingDocument = null;
  state.pendingHistoryCapture = undefined;
  const captured: EditorAutosaveCapture = {
    context: state.activeContext,
    contextGeneration: state.contextGeneration,
    hydrationGeneration: state.hydrationGeneration,
    document,
    ...(history ? { history } : {}),
    revision: ++state.autosaveRevision,
  };
  interruptImagePresentation(state);
  state.hasUnsavedChanges = true;
  setEditorSaveErrorMessage(null);
  setEditorSaveState('saving');
  const coordinator = getAutosaveCoordinator(state);
  await coordinator.runOrdered(async () => {
    if (!isCurrentCapture(state, captured) || !state.activeContext)
      throw new Error('Editor document changed while waiting to save.');
    if (hydration && (state.hydration !== hydration || !hydration.isCurrent()))
      throw new Error('Editor document changed while waiting to save.');
    try {
      await persistEditorSessionDocument({ ...captured, context: state.activeContext, state });
    } catch (error) {
      if (!isCurrentCapture(state, captured))
        throw new Error('Editor document changed while waiting to save.', { cause: error });
      if (error instanceof StaleImageWorkspaceError) coordinator.suspend(error);
      throw error;
    }
    if (!isCurrentCapture(state, captured) || (hydration && !hydration.isCurrent()))
      throw new Error('Editor document changed while waiting to save.');
  });
}

/** Join the existing local save barrier and guard the document across an awaited exit intent. */
export async function prepareEditorCheckpointExit(
  state: EditorSessionAutosaveState,
  getDocument: () => EditorDocument
): Promise<EditorCheckpointExit> {
  const generation = {
    contextGeneration: state.contextGeneration,
    hydrationGeneration: state.hydrationGeneration,
  };
  await flushPendingAutosave(state, getDocument);
  requireAutosaveGeneration(state, generation);
  const aggregateId = state.activeContext?.aggregateId ?? null;
  const durableRevision = state.activeContext?.durableRevision ?? null;
  const autosaveRevision = state.autosaveRevision;
  const isCurrent = () =>
    aggregateId !== null &&
    state.activeContext?.aggregateId === aggregateId &&
    state.contextGeneration === generation.contextGeneration &&
    state.hydrationGeneration === generation.hydrationGeneration &&
    state.activeContext.durableRevision === durableRevision &&
    state.autosaveRevision === autosaveRevision &&
    !state.hydration &&
    !state.hasUnsavedChanges &&
    !state.pendingDocument &&
    !state.interactionActive &&
    !state.lastWriteError;
  return {
    receipt: isCurrent() && state.lastCheckpointReceipt ? { ...state.lastCheckpointReceipt } : null,
    isCurrent,
  };
}
