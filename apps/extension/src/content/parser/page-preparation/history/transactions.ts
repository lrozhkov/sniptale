import { storeHelperFns } from './store.helpers';
import type { HistoryStoreInternals } from './store.internals';
import type {
  FrameSessionSnapshot,
  PageDomMutationBatch,
  PagePreparationHistoryEntry,
} from './types';

type HistoryEntryArgs = {
  after?: FrameSessionSnapshot | null;
  before?: FrameSessionSnapshot | null;
  domBatch?: PageDomMutationBatch | null;
};

function createEntryFromArgs(
  state: HistoryStoreInternals,
  args: HistoryEntryArgs
): PagePreparationHistoryEntry | null {
  const before = args.before ?? storeHelperFns.captureSnapshot(state);
  const after = args.after ?? storeHelperFns.captureSnapshot(state);
  if (!before || !after) {
    return null;
  }

  return {
    after,
    before,
    domBatch: storeHelperFns.normalizeDomBatch(args.domBatch),
  };
}

function beginDeferredCommitBoundary(state: HistoryStoreInternals): number | null {
  if (state.isApplying) {
    return null;
  }

  const before = storeHelperFns.captureSnapshot(state);
  if (!before) {
    return null;
  }

  state.deferredCommitId += 1;
  state.deferredCommits.set(state.deferredCommitId, {
    before,
    id: state.deferredCommitId,
  });
  return state.deferredCommitId;
}

function commitTransactionEntry(args: {
  domBatch?: PageDomMutationBatch | null;
  key: string;
  state: HistoryStoreInternals;
}): PagePreparationHistoryEntry | null {
  const transaction = args.state.transactions.get(args.key);
  const after = storeHelperFns.captureSnapshot(args.state);
  args.state.transactions.delete(args.key);

  if (!transaction || !after) {
    return null;
  }

  return {
    after,
    before: transaction.before,
    domBatch: storeHelperFns.normalizeDomBatch(args.domBatch ?? transaction.domBatch),
  };
}

function finalizeDeferredEntry(args: {
  domBatch?: PageDomMutationBatch | null;
  id: number;
  state: HistoryStoreInternals;
}): PagePreparationHistoryEntry | null {
  if (args.state.isApplying) {
    args.state.deferredCommits.delete(args.id);
    return null;
  }

  const deferred = args.state.deferredCommits.get(args.id);
  const after = storeHelperFns.captureSnapshot(args.state);
  args.state.deferredCommits.delete(args.id);

  if (!deferred || !after) {
    return null;
  }

  return {
    after,
    before: deferred.before,
    domBatch: storeHelperFns.normalizeDomBatch(args.domBatch),
  };
}

function beginHistoryTransaction(
  state: HistoryStoreInternals,
  key: string,
  domBatch: PageDomMutationBatch | null = null
): void {
  if (state.isApplying || state.transactions.has(key)) {
    return;
  }

  const before = storeHelperFns.captureSnapshot(state);
  if (!before) {
    return;
  }

  state.transactions.set(key, { before, domBatch });
  storeHelperFns.publishState(state);
}

function cancelHistoryTransaction(state: HistoryStoreInternals, key: string): void {
  if (!state.transactions.has(key)) {
    return;
  }

  state.transactions.delete(key);
  storeHelperFns.publishState(state);
}

function commitHistoryTransaction(
  state: HistoryStoreInternals,
  key: string,
  domBatch: PageDomMutationBatch | null = null
): void {
  if (state.isApplying) {
    return;
  }

  const hadTransaction = state.transactions.has(key);
  const entry = commitTransactionEntry({ domBatch, key, state });
  if (entry) {
    if (!storeHelperFns.pushEntry(state, entry)) {
      storeHelperFns.publishState(state);
    }
    return;
  }

  if (hadTransaction) {
    storeHelperFns.publishState(state);
  }
}

function createDeferredCommitApi(state: HistoryStoreInternals) {
  return {
    beginDeferredCommit(): number | null {
      return beginDeferredCommitBoundary(state);
    },
    cancelDeferredCommit(id: number): void {
      state.deferredCommits.delete(id);
    },
    finalizeDeferredCommit(id: number, domBatch: PageDomMutationBatch | null = null): void {
      const entry = finalizeDeferredEntry({ domBatch, id, state });
      if (entry) {
        storeHelperFns.pushEntry(state, entry);
      }
    },
  };
}

function createTransactionCommitApi(state: HistoryStoreInternals) {
  return {
    beginTransaction(key: string, domBatch: PageDomMutationBatch | null = null): void {
      beginHistoryTransaction(state, key, domBatch);
    },
    cancelTransaction(key: string): void {
      cancelHistoryTransaction(state, key);
    },
    clear(): void {
      state.past = [];
      state.future = [];
      state.deferredCommits.clear();
      state.transactions.clear();
      storeHelperFns.publishState(state);
    },
    commitEntry(args: HistoryEntryArgs): void {
      if (state.isApplying) {
        return;
      }

      const entry = createEntryFromArgs(state, args);
      if (entry) {
        storeHelperFns.pushEntry(state, entry);
      }
    },
    commitTransaction(key: string, domBatch: PageDomMutationBatch | null = null): void {
      commitHistoryTransaction(state, key, domBatch);
    },
  };
}

export function createHistoryStoreCommitApi(state: HistoryStoreInternals) {
  return {
    ...createDeferredCommitApi(state),
    ...createTransactionCommitApi(state),
  };
}
