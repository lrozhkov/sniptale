import { selectHistoryRetentionWindow } from '@sniptale/foundation/history/retention';

/** Product Undo+Redo budget; adapters retain current content independently. */
export const EDITOR_HISTORY_LIMITS = Object.freeze({ maxActions: 50, maxBytes: 8 * 1024 * 1024 });

/** Previous committed Scenario checkpoints have a separate budget from user Undo. */
export const SCENARIO_SAVED_VERSION_LIMITS = Object.freeze({
  maxActions: 20,
  maxBytes: 16 * 1024 * 1024,
});

/** Measure the current snapshot and both navigation directions under the common product budget. */
export function selectEditorSnapshotWindow(snapshots: readonly unknown[], cursor: number) {
  let bytes = 0;
  const cumulative = snapshots.map(
    (snapshot) => (bytes += new TextEncoder().encode(JSON.stringify(snapshot)).byteLength)
  );
  return selectHistoryRetentionWindow(
    snapshots.slice(0, -1).map(() => ({ actions: 1, bytes: 0 })),
    cursor,
    EDITOR_HISTORY_LIMITS,
    (start, end) => cumulative[end]! - (cumulative[start - 1] ?? 0)
  );
}
