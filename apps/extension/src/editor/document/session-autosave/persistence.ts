import { commitImageWorkspace } from '../../../composition/persistence/image-aggregates';
import type { EditorDocument } from '../../../features/editor/document/types';
import { createLogger } from '@sniptale/platform/observability/logger';
import { createUserFacingErrorMessage } from '../../../platform/i18n/user-facing-error';
import { useEditorStore } from '../../state/useEditorStore';
import { scheduleImagePresentation } from './presentation';
import {
  clearPendingAutosaveTimer,
  clearPendingPresentationTimer,
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
  state: EditorSessionAutosaveState;
}): Promise<void> {
  try {
    const result = await commitImageWorkspace({
      aggregateId: args.context.aggregateId,
      ...(args.context.capturedAt === undefined ? {} : { captureTime: args.context.capturedAt }),
      document: args.document,
      expectedRevision: args.context.durableRevision,
      sourceUrl: args.context.sourceUrl,
      sourceTitle: args.context.sourceTitle,
      reusableAssetsByRuntimeUrl: args.state.documentAssetsByRuntimeUrl,
    });

    if (args.state.activeContext?.aggregateId === args.context.aggregateId) {
      args.state.activeContext.durableRevision = result.revision;
      args.state.documentAssetsByRuntimeUrl = result.documentAssetsByRuntimeUrl;
    }
    args.state.lastWriteError = null;
    args.state.presentationError = false;
    args.state.presentationRetryBlocked = false;
    scheduleImagePresentation(args.context, result.revision, args.revision, args.state);

    if (
      args.state.activeContext?.aggregateId === args.context.aggregateId &&
      args.revision === args.state.autosaveRevision
    ) {
      args.state.hasUnsavedChanges = false;
      setEditorSaveErrorMessage(null);
      setEditorSaveState('saved');
    }
  } catch (error) {
    args.state.lastWriteError = error;
    args.state.presentationError = false;
    args.state.presentationRetryBlocked = false;
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

  const revision = ++state.autosaveRevision;
  clearPendingPresentationTimer(state);
  state.hasUnsavedChanges = true;
  setEditorSaveErrorMessage(null);
  setEditorSaveState('saving');

  state.writeChain = state.writeChain
    .catch(() => undefined)
    .then(() =>
      !explicit && !state.enabled
        ? undefined
        : persistEditorSessionDocument({
            context,
            document,
            revision,
            state,
          })
    );

  return state.writeChain;
}

export function queuePendingAutosave(
  state: EditorSessionAutosaveState,
  document: EditorDocument
): void {
  if (!state.activeContext) return;
  state.autosaveRevision += 1;
  clearPendingPresentationTimer(state);
  state.hasUnsavedChanges = true;
  if (!state.enabled) return;

  state.pendingDocument = document;
  setEditorSaveErrorMessage(null);
  setEditorSaveState('saving');
  clearPendingAutosaveTimer(state);
  state.pendingTimer = window.setTimeout(() => {
    state.pendingTimer = 0;

    const snapshot = state.pendingDocument;
    state.pendingDocument = null;
    if (!snapshot || !state.enabled) {
      return;
    }

    void enqueueEditorSessionDocument(state, snapshot);
  }, EDITOR_AUTOSAVE_DEBOUNCE_MS);
}

export async function flushPendingAutosave(
  state: EditorSessionAutosaveState,
  getDocument: () => EditorDocument
): Promise<void> {
  if (!state.activeContext || !state.enabled) {
    return;
  }

  clearPendingAutosaveTimer(state);
  const snapshot = state.pendingDocument ?? getDocument();
  state.pendingDocument = null;
  await enqueueEditorSessionDocument(state, snapshot);
  if (state.lastWriteError) throw state.lastWriteError;
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
