import { applyDomMutationBatch } from './dom';
import { createLogger } from '@sniptale/platform/observability/logger';
import type {
  PageDomMutationBatch,
  PagePreparationHistoryBridge,
  PagePreparationHistoryEntry,
  PagePreparationSessionSnapshot,
  PagePreparationHistoryState,
} from './types';

const logger = createLogger({ namespace: 'ContentPagePreparationHistoryApply' });

type DeferredCommit = {
  before: PagePreparationSessionSnapshot;
  id: number;
};

type OpenTransaction = {
  before: PagePreparationSessionSnapshot;
  domBatch: PageDomMutationBatch | null;
};

export type HistoryListener = () => void;

export type HistoryStoreRuntimeState = {
  bridge: PagePreparationHistoryBridge | null;
  deferredCommitId: number;
  deferredCommits: Map<number, DeferredCommit>;
  future: PagePreparationHistoryEntry[];
  isApplying: boolean;
  listeners: Set<HistoryListener>;
  past: PagePreparationHistoryEntry[];
  revision: number;
  transactions: Map<string, OpenTransaction>;
};

export function createHistoryStoreState(): HistoryStoreRuntimeState {
  return {
    bridge: null,
    deferredCommitId: 0,
    deferredCommits: new Map<number, DeferredCommit>(),
    future: [],
    isApplying: false,
    listeners: new Set<HistoryListener>(),
    past: [],
    revision: 0,
    transactions: new Map<string, OpenTransaction>(),
  };
}

function buildHistoryState(
  past: PagePreparationHistoryEntry[],
  future: PagePreparationHistoryEntry[],
  revision: number
): PagePreparationHistoryState {
  return {
    canRedo: future.length > 0,
    canUndo: past.length > 0,
    revision,
  };
}

function dispatchHistoryApplied(historyAppliedEvent: string): void {
  window.dispatchEvent(new CustomEvent(historyAppliedEvent));
}

function isComparableRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function arrayEqual(
  left: unknown[],
  right: unknown[],
  itemEqual: (leftItem: unknown, rightItem: unknown) => boolean
): boolean {
  return left.length === right.length && left.every((item, index) => itemEqual(item, right[index]));
}

function objectEqual(left: Record<string, unknown>, right: Record<string, unknown>): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);

  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key) =>
        Object.prototype.hasOwnProperty.call(right, key) && historyValueEqual(left[key], right[key])
    )
  );
}

function historyValueEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) {
    return true;
  }

  if (Array.isArray(left) && Array.isArray(right)) {
    return arrayEqual(left, right, historyValueEqual);
  }

  if (isComparableRecord(left) && isComparableRecord(right)) {
    return objectEqual(left, right);
  }

  return false;
}

function snapshotsEqual(
  left: PagePreparationSessionSnapshot,
  right: PagePreparationSessionSnapshot
): boolean {
  return historyValueEqual(
    {
      annotations: {
        domRecords: left.annotations.domRecords,
        frameOrders: left.annotations.frameOrders,
        schemaVersion: left.annotations.schemaVersion,
      },
      frameSession: left.frameSession,
    },
    {
      annotations: {
        domRecords: right.annotations.domRecords,
        frameOrders: right.annotations.frameOrders,
        schemaVersion: right.annotations.schemaVersion,
      },
      frameSession: right.frameSession,
    }
  );
}

function domBatchEqual(
  left: PageDomMutationBatch | null,
  right: PageDomMutationBatch | null
): boolean {
  return historyValueEqual(left, right);
}

export function normalizeHistoryDomBatch(
  batch: PageDomMutationBatch | null | undefined
): PageDomMutationBatch | null {
  if (!batch) {
    return null;
  }

  const patches = batch.patches.filter((patch) => !historyValueEqual(patch.before, patch.after));
  return patches.length > 0 ? { patches } : null;
}

function notifyListeners(state: HistoryStoreRuntimeState): void {
  state.listeners.forEach((listener) => listener());
}

export function publishHistoryState(state: HistoryStoreRuntimeState): void {
  state.revision += 1;
  notifyListeners(state);
}

export function readHistoryState(state: HistoryStoreRuntimeState): PagePreparationHistoryState {
  return buildHistoryState(state.past, state.future, state.revision);
}

export function captureHistorySnapshot(
  state: HistoryStoreRuntimeState
): PagePreparationSessionSnapshot | null {
  return state.bridge?.captureSnapshot() ?? null;
}

function collectSnapshotFrameIds(
  snapshot: PagePreparationSessionSnapshot,
  frameIds: Set<string>
): void {
  snapshot.frameSession.frames.forEach((frame) => frameIds.add(frame.id));
}

export function notifyHistoryReachabilityChanged(state: HistoryStoreRuntimeState): void {
  const notify = state.bridge?.onHistoryReachabilityChanged;
  if (!notify) return;
  const frameIds = new Set<string>();
  state.past.forEach((entry) => {
    collectSnapshotFrameIds(entry.before, frameIds);
    collectSnapshotFrameIds(entry.after, frameIds);
  });
  state.future.forEach((entry) => {
    collectSnapshotFrameIds(entry.before, frameIds);
    collectSnapshotFrameIds(entry.after, frameIds);
  });
  state.deferredCommits.forEach((commit) => collectSnapshotFrameIds(commit.before, frameIds));
  state.transactions.forEach((transaction) =>
    collectSnapshotFrameIds(transaction.before, frameIds)
  );
  const current = captureHistorySnapshot(state);
  if (current) collectSnapshotFrameIds(current, frameIds);
  notify(Array.from(frameIds).sort());
}

export function pushHistoryEntry(
  state: HistoryStoreRuntimeState,
  entry: PagePreparationHistoryEntry
): boolean {
  const domBatch = normalizeHistoryDomBatch(entry.domBatch);
  if (snapshotsEqual(entry.before, entry.after) && domBatchEqual(domBatch, null)) {
    return false;
  }

  state.past = [...state.past, { ...entry, domBatch }];
  state.future = [];
  notifyHistoryReachabilityChanged(state);
  publishHistoryState(state);
  return true;
}

export function applyHistoryEntry(
  direction: 'undo' | 'redo',
  dispatchEventName: string,
  entry: PagePreparationHistoryEntry,
  state: HistoryStoreRuntimeState
): boolean {
  if (!state.bridge) {
    return false;
  }

  const previousSnapshot = captureHistorySnapshot(state);
  if (!previousSnapshot) {
    return false;
  }

  state.isApplying = true;
  try {
    const domApplyResult = applyDomMutationBatch(entry.domBatch, direction);
    if (!domApplyResult.success) {
      logger.warn('Skipped history apply because DOM targets were missing', {
        direction,
        missingLocators: domApplyResult.missingLocators,
      });
      return false;
    }

    state.bridge.applySnapshot(direction === 'undo' ? entry.before : entry.after);
    dispatchHistoryApplied(dispatchEventName);
    return true;
  } catch (error) {
    const rollbackDirection = direction === 'undo' ? 'redo' : 'undo';
    const rollbackResult = applyDomMutationBatch(entry.domBatch, rollbackDirection);
    if (!rollbackResult.success) {
      logger.error('Failed to rollback DOM history state after snapshot apply failure', {
        missingLocators: rollbackResult.missingLocators,
      });
    }

    try {
      state.bridge.applySnapshot(previousSnapshot);
    } catch (rollbackError) {
      logger.error('Failed to rollback page-preparation snapshot after history apply failure', {
        error: rollbackError,
      });
    }

    logger.error('Failed to apply page-preparation history entry', error);
    return false;
  } finally {
    state.isApplying = false;
  }
}
