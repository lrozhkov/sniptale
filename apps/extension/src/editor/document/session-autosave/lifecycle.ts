import {
  recoverAndGetImageWorkspace,
  type ImageWorkspaceEntry,
} from '../../../composition/persistence/image-workspaces';
import { useEditorStore } from '../../state/useEditorStore';
import {
  clearPendingAutosaveTimer,
  clearPendingPresentationTimer,
  type ActiveEditorSessionContext,
  type EditorSessionAutosaveState,
} from './state';
import { setEditorSaveState } from './persistence';

export function activateAutosaveContext(
  state: EditorSessionAutosaveState,
  context: ActiveEditorSessionContext,
  options: { preserveHydratedDocument?: boolean } = {}
): void {
  clearPendingAutosaveTimer(state);
  clearPendingPresentationTimer(state);
  if (!options.preserveHydratedDocument) {
    state.releaseHydratedDocument?.();
    state.releaseHydratedDocument = null;
    state.documentAssetsByRuntimeUrl = new Map();
  }
  state.pendingDocument = null;
  state.lastWriteError = null;
  state.presentationError = false;
  state.presentationRetryBlocked = false;
  state.hasUnsavedChanges = false;
  state.activeContext = context;
  state.contextGeneration += 1;
  state.presentationRetryPromise = null;
  if (!options.preserveHydratedDocument) state.enabled = true;
  useEditorStore.getState().setSessionId(context.aggregateId);
}

export function rebindAutosaveAggregate(
  state: EditorSessionAutosaveState,
  context: ActiveEditorSessionContext
): void {
  const enabled = state.enabled;
  activateAutosaveContext(state, context, { preserveHydratedDocument: true });
  state.enabled = enabled;
}

export function updateAutosaveContext(
  state: EditorSessionAutosaveState,
  patch: Partial<Omit<ActiveEditorSessionContext, 'aggregateId'>>
): void {
  if (!state.activeContext) {
    return;
  }

  state.activeContext = {
    ...state.activeContext,
    ...patch,
  };
}

export async function restoreAutosaveDraft(
  state: EditorSessionAutosaveState,
  aggregateId: string,
  isCurrent: () => boolean = () => true
): Promise<ImageWorkspaceEntry | undefined> {
  const entry = await recoverAndGetImageWorkspace(aggregateId);
  if (!entry) {
    return undefined;
  }
  if (!isCurrent()) {
    entry.releaseDocumentAssets?.();
    return undefined;
  }

  const renderPresentation = state.activeContext?.renderPresentation ?? null;
  activateAutosaveContext(state, {
    aggregateId: entry.aggregateId,
    durableRevision: entry.revision,
    requireExistingRoot: true,
    renderPresentation,
    sourceUrl: entry.sourceUrl,
    sourceTitle: entry.sourceTitle,
  });
  state.releaseHydratedDocument = entry.releaseDocumentAssets ?? null;
  state.documentAssetsByRuntimeUrl = entry.documentAssetsByRuntimeUrl ?? new Map();
  setEditorSaveState('saved');
  return entry;
}

export async function discardAutosaveDraft(
  state: EditorSessionAutosaveState,
  _aggregateId?: string | null
): Promise<void> {
  clearPendingAutosaveTimer(state);
  clearPendingPresentationTimer(state);
  state.releaseHydratedDocument?.();
  state.releaseHydratedDocument = null;
  state.documentAssetsByRuntimeUrl = new Map();
  state.pendingDocument = null;
  state.lastWriteError = null;
  state.presentationError = false;
  state.presentationRetryBlocked = false;
  state.hasUnsavedChanges = false;
  state.activeContext = null;
  state.contextGeneration += 1;
  state.presentationRetryPromise = null;
  state.enabled = true;
  useEditorStore.getState().setSessionId(null);
  setEditorSaveState('idle');
}

export function disposeAutosaveState(state: EditorSessionAutosaveState): void {
  clearPendingAutosaveTimer(state);
  clearPendingPresentationTimer(state);
  state.releaseHydratedDocument?.();
  state.releaseHydratedDocument = null;
  state.documentAssetsByRuntimeUrl = new Map();
  state.pendingDocument = null;
  state.activeContext = null;
  state.contextGeneration += 1;
  state.presentationRetryPromise = null;
}
