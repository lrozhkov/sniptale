import { createLogger } from '@sniptale/platform/observability/logger';
import {
  applyHistoryEntry,
  createHistoryStoreState,
  notifyHistoryReachabilityChanged,
  publishHistoryState,
  readHistoryState,
  type HistoryListener,
  type HistoryStoreRuntimeState,
} from './store-state';
import { createHistoryStoreCommitApi } from './transactions';
import type { PagePreparationHistoryBridge, PagePreparationHistoryState } from './types';

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
    hasOpenTransactions(): boolean {
      return state.transactions.size > 0;
    },
    isApplying(): boolean {
      return state.isApplying;
    },
  };
}

function createHistoryStoreNavigationApi(state: HistoryStoreRuntimeState) {
  return {
    redo(): void {
      const previousPast = state.past;
      const previousFuture = state.future;
      const next = previousFuture[0];
      if (!next) {
        return;
      }

      state.future = previousFuture.slice(1);
      state.past = [...previousPast, next];
      if (!applyHistoryEntry('redo', HISTORY_APPLIED_EVENT, next, state)) {
        state.future = previousFuture;
        state.past = previousPast;
        return;
      }

      notifyHistoryReachabilityChanged(state);
      publishHistoryState(state);
    },
    undo(): void {
      const previousPast = state.past;
      const previousFuture = state.future;
      const next = previousPast[previousPast.length - 1];
      if (!next) {
        return;
      }

      state.past = previousPast.slice(0, -1);
      state.future = [next, ...previousFuture];
      if (!applyHistoryEntry('undo', HISTORY_APPLIED_EVENT, next, state)) {
        state.past = previousPast;
        state.future = previousFuture;
        return;
      }

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
