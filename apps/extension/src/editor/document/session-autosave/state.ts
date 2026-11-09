import type { SyncCheckpointReceipt } from '../../../composition/persistence/sync-capture/contracts';
import { createSyncProductClient } from '../../../platform/runtime-messaging/sync-product-client';
import {
  acquireSyncCheckpointEdit,
  type SyncCheckpointEdit,
} from '../../../composition/persistence/sync-capture/checkpoint-publication';
import type { EditorDocument } from '../../../features/editor/document/types';
import type { AssetRef } from '../../../composition/persistence/assets';
import type { createAutosaveCoordinator } from '@sniptale/platform/data/autosave';

export interface ActiveEditorSessionContext {
  aggregateId: string;
  capturedAt?: number;
  durableRevision: number;
  requireExistingRoot?: boolean;
  sourceUrl: string | null;
  sourceTitle: string | null;
  renderPresentation: ((signal?: AbortSignal) => Promise<string> | string) | null;
}

export type EditorAutosaveCapture = {
  context: ActiveEditorSessionContext;
  contextGeneration: number;
  hydrationGeneration: number;
  document: EditorDocument;
  revision: number;
};

export interface AutosaveCheckpointEdit {
  acquired: Promise<SyncCheckpointEdit>;
  failed: boolean;
  writes: number;
  committed: boolean;
  ended: boolean;
  retired: boolean;
  releaseStarted: boolean;
}

export interface EditorCheckpointExit {
  readonly receipt: SyncCheckpointReceipt | null;
  isCurrent(): boolean;
}

export type EditorSessionAutosaveState = {
  lastCheckpointReceipt: SyncCheckpointReceipt | null;
  checkpointEdit: AutosaveCheckpointEdit | null;
  activeContext: ActiveEditorSessionContext | null;
  contextGeneration: number;
  hydrationGeneration: number;
  enabled: boolean;
  hydration: { isCurrent: () => boolean } | null;
  hasUnsavedChanges: boolean;
  autosaveRevision: number;
  pendingDocument: EditorDocument | null;
  coordinator: ReturnType<
    typeof createAutosaveCoordinator<'document', EditorAutosaveCapture | null>
  > | null;
  presentationTimer: number;
  interactionActive: boolean;
  interactionRevision: number;
  interactionWaiters: Array<() => void>;
  presentationPending: boolean;
  presentationRetryAttempt: number;
  presentationAbortController: AbortController | null;
  lastWriteError: unknown | null;
  presentationRetryPromise: Promise<void> | null;
  documentAssetsByRuntimeUrl: ReadonlyMap<string, AssetRef>;
  releaseHydratedDocument: (() => void) | null;
};

export function createAutosaveState(): EditorSessionAutosaveState {
  return {
    lastCheckpointReceipt: null,
    checkpointEdit: null,
    activeContext: null,
    contextGeneration: 0,
    hydrationGeneration: 0,
    enabled: true,
    hydration: null,
    hasUnsavedChanges: false,
    autosaveRevision: 0,
    pendingDocument: null,
    coordinator: null,
    presentationTimer: 0,
    interactionActive: false,
    interactionRevision: 0,
    interactionWaiters: [],
    presentationPending: false,
    presentationRetryAttempt: 0,
    presentationAbortController: null,
    lastWriteError: null,
    presentationRetryPromise: null,
    documentAssetsByRuntimeUrl: new Map(),
    releaseHydratedDocument: null,
  };
}

export function cancelPendingAutosaveRequest(state: EditorSessionAutosaveState): void {
  state.coordinator?.cancel('document');
}

export function clearPendingPresentationTimer(state: EditorSessionAutosaveState): void {
  if (state.presentationTimer === 0) return;
  window.clearTimeout(state.presentationTimer);
  state.presentationTimer = 0;
}

export function interruptImagePresentation(state: EditorSessionAutosaveState): void {
  clearPendingPresentationTimer(state);
  state.presentationAbortController?.abort();
}

export function releaseAutosaveInteraction(state: EditorSessionAutosaveState): void {
  state.interactionActive = false;
  for (const resolve of state.interactionWaiters.splice(0)) resolve();
}

function acquireCheckpointEdit(edit: AutosaveCheckpointEdit): void {
  edit.failed = false;
  edit.acquired = acquireSyncCheckpointEdit();
  void edit.acquired.catch(() => {
    edit.failed = true;
  });
}

export function beginAutosaveCheckpointEdit(state: EditorSessionAutosaveState): void {
  if (!state.activeContext) return;
  const current = state.checkpointEdit;
  if (current) {
    current.ended = false;
    return;
  }
  const edit: AutosaveCheckpointEdit = {
    acquired: acquireSyncCheckpointEdit(),
    failed: false,
    writes: 0,
    committed: false,
    ended: false,
    retired: false,
    releaseStarted: false,
  };
  void edit.acquired.catch(() => {
    edit.failed = true;
  });
  state.checkpointEdit = edit;
}

export function checkpointEditForAutosave(
  state: EditorSessionAutosaveState
): AutosaveCheckpointEdit | null {
  if (state.interactionActive && !state.checkpointEdit) beginAutosaveCheckpointEdit(state);
  const edit = state.checkpointEdit;
  if (edit?.failed && state.lastWriteError) acquireCheckpointEdit(edit);
  return edit;
}

function releaseCheckpointEdit(edit: AutosaveCheckpointEdit): void {
  if (edit.releaseStarted) return;
  edit.releaseStarted = true;
  void edit.acquired
    .then(async (lease) => {
      await lease.release();
      if (edit.committed)
        void createSyncProductClient()
          .wakeCheckpoints()
          .catch(() => undefined);
    })
    .catch(() => undefined);
}

export function settleAutosaveCheckpointEdit(
  state: EditorSessionAutosaveState,
  edit = state.checkpointEdit
): void {
  if (!edit || edit.writes > 0) return;
  if (edit.retired) {
    releaseCheckpointEdit(edit);
    return;
  }
  if (state.checkpointEdit !== edit || !edit.ended || state.interactionActive) return;
  if (state.hasUnsavedChanges && (state.enabled || edit.committed)) return;
  state.checkpointEdit = null;
  edit.retired = true;
  releaseCheckpointEdit(edit);
}

export function endAutosaveCheckpointEdit(state: EditorSessionAutosaveState): void {
  const edit = state.checkpointEdit;
  if (!edit) return;
  // The activity capture listener runs before Fabric's document/bubble commit handlers.
  // A task boundary lets the complete pointer dispatch publish its final history document.
  window.setTimeout(() => {
    if (state.checkpointEdit !== edit || state.interactionActive) return;
    edit.ended = true;
    settleAutosaveCheckpointEdit(state, edit);
  }, 0);
}

export function retireAutosaveCheckpointEdit(state: EditorSessionAutosaveState): void {
  const edit = state.checkpointEdit;
  state.checkpointEdit = null;
  if (!edit) return;
  edit.retired = true;
  settleAutosaveCheckpointEdit(state, edit);
}
