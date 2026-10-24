import { selectHistoryRetentionWindow } from '@sniptale/foundation/history/retention';

/** Product Undo+Redo budget; adapters retain current content independently. */
export const EDITOR_HISTORY_LIMITS = Object.freeze({ maxActions: 50, maxBytes: 8 * 1024 * 1024 });

/** Previous committed Scenario checkpoints have a separate budget from user Undo. */
export const SCENARIO_SAVED_VERSION_LIMITS = Object.freeze({
  maxActions: 20,
  maxBytes: 16 * 1024 * 1024,
});

/** Measure the current snapshot and both navigation directions under the common product budget. */
export function selectEditorSnapshotWindow<Snapshot>(
  snapshots: readonly Snapshot[],
  cursor: number,
  measureSnapshot: (snapshot: Snapshot) => number = (snapshot) => {
    const serialized = JSON.stringify(snapshot);
    return serialized !== undefined && serialized.length > EDITOR_HISTORY_LIMITS.maxBytes
      ? EDITOR_HISTORY_LIMITS.maxBytes + 1
      : new TextEncoder().encode(serialized).byteLength;
  }
) {
  const sizes = new Map<number, number>();
  const measure = (index: number) => {
    const cached = sizes.get(index);
    if (cached !== undefined) return cached;
    const size = measureSnapshot(snapshots[index]!);
    sizes.set(index, size);
    return size;
  };
  return selectHistoryRetentionWindow(
    snapshots.slice(0, -1).map(() => ({ actions: 1, bytes: 0 })),
    cursor,
    EDITOR_HISTORY_LIMITS,
    (start, end) => {
      let bytes = measure(cursor);
      for (let index = start; index <= end; index++) {
        if (bytes > EDITOR_HISTORY_LIMITS.maxBytes) return bytes;
        if (index !== cursor) bytes += measure(index);
      }
      return bytes;
    }
  );
}
