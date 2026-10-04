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
import {
  flushPendingAutosave,
  persistAutosaveSnapshot,
  queuePendingAutosave,
  schedulePendingAutosaveWrite,
  saveEditorSessionSnapshot,
  setEditorSaveState,
} from './persistence';
import { scheduleImagePresentation } from './presentation';
import {
  clearPendingAutosaveTimer,
  interruptImagePresentation,
  releaseAutosaveInteraction,
  createAutosaveState,
  type ActiveEditorSessionContext,
  type EditorSessionAutosaveState,
} from './state';

export interface EditorSessionAutosaveService {
  activate: (context: ActiveEditorSessionContext) => void;
  rebindAggregate: (context: ActiveEditorSessionContext) => void;
  updateContext: (patch: Partial<Omit<ActiveEditorSessionContext, 'aggregateId'>>) => void;
  restoreDraft: (
    aggregateId: string,
    isCurrent?: () => boolean
  ) => Promise<ImageWorkspaceEntry | undefined>;
  scheduleAutosave: (document: EditorDocument) => void;
  /** Suspends background work for an active page interaction without aborting atomic writes. */
  setInteractionActive: (active: boolean) => void;
  flushAutosave: (getDocument: () => EditorDocument) => Promise<void>;
  persistSnapshot: (getDocument: () => EditorDocument) => Promise<void>;
  saveNow: (getDocument: () => EditorDocument) => Promise<void>;
  isEnabled: () => boolean;
  hasUnsavedChanges: () => boolean;
  setEnabled: (enabled: boolean, getDocument?: () => EditorDocument) => void;
  discardDraft: (aggregateId?: string | null) => Promise<void>;
  getDurableRevision: () => number | null;
  getLastWriteError: () => unknown | null;
  schedulePresentation: () => void;
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
    restoreDraft: (aggregateId, isCurrent) => restoreAutosaveDraft(state, aggregateId, isCurrent),
    scheduleAutosave: (document) => queuePendingAutosave(state, document),
    setInteractionActive: (active) => {
      if (state.interactionActive === active) return;
      state.interactionRevision += 1;
      state.interactionActive = active;
      if (active) {
        clearPendingAutosaveTimer(state);
        interruptImagePresentation(state);
        return;
      }
      releaseAutosaveInteraction(state);
      schedulePendingAutosaveWrite(state);
      const context = state.activeContext;
      if (context && state.presentationPending) {
        scheduleImagePresentation(context, context.durableRevision, state.autosaveRevision, state);
      }
    },
    flushAutosave: (getDocument) => flushPendingAutosave(state, getDocument),
    persistSnapshot: (getDocument) => persistAutosaveSnapshot(state, getDocument),
    saveNow: (getDocument) => saveEditorSessionSnapshot(state, getDocument),
    isEnabled: () => state.enabled,
    hasUnsavedChanges: () => state.hasUnsavedChanges || state.interactionActive,
    setEnabled: (enabled, getDocument) => {
      if (state.enabled === enabled) return;
      state.enabled = enabled;
      clearPendingAutosaveTimer(state);
      state.pendingDocument = null;
      if (enabled && state.activeContext && getDocument) {
        queuePendingAutosave(state, getDocument());
      } else if (!enabled) {
        setEditorSaveState('idle');
      }
    },
    discardDraft: (aggregateId) => discardAutosaveDraft(state, aggregateId),
    getDurableRevision: () => state.activeContext?.durableRevision ?? null,
    getLastWriteError: () => state.lastWriteError,
    schedulePresentation: () => {
      const context = state.activeContext;
      if (context)
        scheduleImagePresentation(context, context.durableRevision, state.autosaveRevision, state);
    },
    dispose: () => disposeAutosaveState(state),
  };
}

/**
 * Creates a page-owned autosave service with isolated session state and timer lifecycle.
 */
export function createEditorSessionAutosaveService(): EditorSessionAutosaveService {
  return createEditorSessionAutosaveActions(createAutosaveState());
}
