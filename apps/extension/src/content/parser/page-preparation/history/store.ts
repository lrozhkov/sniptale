import { createLogger } from '@sniptale/platform/observability/logger';
import {
  applyHistoryEntry,
  createHistoryStoreState,
  notifyHistoryReachabilityChanged,
  publishHistoryState,
  readHistoryState,
  snapshotsEqual,
  captureHistorySnapshot,
  type HistoryClearListener,
  type HistoryListener,
  type HistoryStoreRuntimeState,
} from './store-state';
import { createHistoryStoreCommitApi } from './transactions';
import { resetHistoryScope } from './scoped-reset';
import { applyScopedSnapshotDelta } from './snapshot-delta';
import { hasDomMutationChanges } from './dom-delta';
import type {
  PagePreparationChangeScope,
  PagePreparationHistoryBridge,
  PagePreparationHistoryState,
} from './types';

const HISTORY_APPLIED_EVENT = 'sniptale-page-preparation-history-applied';
const logger = createLogger({ namespace: 'ContentPagePreparationHistory' });

export function addPagePreparationHistoryAppliedListener(listener: () => void): () => void {
  window.addEventListener(HISTORY_APPLIED_EVENT, listener);
  return () => window.removeEventListener(HISTORY_APPLIED_EVENT, listener);
}

function createHistoryStoreMutationApi(state: HistoryStoreRuntimeState) {
  return {
    ...createHistoryStoreStateApi(state),
    ...createHistoryStoreCommitApi(state),
  };
}

function createHistoryStoreStateApi(state: HistoryStoreRuntimeState) {
  return {
    getState(): PagePreparationHistoryState {
      return readHistoryState(state);
    },
    hasOpenTransactions(scope?: PagePreparationChangeScope): boolean {
      return [...state.transactions.values()].some(
        (pending) => scope === undefined || pending.scope === scope
      );
    },
    hasChanges(scope?: PagePreparationChangeScope): boolean {
      if (scope === undefined) return state.past.length > 0;
      const entries = state.past.filter((entry) => entry.scope === scope);
      const first = entries[0];
      const current = captureHistorySnapshot(state);
      if (!first || !current) return false;
      return (
        !snapshotsEqual(current, applyScopedSnapshotDelta(current, first.before, current, scope)) ||
        hasDomMutationChanges(entries.map((entry) => entry.domBatch)) ||
        entries.some(
          (entry) =>
            entry.domEffect?.hasCurrentChanges?.() ?? entry.domEffect?.recoveryOnly === true
        )
      );
    },
    resetScope(scope: PagePreparationChangeScope): boolean {
      return resetHistoryScope(state, scope, HISTORY_APPLIED_EVENT);
    },
    hasPendingSnapshotChanges(scope?: PagePreparationChangeScope): boolean {
      const current = captureHistorySnapshot(state);
      if (!current) return false;
      return [...state.transactions.values(), ...state.deferredCommits.values()].some(
        (pending) =>
          (scope === undefined || pending.scope === scope) &&
          !snapshotsEqual(
            current,
            applyScopedSnapshotDelta(current, pending.before, current, pending.scope)
          )
      );
    },
    isApplying(): boolean {
      return state.isApplying;
    },
  };
}

function createHistoryStoreNavigationApi(state: HistoryStoreRuntimeState) {
  return {
    redo(): void {
      if (state.isApplying) {
        return;
      }
      const previousPast = state.past;
      const previousFuture = state.future;
      const next = previousFuture[0];
      if (!next) {
        return;
      }

      const outcome = applyHistoryEntry('redo', HISTORY_APPLIED_EVENT, next, state);
      if (outcome.status === 'unchanged') {
        return;
      }
      state.past =
        outcome.status === 'recovery'
          ? outcome.replaceCurrent
            ? previousPast
            : [...previousPast, outcome.entry]
          : [...previousPast, next];
      state.future =
        outcome.status === 'recovery'
          ? outcome.replaceCurrent
            ? [outcome.entry, ...previousFuture.slice(1)]
            : previousFuture
          : previousFuture.slice(1);

      notifyHistoryReachabilityChanged(state);
      publishHistoryState(state);
    },
    undo(): void {
      if (state.isApplying) {
        return;
      }
      const previousPast = state.past;
      const previousFuture = state.future;
      const next = previousPast[previousPast.length - 1];
      if (!next) {
        return;
      }

      const outcome = applyHistoryEntry('undo', HISTORY_APPLIED_EVENT, next, state);
      if (outcome.status === 'unchanged') {
        return;
      }
      state.past =
        outcome.status === 'recovery'
          ? outcome.replaceCurrent
            ? [...previousPast.slice(0, -1), outcome.entry]
            : [...previousPast, outcome.entry]
          : previousPast.slice(0, -1);
      state.future =
        outcome.status === 'recovery' || next.domEffect?.recoveryOnly
          ? previousFuture
          : [next, ...previousFuture];

      notifyHistoryReachabilityChanged(state);
      publishHistoryState(state);
    },
  };
}

function createHistoryStoreSubscriptionApi(state: HistoryStoreRuntimeState) {
  return {
    addPagePreparationHistoryAppliedListener,
    registerBridge(nextBridge: PagePreparationHistoryBridge): void {
      state.bridge = nextBridge;
      notifyHistoryReachabilityChanged(state);
      logger.debug('Registered page preparation history bridge');
    },
    subscribe(listener: HistoryListener): () => void {
      state.listeners.add(listener);
      return () => {
        state.listeners.delete(listener);
      };
    },
    subscribeToClear(listener: HistoryClearListener): () => void {
      state.clearListeners.add(listener);
      return () => {
        state.clearListeners.delete(listener);
      };
    },
    unregisterBridge(nextBridge: PagePreparationHistoryBridge): void {
      if (state.bridge !== nextBridge) {
        return;
      }

      state.bridge = null;
    },
  };
}

export function createPagePreparationHistoryStore() {
  const state = createHistoryStoreState();

  return {
    ...createHistoryStoreMutationApi(state),
    ...createHistoryStoreNavigationApi(state),
    ...createHistoryStoreSubscriptionApi(state),
  };
}
