import {
  commitImagePresentation,
  StaleImageWorkspaceError,
} from '../../../composition/persistence/image-aggregates';
import { publishMediaHubLibraryChanged } from '../../../features/media-hub/events';
import { dataUrlToBlob } from '../../../platform/media-utils/data-url';
import { createImageThumbnailBlob } from '../../../platform/media-utils/image-thumbnail';
import { createLogger } from '@sniptale/platform/observability/logger';
import { useEditorStore } from '../../state/useEditorStore';
import {
  clearPendingPresentationTimer,
  type ActiveEditorSessionContext,
  type EditorSessionAutosaveState,
} from './state';

const EDITOR_PRESENTATION_DEBOUNCE_MS = 3_000;
const logger = createLogger({ namespace: 'EditorSession' });

function isCurrentPresentation(
  state: EditorSessionAutosaveState,
  context: ActiveEditorSessionContext,
  contextGeneration: number,
  revision: number,
  editRevision: number
): boolean {
  return (
    state.contextGeneration === contextGeneration &&
    state.activeContext?.aggregateId === context.aggregateId &&
    state.activeContext.durableRevision === revision &&
    state.autosaveRevision === editRevision &&
    state.pendingDocument === null
  );
}

async function updateImagePresentation(
  context: ActiveEditorSessionContext,
  revision: number,
  editRevision: number,
  state: EditorSessionAutosaveState,
  contextGeneration: number,
  signal: AbortSignal
): Promise<void> {
  if (!context.renderPresentation) return;
  const interactionRevision = state.interactionRevision;
  const isCurrent = () =>
    !signal.aborted &&
    !state.interactionActive &&
    state.interactionRevision === interactionRevision &&
    isCurrentPresentation(state, context, contextGeneration, revision, editRevision);
  if (!isCurrent()) return;
  try {
    const previewDataUrl = await context.renderPresentation(signal);
    if (!isCurrent()) return;
    const previewBlob = await dataUrlToBlob(previewDataUrl);
    if (!isCurrent()) return;
    const thumbnailBlob = await createImageThumbnailBlob(previewBlob);
    if (!isCurrent()) return;
    await commitImagePresentation({
      aggregateId: context.aggregateId,
      expectedWorkspaceRevision: revision,
      previewBlob,
      thumbnailBlob,
    });
    publishMediaHubLibraryChanged('update', [context.aggregateId]);
    if (isCurrent()) {
      state.presentationPending = false;
      state.presentationRetryAttempt = 0;
      state.lastWriteError = null;
      useEditorStore.getState().setSaveErrorMessage(null);
      useEditorStore.getState().setSaveState('saved');
    }
  } catch (error) {
    if (isCurrent()) {
      if (error instanceof StaleImageWorkspaceError) {
        state.lastWriteError = error;
        useEditorStore.getState().setSaveState('error');
      } else {
        state.presentationRetryAttempt = Math.min(state.presentationRetryAttempt + 1, 5);
        logger.debug('Image presentation deferred');
      }
    }
  }
}

function startImagePresentation(
  context: ActiveEditorSessionContext,
  revision: number,
  editRevision: number,
  state: EditorSessionAutosaveState
): Promise<void> {
  if (state.presentationRetryPromise) return state.presentationRetryPromise;
  const abortController = new AbortController();
  state.presentationAbortController = abortController;
  const task = updateImagePresentation(
    context,
    revision,
    editRevision,
    state,
    state.contextGeneration,
    abortController.signal
  );
  state.presentationRetryPromise = task;
  return task.finally(() => {
    if (state.presentationRetryPromise !== task) return;
    state.presentationRetryPromise = null;
    state.presentationAbortController = null;
    const current = state.activeContext;
    if (current && state.presentationPending && !state.lastWriteError) {
      scheduleImagePresentation(current, current.durableRevision, state.autosaveRevision, state);
    }
  });
}

export function scheduleImagePresentation(
  context: ActiveEditorSessionContext,
  revision: number,
  editRevision: number,
  state: EditorSessionAutosaveState
): void {
  clearPendingPresentationTimer(state);
  if (!context.renderPresentation) return;
  state.presentationPending = true;
  if (
    state.interactionActive ||
    state.hasUnsavedChanges ||
    state.pendingDocument ||
    state.presentationRetryPromise
  )
    return;
  const contextGeneration = state.contextGeneration;
  state.presentationTimer = window.setTimeout(
    () => {
      state.presentationTimer = 0;
      if (state.contextGeneration !== contextGeneration || state.interactionActive) return;
      void startImagePresentation(context, revision, editRevision, state);
    },
    Math.min(60_000, EDITOR_PRESENTATION_DEBOUNCE_MS * 2 ** state.presentationRetryAttempt)
  );
}
