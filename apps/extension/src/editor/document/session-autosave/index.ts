import type { ImageWorkspaceEntry } from '../../../composition/persistence/image-workspaces';
import type { EditorDocument } from '../../../features/editor/document/types';
import {
  activateAutosaveContext,
  discardAutosaveDraft,
  disposeAutosaveState,
  rebindAutosaveAggregate,
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
  rebindAggregate: (context: ActiveEditorSessionContext) => void;
  updateContext: (patch: Partial<Omit<ActiveEditorSessionContext, 'aggregateId'>>) => void;
  restoreDraft: (aggregateId: string) => Promise<ImageWorkspaceEntry | undefined>;
  scheduleAutosave: (document: EditorDocument) => void;
  flushAutosave: (getDocument: () => EditorDocument) => Promise<void>;
  persistSnapshot: (getDocument: () => EditorDocument) => Promise<void>;
  discardDraft: (aggregateId?: string | null) => Promise<void>;
  getDurableRevision: () => number | null;
  getLastWriteError: () => unknown | null;
  dispose: () => void;
}

export type { ActiveEditorSessionContext, EditorSessionAutosaveState } from './state';

function createEditorSessionAutosaveActions(
  state: EditorSessionAutosaveState
): EditorSessionAutosaveService {
  return {
    activate: (context) => activateAutosaveContext(state, context),
    rebindAggregate: (context) => rebindAutosaveAggregate(state, context),
    updateContext: (patch) => updateAutosaveContext(state, patch),
    restoreDraft: (aggregateId) => restoreAutosaveDraft(state, aggregateId),
    scheduleAutosave: (document) => queuePendingAutosave(state, document),
    flushAutosave: (getDocument) => flushPendingAutosave(state, getDocument),
    persistSnapshot: (getDocument) => persistAutosaveSnapshot(state, getDocument),
    discardDraft: (aggregateId) => discardAutosaveDraft(state, aggregateId),
    getDurableRevision: () => state.activeContext?.durableRevision ?? null,
    getLastWriteError: () => state.lastWriteError,
    dispose: () => disposeAutosaveState(state),
  };
}

/**
 * Creates a page-owned autosave service with isolated session state and timer lifecycle.
 */
export function createEditorSessionAutosaveService(): EditorSessionAutosaveService {
  return createEditorSessionAutosaveActions(createAutosaveState());
}
