import type { EditorSessionEntry } from '../../../composition/persistence/editor-sessions/contracts';
import type { EditorDocument } from '../../../features/editor/document/types';
import {
  activateAutosaveContext,
  discardAutosaveDraft,
  disposeAutosaveState,
  restoreAutosaveDraft,
  updateAutosaveContext,
} from './lifecycle';
import { flushPendingAutosave, persistAutosaveSnapshot, queuePendingAutosave } from './persistence';
import {
  createAutosaveState,
  type ActiveEditorSessionContext,
  type EditorSessionAutosaveState,
} from './state';

export interface EditorSessionAutosaveService {
  activate: (context: ActiveEditorSessionContext) => void;
  updateContext: (patch: Partial<Omit<ActiveEditorSessionContext, 'sessionId'>>) => void;
  restoreDraft: (sessionId: string) => Promise<EditorSessionEntry | undefined>;
  scheduleAutosave: (document: EditorDocument) => void;
  flushAutosave: (getDocument: () => EditorDocument) => Promise<void>;
  persistSnapshot: (getDocument: () => EditorDocument) => Promise<void>;
  discardDraft: (sessionId?: string | null) => Promise<void>;
  dispose: () => void;
}

export type { ActiveEditorSessionContext, EditorSessionAutosaveState } from './state';

function createEditorSessionAutosaveActions(
  state: EditorSessionAutosaveState
): EditorSessionAutosaveService {
  return {
    activate: (context) => activateAutosaveContext(state, context),
    updateContext: (patch) => updateAutosaveContext(state, patch),
    restoreDraft: (sessionId) => restoreAutosaveDraft(state, sessionId),
    scheduleAutosave: (document) => queuePendingAutosave(state, document),
    flushAutosave: (getDocument) => flushPendingAutosave(state, getDocument),
    persistSnapshot: (getDocument) => persistAutosaveSnapshot(state, getDocument),
    discardDraft: (sessionId) => discardAutosaveDraft(state, sessionId),
    dispose: () => disposeAutosaveState(state),
  };
}

/**
 * Creates a page-owned autosave service with isolated session state and timer lifecycle.
 */
export function createEditorSessionAutosaveService(): EditorSessionAutosaveService {
  return createEditorSessionAutosaveActions(createAutosaveState());
}
