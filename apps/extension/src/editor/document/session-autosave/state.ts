import type { EditorDocument } from '../../../features/editor/document/types';

export interface ActiveEditorSessionContext {
  aggregateId: string;
  durableRevision: number;
  sourceUrl: string | null;
  sourceTitle: string | null;
  renderPresentation: (() => Promise<string> | string) | null;
}

export type EditorSessionAutosaveState = {
  activeContext: ActiveEditorSessionContext | null;
  autosaveRevision: number;
  pendingDocument: EditorDocument | null;
  pendingTimer: number;
  lastWriteError: unknown | null;
  releaseHydratedDocument: (() => void) | null;
  writeChain: Promise<void>;
};

export function createAutosaveState(): EditorSessionAutosaveState {
  return {
    activeContext: null,
    autosaveRevision: 0,
    pendingDocument: null,
    pendingTimer: 0,
    lastWriteError: null,
    releaseHydratedDocument: null,
    writeChain: Promise.resolve(),
  };
}

export function clearPendingAutosaveTimer(state: EditorSessionAutosaveState): void {
  if (state.pendingTimer === 0) {
    return;
  }

  window.clearTimeout(state.pendingTimer);
  state.pendingTimer = 0;
}
