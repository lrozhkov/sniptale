import {
  commitImagePresentation,
  StaleImageWorkspaceError,
} from '../../../composition/persistence/image-aggregates';
import { publishMediaHubLibraryChanged } from '../../../features/media-hub/events';
import { translate } from '../../../platform/i18n';
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

function reportPresentationFailure(state: EditorSessionAutosaveState, error: unknown): void {
  if (error instanceof StaleImageWorkspaceError) {
    state.lastWriteError = error;
  } else {
    logger.warn('Failed to update image presentation', error);
    state.presentationError = true;
    useEditorStore
      .getState()
      .setSaveErrorMessage(translate('editor.documentActions.previewErrorDescription'));
  }
  useEditorStore.getState().setSaveState('error');
}

async function updateImagePresentation(
  context: ActiveEditorSessionContext,
  revision: number,
  editRevision: number,
  state: EditorSessionAutosaveState,
  contextGeneration: number,
  surfaceFailure = false
): Promise<void> {
  if (!context.renderPresentation) return;
  const isCurrent = () =>
    isCurrentPresentation(state, context, contextGeneration, revision, editRevision);
  if (!isCurrent()) return;
  try {
    const previewBlob = await dataUrlToBlob(await context.renderPresentation());
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
      state.presentationError = false;
      state.presentationRetryBlocked = false;
      state.lastWriteError = null;
      useEditorStore.getState().setSaveErrorMessage(null);
      useEditorStore.getState().setSaveState('saved');
    }
  } catch (error) {
    if (isCurrent()) reportPresentationFailure(state, error);
    else if (!(error instanceof StaleImageWorkspaceError)) {
      logger.warn('Failed to update image presentation', error);
    }
    if (surfaceFailure) throw error;
  }
}

export async function retryImagePresentation(state: EditorSessionAutosaveState): Promise<void> {
  if (state.presentationRetryPromise) return state.presentationRetryPromise;
  const context = state.activeContext;
  if (!context || !context.renderPresentation) return;
  if (state.hasUnsavedChanges || state.pendingDocument) {
    state.presentationError = true;
    state.presentationRetryBlocked = true;
    useEditorStore
      .getState()
      .setSaveErrorMessage(translate('editor.documentActions.previewRequiresSavedDocument'));
    useEditorStore.getState().setSaveState('error');
    throw new Error('Preview retry requires a clean durable workspace.');
  }
  clearPendingPresentationTimer(state);
  state.presentationRetryBlocked = false;
  useEditorStore.getState().setSaveState('saving');
  const retry = updateImagePresentation(
    context,
    context.durableRevision,
    state.autosaveRevision,
    state,
    state.contextGeneration,
    true
  );
  state.presentationRetryPromise = retry;
  try {
    await retry;
  } finally {
    if (state.presentationRetryPromise === retry) state.presentationRetryPromise = null;
  }
}

export function scheduleImagePresentation(
  context: ActiveEditorSessionContext,
  revision: number,
  editRevision: number,
  state: EditorSessionAutosaveState
): void {
  clearPendingPresentationTimer(state);
  if (!context.renderPresentation) return;
  const contextGeneration = state.contextGeneration;
  state.presentationTimer = window.setTimeout(() => {
    state.presentationTimer = 0;
    void updateImagePresentation(context, revision, editRevision, state, contextGeneration);
  }, EDITOR_PRESENTATION_DEBOUNCE_MS);
}
