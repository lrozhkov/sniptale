import type { EditorDocument } from '../../../features/editor/document/types';
import type { AssetRef } from '../../../composition/persistence/assets';

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
  documentAssetsByRuntimeUrl: ReadonlyMap<string, AssetRef>;
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
    documentAssetsByRuntimeUrl: new Map(),
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
