import {
  applyHistoryEntry,
  notifyHistoryReachabilityChanged,
  publishHistoryState,
  type HistoryStoreRuntimeState,
} from './store-state';
import type { PagePreparationChangeScope, PagePreparationHistoryEntry } from './types';

function entryTargets(entry: PagePreparationHistoryEntry) {
  return [
    ...(entry.domBatch?.patches.map((patch) => patch.target) ?? []),
    ...(entry.domEffect?.targets ?? []),
  ];
}

function replacesRetainedTarget(
  removed: readonly PagePreparationHistoryEntry[],
  retained: readonly PagePreparationHistoryEntry[]
): boolean {
  const targets = retained.flatMap(entryTargets);
  return removed.some((entry) =>
    entry.domBatch?.patches.some(
      (patch) =>
        patch.before.html !== patch.after.html &&
        targets.some((target) => target !== patch.target && patch.target.contains(target))
    )
  );
}

function publishReset(state: HistoryStoreRuntimeState): void {
  notifyHistoryReachabilityChanged(state);
  publishHistoryState(state);
}

function retainRecovery(
  state: HistoryStoreRuntimeState,
  outcome: ReturnType<typeof applyHistoryEntry>
): void {
  if (outcome.status === 'recovery') state.past = [...state.past, outcome.entry];
}

function restoreSuccessfulUndos(
  state: HistoryStoreRuntimeState,
  appliedEvent: string,
  undone: readonly PagePreparationHistoryEntry[]
): void {
  const restore = [...undone].reverse();
  for (const [index, entry] of restore.entries()) {
    const outcome = applyHistoryEntry('redo', appliedEvent, entry, state);
    if (outcome.status !== 'applied') {
      retainRecovery(state, outcome);
      // Later entries can depend on this restoration; retain only factual successful progress.
      const notRestored = new Set(restore.slice(index));
      state.past = state.past.filter((candidate) => !notRestored.has(candidate));
      state.future = [];
      return;
    }
  }
}

/** Undo only this producer's applied changes; never notify global clear subscribers. */
export function resetHistoryScope(
  state: HistoryStoreRuntimeState,
  scope: PagePreparationChangeScope,
  appliedEvent: string
): boolean {
  if (state.isApplying || state.transactions.size || state.deferredCommits.size) return false;
  const removed = state.past.filter((entry) => entry.scope === scope);
  const retained = state.past.filter((entry) => entry.scope !== scope);
  if (replacesRetainedTarget(removed, retained)) return false;
  const undone: PagePreparationHistoryEntry[] = [];
  for (const entry of [...removed].reverse()) {
    const outcome = applyHistoryEntry('undo', appliedEvent, entry, state);
    if (outcome.status !== 'applied') {
      retainRecovery(state, outcome);
      restoreSuccessfulUndos(state, appliedEvent, undone);
      publishReset(state);
      return false;
    }
    undone.push(entry);
  }
  state.past = retained;
  state.future = [];
  publishReset(state);
  return true;
}
