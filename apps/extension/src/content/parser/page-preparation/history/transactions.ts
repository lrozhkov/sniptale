import {
  captureHistorySnapshot,
  normalizeHistoryDomBatch,
  normalizeHistoryDomEffect,
  notifyHistoryReachabilityChanged,
  publishHistoryState,
  pushHistoryEntry,
  type HistoryStoreRuntimeState,
} from './store-state';
import type {
  PageDomMutationBatch,
  PagePreparationHistoryDomEffect,
  PagePreparationHistoryEntry,
  PagePreparationSessionSnapshot,
} from './types';
import { clearHistoryDomLocators } from './dom-locators';

type HistoryEntryArgs = {
  after?: PagePreparationSessionSnapshot | null;
  before?: PagePreparationSessionSnapshot | null;
  domBatch?: PageDomMutationBatch | null;
  domEffect?: PagePreparationHistoryDomEffect | null;
};

function createEntryFromArgs(
  state: HistoryStoreRuntimeState,
  args: HistoryEntryArgs
): PagePreparationHistoryEntry | null {
  const before = args.before ?? captureHistorySnapshot(state);
  const after = args.after ?? captureHistorySnapshot(state);
  if (!before || !after) {
    return null;
  }

  return {
    after,
    before,
    domBatch: normalizeHistoryDomBatch(args.domBatch),
    domEffect: normalizeHistoryDomEffect(args.domEffect),
  };
}

function beginDeferredCommitBoundary(state: HistoryStoreRuntimeState): number | null {
  if (state.isApplying) {
    return null;
  }

  const before = captureHistorySnapshot(state);
  if (!before) {
    return null;
  }

  state.deferredCommitId += 1;
  state.deferredCommits.set(state.deferredCommitId, {
    before,
    id: state.deferredCommitId,
  });
  notifyHistoryReachabilityChanged(state);
  return state.deferredCommitId;
}

function commitTransactionEntry(args: {
  domBatch?: PageDomMutationBatch | null;
  domEffect?: PagePreparationHistoryDomEffect | null;
  key: string;
  state: HistoryStoreRuntimeState;
}): PagePreparationHistoryEntry | null {
  const transaction = args.state.transactions.get(args.key);
  const after = captureHistorySnapshot(args.state);
  args.state.transactions.delete(args.key);

  if (!transaction || !after) {
    return null;
  }

  return {
    after,
    before: transaction.before,
    domBatch: normalizeHistoryDomBatch(args.domBatch ?? transaction.domBatch),
    domEffect: normalizeHistoryDomEffect(args.domEffect),
  };
}

function finalizeDeferredEntry(args: {
  domBatch?: PageDomMutationBatch | null;
  domEffect?: PagePreparationHistoryDomEffect | null;
  id: number;
  state: HistoryStoreRuntimeState;
}): PagePreparationHistoryEntry | null {
  if (args.state.isApplying) {
    args.state.deferredCommits.delete(args.id);
    return null;
  }

  const deferred = args.state.deferredCommits.get(args.id);
  const after = captureHistorySnapshot(args.state);
  args.state.deferredCommits.delete(args.id);

  if (!deferred || !after) {
    return null;
  }

  return {
    after,
    before: deferred.before,
    domBatch: normalizeHistoryDomBatch(args.domBatch),
    domEffect: normalizeHistoryDomEffect(args.domEffect),
  };
}

function beginHistoryTransaction(
  state: HistoryStoreRuntimeState,
  key: string,
  domBatch: PageDomMutationBatch | null = null
): boolean {
  if (state.isApplying || state.transactions.has(key)) {
    return false;
  }

  const before = captureHistorySnapshot(state);
  if (!before) {
    return false;
  }

  state.transactions.set(key, { before, domBatch });
  notifyHistoryReachabilityChanged(state);
  publishHistoryState(state);
  return true;
}

function cancelHistoryTransaction(state: HistoryStoreRuntimeState, key: string): void {
  if (!state.transactions.has(key)) {
    return;
  }

  state.transactions.delete(key);
  notifyHistoryReachabilityChanged(state);
  publishHistoryState(state);
}

function commitHistoryTransaction(
  state: HistoryStoreRuntimeState,
  key: string,
  domBatch: PageDomMutationBatch | null = null,
  domEffect: PagePreparationHistoryDomEffect | null = null
): void {
  if (state.isApplying) {
    return;
  }

  const hadTransaction = state.transactions.has(key);
  const entry = commitTransactionEntry({ domBatch, domEffect, key, state });
  if (entry) {
    if (!pushHistoryEntry(state, entry)) {
      notifyHistoryReachabilityChanged(state);
      publishHistoryState(state);
    }
    return;
  }

  if (hadTransaction) {
    notifyHistoryReachabilityChanged(state);
    publishHistoryState(state);
  }
}

function createDeferredCommitApi(state: HistoryStoreRuntimeState) {
  return {
    beginDeferredCommit(): number | null {
      return beginDeferredCommitBoundary(state);
    },
    cancelDeferredCommit(id: number): void {
      if (state.deferredCommits.delete(id)) notifyHistoryReachabilityChanged(state);
    },
    finalizeDeferredCommit(
      id: number,
      domBatch: PageDomMutationBatch | null = null,
      domEffect: PagePreparationHistoryDomEffect | null = null
    ): void {
      const entry = finalizeDeferredEntry({ domBatch, domEffect, id, state });
      if (entry) {
        if (!pushHistoryEntry(state, entry)) notifyHistoryReachabilityChanged(state);
      } else {
        notifyHistoryReachabilityChanged(state);
      }
    },
  };
}

function createTransactionCommitApi(state: HistoryStoreRuntimeState) {
  return {
    beginTransaction(key: string, domBatch: PageDomMutationBatch | null = null): boolean {
      return beginHistoryTransaction(state, key, domBatch);
    },
    cancelTransaction(key: string): void {
      cancelHistoryTransaction(state, key);
    },
    clear(): void {
      state.past = [];
      state.future = [];
      state.deferredCommits.clear();
      state.transactions.clear();
      clearHistoryDomLocators();
      state.bridge?.onHistoryCleared?.();
      publishHistoryState(state);
    },
    commitEntry(args: HistoryEntryArgs): void {
      if (state.isApplying) {
        return;
      }

      const entry = createEntryFromArgs(state, args);
      if (entry) {
        if (!pushHistoryEntry(state, entry)) notifyHistoryReachabilityChanged(state);
      }
    },
    commitTransaction(
      key: string,
      domBatch: PageDomMutationBatch | null = null,
      domEffect: PagePreparationHistoryDomEffect | null = null
    ): void {
      commitHistoryTransaction(state, key, domBatch, domEffect);
    },
  };
}

export function createHistoryStoreCommitApi(state: HistoryStoreRuntimeState) {
  return {
    ...createDeferredCommitApi(state),
    ...createTransactionCommitApi(state),
  };
}
