import {
  getImageWorkspace,
  type ImageWorkspaceEntry,
} from '../../../composition/persistence/image-workspaces';
import { useEditorStore } from '../../state/useEditorStore';
import {
  clearPendingAutosaveTimer,
  type ActiveEditorSessionContext,
  type EditorSessionAutosaveState,
} from './state';
import { setEditorSaveState } from './persistence';

export function activateAutosaveContext(
  state: EditorSessionAutosaveState,
  context: ActiveEditorSessionContext
): void {
  clearPendingAutosaveTimer(state);
  state.pendingDocument = null;
  state.lastWriteError = null;
  state.activeContext = context;
  useEditorStore.getState().setSessionId(context.aggregateId);
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
  aggregateId: string
): Promise<ImageWorkspaceEntry | undefined> {
  const entry = await getImageWorkspace(aggregateId);
  if (!entry) {
    return undefined;
  }

  activateAutosaveContext(state, {
    aggregateId: entry.aggregateId,
    durableRevision: entry.revision,
    renderPresentation: state.activeContext?.renderPresentation ?? null,
    sourceUrl: entry.sourceUrl,
    sourceTitle: entry.sourceTitle,
  });
  setEditorSaveState('saved');
  return entry;
}

export async function discardAutosaveDraft(
  state: EditorSessionAutosaveState,
  _aggregateId?: string | null
): Promise<void> {
  clearPendingAutosaveTimer(state);
  state.pendingDocument = null;
  state.lastWriteError = null;
  state.activeContext = null;
  useEditorStore.getState().setSessionId(null);
  setEditorSaveState('idle');
}

export function disposeAutosaveState(state: EditorSessionAutosaveState): void {
  clearPendingAutosaveTimer(state);
  state.pendingDocument = null;
  state.activeContext = null;
}
