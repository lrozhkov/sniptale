import {
  recoverAndGetImageWorkspace,
  type ImageWorkspaceEntry,
} from '../../../composition/persistence/image-workspaces';
import { useEditorStore } from '../../state/useEditorStore';
import {
  retireAutosaveCheckpointEdit,
  cancelPendingAutosaveRequest,
  interruptImagePresentation,
  releaseAutosaveInteraction,
  type ActiveEditorSessionContext,
  type EditorSessionAutosaveState,
} from './state';
import { setEditorSaveState } from './persistence';
import type { ImageAggregateCopyResult } from '../../../composition/persistence/image-aggregates';

export function activateAutosaveContext(
  state: EditorSessionAutosaveState,
  context: ActiveEditorSessionContext,
  options: { preserveHydratedDocument?: boolean; preserveMode?: boolean } = {}
): void {
  state.lastCheckpointReceipt = null;
  cancelPendingAutosaveRequest(state);
  interruptImagePresentation(state);
  releaseAutosaveInteraction(state);
  retireAutosaveCheckpointEdit(state);
  state.presentationPending = false;
  state.presentationRetryAttempt = 0;
  if (!options.preserveHydratedDocument) {
    state.releaseHydratedDocument?.();
    state.releaseHydratedDocument = null;
    state.documentAssetsByRuntimeUrl = new Map();
    state.historyAssetsByValue = new Map();
    state.documentAssetsByVectorDefinitionId = new Map();
  }
  state.pendingDocument = null;
  state.pendingHistoryCapture = undefined;
  state.pendingCommit = null;
  state.lastWriteError = null;
  state.hasUnsavedChanges = false;
  state.activeContext = context;
  state.contextGeneration += 1;
  state.coordinator?.resume();
  state.presentationRetryPromise = null;
  if (!options.preserveHydratedDocument && !options.preserveMode) state.enabled = true;
  useEditorStore.getState().setSessionId(context.aggregateId);
}

export function rebindAutosaveAggregate(
  state: EditorSessionAutosaveState,
  context: ActiveEditorSessionContext,
  publication?: ImageAggregateCopyResult
): void {
  const enabled = state.enabled;
  activateAutosaveContext(
    state,
    publication
      ? {
          ...context,
          aggregateId: publication.aggregateId,
          durableRevision: publication.revision,
          sourceGeneration: publication.sourceGeneration ?? null,
          requireExistingRoot: true,
        }
      : context,
    { preserveHydratedDocument: true }
  );
  state.documentAssetsByRuntimeUrl = publication?.documentAssetsByRuntimeUrl ?? new Map();
  state.documentAssetsByVectorDefinitionId = new Map(
    publication?.documentAssetsByVectorDefinitionId
  );
  state.historyAssetsByValue = publication?.historyAssetsByValue ?? new Map();
  state.lastCheckpointReceipt = publication?.checkpointReceipt ?? null;
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

export type PreparedEditorSessionDocument = Pick<
  ImageWorkspaceEntry,
  | 'aggregateId'
  | 'revision'
  | 'sourceGeneration'
  | 'sourceTitle'
  | 'sourceUrl'
  | 'releaseDocumentAssets'
  | 'documentAssetsByRuntimeUrl'
  | 'historyAssetsByValue'
  | 'documentAssetsByVectorDefinitionId'
>;

/** Transfers hydrated resource ownership after the loaded canvas has been admitted. */
export function adoptPreparedAutosaveDocument(
  state: EditorSessionAutosaveState,
  entry: PreparedEditorSessionDocument
): void {
  const renderPresentation = state.activeContext?.renderPresentation ?? null;
  activateAutosaveContext(
    state,
    {
      aggregateId: entry.aggregateId,
      durableRevision: entry.revision,
      sourceGeneration: entry.sourceGeneration ?? null,
      requireExistingRoot: true,
      renderPresentation,
      sourceUrl: entry.sourceUrl,
      sourceTitle: entry.sourceTitle,
    },
    { preserveMode: true }
  );
  state.releaseHydratedDocument = entry.releaseDocumentAssets ?? null;
  state.documentAssetsByRuntimeUrl = entry.documentAssetsByRuntimeUrl ?? new Map();
  state.historyAssetsByValue = entry.historyAssetsByValue ?? new Map();
  state.documentAssetsByVectorDefinitionId = new Map(entry.documentAssetsByVectorDefinitionId);
  setEditorSaveState('saved');
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

  adoptPreparedAutosaveDocument(state, entry);
  return entry;
}

function resetAutosaveDocumentState(state: EditorSessionAutosaveState): void {
  interruptImagePresentation(state);
  releaseAutosaveInteraction(state);
  retireAutosaveCheckpointEdit(state);
  state.presentationPending = false;
  state.presentationRetryAttempt = 0;
  state.releaseHydratedDocument?.();
  state.releaseHydratedDocument = null;
  state.documentAssetsByRuntimeUrl = new Map();
  state.historyAssetsByValue = new Map();
  state.documentAssetsByVectorDefinitionId = new Map();
  state.pendingDocument = null;
  state.pendingHistoryCapture = undefined;
  state.pendingCommit = null;
}

export async function discardAutosaveDraft(
  state: EditorSessionAutosaveState,
  _aggregateId?: string | null
): Promise<void> {
  state.hydration = null;
  state.hydrationGeneration += 1;
  state.lastCheckpointReceipt = null;
  cancelPendingAutosaveRequest(state);
  resetAutosaveDocumentState(state);
  state.lastWriteError = null;
  state.hasUnsavedChanges = false;
  state.activeContext = null;
  state.contextGeneration += 1;
  state.coordinator?.resume();
  state.presentationRetryPromise = null;
  state.enabled = true;
  useEditorStore.getState().setSessionId(null);
  setEditorSaveState('idle');
}

export function disposeAutosaveState(state: EditorSessionAutosaveState): void {
  state.lastCheckpointReceipt = null;
  state.hydration = null;
  state.hydrationGeneration += 1;
  state.coordinator?.dispose();
  resetAutosaveDocumentState(state);
  state.activeContext = null;
  state.contextGeneration += 1;
  state.presentationRetryPromise = null;
}
