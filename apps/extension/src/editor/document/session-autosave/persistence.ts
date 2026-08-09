import { commitImageWorkspace } from '../../../composition/persistence/image-aggregates';
import {
  commitImagePresentation,
  StaleImageWorkspaceError,
} from '../../../composition/persistence/image-aggregates';
import type { EditorDocument } from '../../../features/editor/document/types';
import { dataUrlToBlob } from '../../../platform/media-utils/data-url';
import { createImageThumbnailBlob } from '../../../platform/media-utils/image-thumbnail';
import { createLogger } from '@sniptale/platform/observability/logger';
import { useEditorStore } from '../../state/useEditorStore';
import {
  clearPendingAutosaveTimer,
  type ActiveEditorSessionContext,
  type EditorSessionAutosaveState,
} from './state';

const EDITOR_AUTOSAVE_DEBOUNCE_MS = 400;
const logger = createLogger({ namespace: 'EditorSession' });

async function updateImagePresentation(
  context: ActiveEditorSessionContext,
  revision: number
): Promise<void> {
  if (!context.renderPresentation) return;
  try {
    const previewBlob = await dataUrlToBlob(await context.renderPresentation());
    const thumbnailBlob = await createImageThumbnailBlob(previewBlob);
    await commitImagePresentation({
      aggregateId: context.aggregateId,
      expectedWorkspaceRevision: revision,
      previewBlob,
      thumbnailBlob,
    });
  } catch (error) {
    if (!(error instanceof StaleImageWorkspaceError)) {
      logger.warn('Failed to update image presentation', error);
    }
  }
}

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
      document: args.document,
      expectedRevision: args.context.durableRevision,
      sourceUrl: args.context.sourceUrl,
      sourceTitle: args.context.sourceTitle,
    });

    if (args.state.activeContext?.aggregateId === args.context.aggregateId) {
      args.state.activeContext.durableRevision = result.revision;
    }
    args.state.lastWriteError = null;
    void updateImagePresentation(args.context, result.revision);

    if (
      args.state.activeContext?.aggregateId === args.context.aggregateId &&
      args.revision === args.state.autosaveRevision
    ) {
      setEditorSaveErrorMessage(null);
      setEditorSaveState('saved');
    }
  } catch (error) {
    args.state.lastWriteError = error;
    logger.error('Failed to persist draft', error);

    if (
      args.state.activeContext?.aggregateId === args.context.aggregateId &&
      args.revision === args.state.autosaveRevision
    ) {
      setEditorSaveErrorMessage(error instanceof Error ? error.message : 'Failed to save draft');
      setEditorSaveState('error');
    }
  }
}

function enqueueEditorSessionDocument(
  state: EditorSessionAutosaveState,
  document: EditorDocument
): Promise<void> {
  const context = state.activeContext;
  if (!context) {
    return Promise.resolve();
  }

  const revision = ++state.autosaveRevision;
  setEditorSaveErrorMessage(null);
  setEditorSaveState('saving');

  state.writeChain = state.writeChain
    .catch(() => undefined)
    .then(() =>
      persistEditorSessionDocument({
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
  if (!state.activeContext) {
    return;
  }

  state.pendingDocument = document;
  setEditorSaveErrorMessage(null);
  setEditorSaveState('saving');
  clearPendingAutosaveTimer(state);
  state.pendingTimer = window.setTimeout(() => {
    state.pendingTimer = 0;

    const snapshot = state.pendingDocument;
    state.pendingDocument = null;
    if (!snapshot) {
      return;
    }

    void enqueueEditorSessionDocument(state, snapshot);
  }, EDITOR_AUTOSAVE_DEBOUNCE_MS);
}

export async function flushPendingAutosave(
  state: EditorSessionAutosaveState,
  getDocument: () => EditorDocument
): Promise<void> {
  if (!state.activeContext) {
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
  if (!state.activeContext) {
    return;
  }

  clearPendingAutosaveTimer(state);
  state.pendingDocument = null;
  await enqueueEditorSessionDocument(state, getDocument());
  if (state.lastWriteError) throw state.lastWriteError;
}
