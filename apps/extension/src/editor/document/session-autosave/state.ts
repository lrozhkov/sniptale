import type { EditorDocument } from '../../../features/editor/document/types';
import type { AssetRef } from '../../../composition/persistence/assets';

export interface ActiveEditorSessionContext {
  aggregateId: string;
  capturedAt?: number;
  durableRevision: number;
  requireExistingRoot?: boolean;
  sourceUrl: string | null;
  sourceTitle: string | null;
  renderPresentation: (() => Promise<string> | string) | null;
}

export type EditorSessionAutosaveState = {
  activeContext: ActiveEditorSessionContext | null;
  contextGeneration: number;
  enabled: boolean;
  hasUnsavedChanges: boolean;
  autosaveRevision: number;
  pendingDocument: EditorDocument | null;
  pendingTimer: number;
  presentationTimer: number;
  lastWriteError: unknown | null;
  presentationError: boolean;
  presentationRetryBlocked: boolean;
  presentationRetryPromise: Promise<void> | null;
  documentAssetsByRuntimeUrl: ReadonlyMap<string, AssetRef>;
  releaseHydratedDocument: (() => void) | null;
  writeChain: Promise<void>;
};

export function createAutosaveState(): EditorSessionAutosaveState {
  return {
    activeContext: null,
    contextGeneration: 0,
    enabled: true,
    hasUnsavedChanges: false,
    autosaveRevision: 0,
    pendingDocument: null,
    pendingTimer: 0,
    presentationTimer: 0,
    lastWriteError: null,
    presentationError: false,
    presentationRetryBlocked: false,
    presentationRetryPromise: null,
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

export function clearPendingPresentationTimer(state: EditorSessionAutosaveState): void {
  if (state.presentationTimer === 0) return;
  window.clearTimeout(state.presentationTimer);
  state.presentationTimer = 0;
}
