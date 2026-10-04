import { commitImageWorkspace } from '../../../composition/persistence/image-aggregates';
import type { EditorDocument } from '../../../features/editor/document/types';
import { createLogger } from '@sniptale/platform/observability/logger';
import { createUserFacingErrorMessage } from '../../../platform/i18n/user-facing-error';
import { useEditorStore } from '../../state/useEditorStore';
import { scheduleImagePresentation } from './presentation';
import {
  clearPendingAutosaveTimer,
  interruptImagePresentation,
  type ActiveEditorSessionContext,
  type EditorSessionAutosaveState,
} from './state';

const EDITOR_AUTOSAVE_DEBOUNCE_MS = 2_000;
const logger = createLogger({ namespace: 'EditorSession' });

export function setEditorSaveState(state: 'idle' | 'saving' | 'saved' | 'error'): void {
  useEditorStore.getState().setSaveState(state);
}

function setEditorSaveErrorMessage(message: string | null): void {
  useEditorStore.getState().setSaveErrorMessage(message);
}

async function persistEditorSessionDocument(args: {
  context: ActiveEditorSessionContext;
  document: EditorDocument;
  revision: number;
  contextGeneration: number;
  state: EditorSessionAutosaveState;
}): Promise<void> {
  try {
    const result = await commitImageWorkspace({
      aggregateId: args.context.aggregateId,
      ...(args.context.capturedAt === undefined ? {} : { captureTime: args.context.capturedAt }),
      document: args.document,
      expectedRevision: args.context.durableRevision,
      ...(args.context.requireExistingRoot ? { requireExistingRoot: true } : {}),
      sourceUrl: args.context.sourceUrl,
      sourceTitle: args.document.displayName ?? args.context.sourceTitle,
      reusableAssetsByRuntimeUrl: args.state.documentAssetsByRuntimeUrl,
    });

    if (args.state.contextGeneration !== args.contextGeneration) return;
    if (args.state.activeContext?.aggregateId === args.context.aggregateId) {
      args.state.activeContext.durableRevision = result.revision;
      args.state.activeContext.requireExistingRoot = true;
      args.state.documentAssetsByRuntimeUrl = result.documentAssetsByRuntimeUrl;
    }
    args.state.lastWriteError = null;
    args.state.presentationRetryAttempt = 0;

    if (
      args.state.activeContext?.aggregateId === args.context.aggregateId &&
      args.revision === args.state.autosaveRevision
    ) {
      args.state.hasUnsavedChanges = false;
      setEditorSaveErrorMessage(null);
      setEditorSaveState('saved');
    }
    scheduleImagePresentation(args.context, result.revision, args.revision, args.state);
  } catch (error) {
    if (args.state.contextGeneration !== args.contextGeneration) return;
    args.state.lastWriteError = error;
    logger.error('Failed to persist draft', error);

    if (
      args.state.activeContext?.aggregateId === args.context.aggregateId &&
      args.revision === args.state.autosaveRevision
    ) {
      setEditorSaveErrorMessage(
        createUserFacingErrorMessage({
          cause: error,
          detail: 'storage',
          summaryKey: 'common.errors.saveFailed',
        })
      );
      setEditorSaveState('error');
    }
  }
}

function enqueueEditorSessionDocument(
  state: EditorSessionAutosaveState,
  document: EditorDocument,
  explicit = false
): Promise<void> {
  const context = state.activeContext;
  if (!context) {
    return Promise.resolve();
  }

  const contextGeneration = state.contextGeneration;
  const revision = ++state.autosaveRevision;
  interruptImagePresentation(state);
  state.hasUnsavedChanges = true;
  setEditorSaveErrorMessage(null);
  setEditorSaveState('saving');

  state.writeChain = state.writeChain
    .catch(() => undefined)
    .then(() => {
      if (state.contextGeneration !== contextGeneration || (!explicit && !state.enabled)) return;
      if (!explicit && state.interactionActive) {
        if (revision === state.autosaveRevision) state.pendingDocument = document;
        setEditorSaveState('idle');
        return;
      }
      return persistEditorSessionDocument({
        context,
        contextGeneration,
        document,
        revision,
        state,
      });
    });

  return state.writeChain;
}

export function queuePendingAutosave(
  state: EditorSessionAutosaveState,
  document: EditorDocument
): void {
  if (!state.activeContext) return;
  state.autosaveRevision += 1;
  interruptImagePresentation(state);
  state.hasUnsavedChanges = true;
  if (!state.enabled) return;

  state.pendingDocument = document;
  setEditorSaveErrorMessage(null);
  setEditorSaveState('idle');
  schedulePendingAutosaveWrite(state);
}

export function schedulePendingAutosaveWrite(state: EditorSessionAutosaveState): void {
  clearPendingAutosaveTimer(state);
  if (!state.pendingDocument || !state.enabled || state.interactionActive) return;
  state.pendingTimer = window.setTimeout(() => {
    state.pendingTimer = 0;
    if (state.interactionActive || !state.enabled) return;
    const snapshot = state.pendingDocument;
    state.pendingDocument = null;
    if (snapshot) void enqueueEditorSessionDocument(state, snapshot);
  }, EDITOR_AUTOSAVE_DEBOUNCE_MS);
}

export async function flushPendingAutosave(
  state: EditorSessionAutosaveState,
  getDocument: () => EditorDocument
): Promise<void> {
  if (!state.activeContext || !state.enabled) {
    return;
  }

  const generation = state.contextGeneration;
  do {
    if (state.interactionActive) {
      await new Promise<void>((resolve) => state.interactionWaiters.push(resolve));
    }
    if (state.contextGeneration !== generation) {
      throw new Error('Editor document changed while waiting to save.');
    }
    clearPendingAutosaveTimer(state);
    const snapshot = state.pendingDocument ?? getDocument();
    state.pendingDocument = null;
    await enqueueEditorSessionDocument(state, snapshot);
    if (state.contextGeneration !== generation) {
      throw new Error('Editor document changed while waiting to save.');
    }
    if (state.lastWriteError) throw state.lastWriteError;
  } while (
    state.contextGeneration === generation &&
    state.enabled &&
    (state.pendingDocument !== null || state.hasUnsavedChanges || state.interactionActive)
  );
}

export async function persistAutosaveSnapshot(
  state: EditorSessionAutosaveState,
  getDocument: () => EditorDocument
): Promise<void> {
  if (!state.activeContext || !state.enabled) {
    return;
  }

  await saveEditorSessionSnapshot(state, getDocument);
}

export async function saveEditorSessionSnapshot(
  state: EditorSessionAutosaveState,
  getDocument: () => EditorDocument
): Promise<void> {
  if (!state.activeContext) return;

  clearPendingAutosaveTimer(state);
  state.pendingDocument = null;
  await enqueueEditorSessionDocument(state, getDocument(), true);
  if (state.lastWriteError) throw state.lastWriteError;
}
