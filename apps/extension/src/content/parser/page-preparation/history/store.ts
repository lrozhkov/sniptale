import { createLogger } from '@sniptale/platform/observability/logger';
import { storeHelperFns } from './store.helpers';
import {
  createHistoryStoreInternals,
  type HistoryListener,
  type HistoryStoreInternals,
} from './store.internals';
import { createHistoryStoreCommitApi } from './transactions';
import type { PagePreparationHistoryBridge, PagePreparationHistoryState } from './types';

const HISTORY_APPLIED_EVENT = 'sniptale-page-preparation-history-applied';
const logger = createLogger({ namespace: 'ContentPagePreparationHistory' });

export function addPagePreparationHistoryAppliedListener(listener: () => void): () => void {
  window.addEventListener(HISTORY_APPLIED_EVENT, listener);
  return () => window.removeEventListener(HISTORY_APPLIED_EVENT, listener);
}

function createHistoryStoreMutationApi(state: HistoryStoreInternals) {
  return {
    ...createHistoryStoreStateApi(state),
    ...createHistoryStoreCommitApi(state),
  };
}

function createHistoryStoreStateApi(state: HistoryStoreInternals) {
  return {
    getState(): PagePreparationHistoryState {
      return storeHelperFns.getHistoryState(state);
    },
    hasOpenTransactions(): boolean {
      return state.transactions.size > 0;
    },
    isApplying(): boolean {
      return state.isApplying;
    },
  };
}

function createHistoryStoreNavigationApi(state: HistoryStoreInternals) {
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
      if (!storeHelperFns.applyEntry('redo', HISTORY_APPLIED_EVENT, next, state)) {
        state.future = previousFuture;
        state.past = previousPast;
        return;
      }

      storeHelperFns.publishState(state);
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
      if (!storeHelperFns.applyEntry('undo', HISTORY_APPLIED_EVENT, next, state)) {
        state.past = previousPast;
        state.future = previousFuture;
        return;
      }

      storeHelperFns.publishState(state);
    },
  };
}

function createHistoryStoreSubscriptionApi(state: HistoryStoreInternals) {
  return {
    addPagePreparationHistoryAppliedListener,
    registerBridge(nextBridge: PagePreparationHistoryBridge): void {
      state.bridge = nextBridge;
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
  const state = createHistoryStoreInternals();

  return {
    ...createHistoryStoreMutationApi(state),
    ...createHistoryStoreNavigationApi(state),
    ...createHistoryStoreSubscriptionApi(state),
  };
}
