import {
  deleteEditorSessionDraft,
  getEditorSessionDraft,
} from '../../../composition/persistence/editor-sessions/index';
import type { EditorSessionEntry } from '../../../composition/persistence/editor-sessions/contracts';
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
  state.activeContext = context;
  useEditorStore.getState().setSessionId(context.sessionId);
}

export function updateAutosaveContext(
  state: EditorSessionAutosaveState,
  patch: Partial<Omit<ActiveEditorSessionContext, 'sessionId'>>
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
  sessionId: string
): Promise<EditorSessionEntry | undefined> {
  const entry = await getEditorSessionDraft(sessionId);
  if (!entry) {
    return undefined;
  }

  activateAutosaveContext(state, {
    sessionId: entry.sessionId,
    assetId: entry.assetId,
    sourceUrl: entry.sourceUrl,
    sourceTitle: entry.sourceTitle,
  });
  setEditorSaveState('saved');
  return entry;
}

export async function discardAutosaveDraft(
  state: EditorSessionAutosaveState,
  sessionId?: string | null
): Promise<void> {
  const resolvedSessionId = sessionId ?? state.activeContext?.sessionId ?? null;
  clearPendingAutosaveTimer(state);
  state.pendingDocument = null;

  if (resolvedSessionId) {
    await deleteEditorSessionDraft(resolvedSessionId);
  }

  setEditorSaveState('idle');
}

export function disposeAutosaveState(state: EditorSessionAutosaveState): void {
  clearPendingAutosaveTimer(state);
  state.pendingDocument = null;
  state.activeContext = null;
}
