import { applyDomMutationBatch } from './dom';
import { createLogger } from '@sniptale/platform/observability/logger';
import type {
  PageDomMutationBatch,
  PagePreparationHistoryDomEffect,
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
export type HistoryClearListener = () => void;

export type HistoryStoreRuntimeState = {
  bridge: PagePreparationHistoryBridge | null;
  deferredCommitId: number;
  deferredCommits: Map<number, DeferredCommit>;
  future: PagePreparationHistoryEntry[];
  isApplying: boolean;
  clearListeners: Set<HistoryClearListener>;
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
    clearListeners: new Set<HistoryClearListener>(),
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
  const recoveryPending = past[past.length - 1]?.domEffect?.recoveryOnly === true;
  return {
    canRedo: future.length > 0 && !recoveryPending,
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

export function normalizeHistoryDomEffect(
  effect: PagePreparationHistoryDomEffect | null | undefined
): PagePreparationHistoryDomEffect | null {
  return effect?.hasChanges ? effect : null;
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
  state.listeners.forEach((listener) => {
    try {
      listener();
    } catch (error) {
      logger.error('Page-preparation history listener failed', error);
    }
  });
}

export function notifyHistoryCleared(state: HistoryStoreRuntimeState): void {
  try {
    state.bridge?.onHistoryCleared?.();
  } catch (error) {
    logger.error('Page-preparation history bridge clear listener failed', error);
  }
  state.clearListeners.forEach((listener) => {
    try {
      listener();
    } catch (error) {
      logger.error('Page-preparation history clear listener failed', error);
    }
  });
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
  try {
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
  } catch (error) {
    logger.error('Page-preparation history reachability observer failed', error);
  }
}

export function pushHistoryEntry(
  state: HistoryStoreRuntimeState,
  entry: PagePreparationHistoryEntry
): boolean {
  const domBatch = normalizeHistoryDomBatch(entry.domBatch);
  const domEffect = normalizeHistoryDomEffect(entry.domEffect);
  if (
    snapshotsEqual(entry.before, entry.after) &&
    domBatchEqual(domBatch, null) &&
    domEffect === null
  ) {
    return false;
  }

  state.past = [...state.past, { ...entry, domBatch, domEffect }];
  state.future = [];
  notifyHistoryReachabilityChanged(state);
  publishHistoryState(state);
  return true;
}

type HistoryApplyOutcome =
  | { status: 'applied' }
  | { entry: PagePreparationHistoryEntry; replaceCurrent: boolean; status: 'recovery' }
  | { status: 'unchanged' };

const snapshotOnlyRecoveryEffect: PagePreparationHistoryDomEffect = {
  apply: () => ({ failures: [], success: true }),
  hasChanges: true,
  recoveryOnly: true,
};

function createHistoryRecoveryOutcome(args: {
  dispatchEventName: string;
  effect: PagePreparationHistoryDomEffect;
  previousSnapshot: PagePreparationSessionSnapshot;
  state: HistoryStoreRuntimeState;
}): HistoryApplyOutcome {
  const recoverySnapshot = captureHistorySnapshot(args.state);
  if (!recoverySnapshot) {
    return { status: 'unchanged' };
  }

  dispatchHistoryApplied(args.dispatchEventName);
  return {
    entry: {
      after: recoverySnapshot,
      before: args.previousSnapshot,
      domBatch: null,
      domEffect: args.effect,
    },
    replaceCurrent: false,
    status: 'recovery',
  };
}

function createSnapshotOnlyRecoveryOutcome(args: {
  dispatchEventName: string;
  targetSnapshot: PagePreparationSessionSnapshot;
  state: HistoryStoreRuntimeState;
}): HistoryApplyOutcome {
  const factualSnapshot = captureHistorySnapshot(args.state);
  if (!factualSnapshot) {
    return { status: 'unchanged' };
  }

  dispatchHistoryApplied(args.dispatchEventName);
  return {
    entry: {
      after: factualSnapshot,
      before: args.targetSnapshot,
      domBatch: null,
      domEffect: snapshotOnlyRecoveryEffect,
    },
    replaceCurrent: true,
    status: 'recovery',
  };
}

export function applyHistoryEntry(
  direction: 'undo' | 'redo',
  dispatchEventName: string,
  entry: PagePreparationHistoryEntry,
  state: HistoryStoreRuntimeState
): HistoryApplyOutcome {
  if (!state.bridge) {
    return { status: 'unchanged' };
  }

  const previousSnapshot = captureHistorySnapshot(state);
  if (!previousSnapshot) {
    return { status: 'unchanged' };
  }

  state.isApplying = true;
  try {
    const domApplyResult = applyDomMutationBatch(entry.domBatch, direction);
    if (!domApplyResult.success) {
      logger.warn('Skipped history apply because DOM targets were missing', {
        direction,
        missingLocators: domApplyResult.missingLocators,
      });
      return { status: 'unchanged' };
    }

    const effectApplyResult = entry.domEffect?.apply(direction) ?? {
      failures: [],
      success: true,
    };
    if (!effectApplyResult.success) {
      const domRollbackResult = applyDomMutationBatch(
        entry.domBatch,
        direction === 'undo' ? 'redo' : 'undo'
      );
      logger.warn('Skipped history apply because owner DOM effects failed', {
        direction,
        failures: effectApplyResult.failures,
      });
      if (effectApplyResult.recovery && domRollbackResult.success) {
        return createHistoryRecoveryOutcome({
          dispatchEventName,
          effect: effectApplyResult.recovery.effect,
          previousSnapshot,
          state,
        });
      }
      return { status: 'unchanged' };
    }

    state.bridge.applySnapshot(direction === 'undo' ? entry.before : entry.after);
    dispatchHistoryApplied(dispatchEventName);
    return { status: 'applied' };
  } catch (error) {
    const rollbackDirection = direction === 'undo' ? 'redo' : 'undo';
    const effectRollbackResult = entry.domEffect?.apply(rollbackDirection) ?? {
      failures: [],
      success: true,
    };
    if (effectRollbackResult && !effectRollbackResult.success) {
      logger.error('Failed to rollback owner DOM effects after snapshot apply failure', {
        failures: effectRollbackResult.failures,
      });
    }
    const rollbackResult = applyDomMutationBatch(entry.domBatch, rollbackDirection);
    if (!rollbackResult.success) {
      logger.error('Failed to rollback DOM history state after snapshot apply failure', {
        missingLocators: rollbackResult.missingLocators,
      });
    }

    if (effectRollbackResult.recovery && rollbackResult.success) {
      logger.error('Failed to apply page-preparation history entry', error);
      return createHistoryRecoveryOutcome({
        dispatchEventName,
        effect: effectRollbackResult.recovery.effect,
        previousSnapshot,
        state,
      });
    }

    if (
      direction === 'undo' &&
      entry.domBatch === null &&
      entry.domEffect?.recoveryOnly === true &&
      !effectRollbackResult.success &&
      rollbackResult.success
    ) {
      logger.error('Retained snapshot-only recovery after safe owner recovery', error);
      return createSnapshotOnlyRecoveryOutcome({
        dispatchEventName,
        state,
        targetSnapshot: entry.before,
      });
    }

    if (effectRollbackResult.success && rollbackResult.success) {
      try {
        state.bridge.applySnapshot(previousSnapshot);
      } catch (rollbackError) {
        logger.error('Failed to rollback page-preparation snapshot after history apply failure', {
          error: rollbackError,
        });
      }
    }

    logger.error('Failed to apply page-preparation history entry', error);
    return { status: 'unchanged' };
  } finally {
    state.isApplying = false;
  }
}
