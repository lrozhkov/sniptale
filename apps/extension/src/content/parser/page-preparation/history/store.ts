import { createLogger } from '@sniptale/platform/observability/logger';
import {
  applyHistoryEntry,
  getPagePreparationHistoryDomain,
  isHistoryDomainBlocked,
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
import { hasExactHistoryLocatorBinding } from './dom-locators';
import type {
  PagePreparationChangeScope,
  PagePreparationHistoryBridge,
  PagePreparationHistoryState,
  PagePreparationHistoryDomain,
  PagePreparationDomElement,
  PageDomElementState,
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
    /** Reads the original rich-text baseline from applied canonical text history. */
    getTextBaseline(target: PagePreparationDomElement): PageDomElementState | null {
      if (!target.isConnected) return null;
      for (const entry of state.past) {
        if (entry.scope !== 'content-editing') continue;
        const patch = entry.domBatch?.patches.find(
          (candidate) =>
            candidate.target === target && candidate.before.html !== candidate.after.html
        );
        if (patch) {
          return hasExactHistoryLocatorBinding(target, patch.locator)
            ? { html: patch.before.html, attributes: { ...patch.before.attributes } }
            : null;
        }
      }
      return null;
    },
    getState(domain?: PagePreparationHistoryDomain): PagePreparationHistoryState {
      return readHistoryState(state, domain);
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
    redo(domain?: PagePreparationHistoryDomain): void {
      if (
        state.isApplying ||
        (domain !== undefined &&
          (state.transactions.size > 0 ||
            state.deferredCommits.size > 0 ||
            isHistoryDomainBlocked(state, domain) ||
            state.past.some((entry) => entry.domEffect?.recoveryOnly === true)))
      ) {
        return;
      }
      const previousPast = state.past;
      const previousFuture = state.future;
      const index =
        domain === undefined
          ? 0
          : previousFuture.findIndex(
              (entry) => getPagePreparationHistoryDomain(entry.scope) === domain
            );
      const next = previousFuture[index];
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
            ? [...previousFuture.slice(0, index), outcome.entry, ...previousFuture.slice(index + 1)]
            : previousFuture
          : [...previousFuture.slice(0, index), ...previousFuture.slice(index + 1)];

      notifyHistoryReachabilityChanged(state);
      publishHistoryState(state);
    },
    undo(domain?: PagePreparationHistoryDomain): void {
      if (
        state.isApplying ||
        (domain !== undefined &&
          (state.transactions.size > 0 ||
            state.deferredCommits.size > 0 ||
            isHistoryDomainBlocked(state, domain)))
      ) {
        return;
      }
      const previousPast = state.past;
      const previousFuture = state.future;
      const index =
        domain === undefined
          ? previousPast.length - 1
          : previousPast.findLastIndex(
              (entry) => getPagePreparationHistoryDomain(entry.scope) === domain
            );
      const next = previousPast[index];
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
            ? [...previousPast.slice(0, index), ...previousPast.slice(index + 1), outcome.entry]
            : [...previousPast, outcome.entry]
          : [...previousPast.slice(0, index), ...previousPast.slice(index + 1)];
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
