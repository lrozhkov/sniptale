import { cloneHistorySnapshot } from './clone';
import { selectHistoryRetentionWindow } from './retention';

interface SnapshotHistoryState<T> {
  current: T;
  canUndo: boolean;
  canRedo: boolean;
  index: number;
  size: number;
}

interface SnapshotHistoryOptions<T> {
  limit?: number;
  maxBytes?: number;
  /** Includes shared owner-held values once; an isolated current snapshot is always retained. */
  measureBytes?: (snapshots: readonly T[]) => number;
}

/**
 * Универсальная история снимков состояния.
 * Подходит для Fabric JSON, Zustand-state сериализации и других snapshot-based сценариев.
 */

function shouldTreatSnapshotsAsDistinct<T>(left: T, right: T): boolean {
  return left !== null && typeof left === 'object' && Object.is(left, right);
}

export class SnapshotHistory<T> {
  private readonly limit: number;
  private stack: T[];
  private index: number;
  private readonly maxBytes: number | undefined;
  private readonly measureBytes: ((snapshots: readonly T[]) => number) | undefined;

  constructor(initialSnapshot: T, options: SnapshotHistoryOptions<T> = {}) {
    this.limit = Math.max(1, options.limit ?? 80);
    this.stack = [cloneHistorySnapshot(initialSnapshot)];
    this.index = 0;
    if (
      options.maxBytes !== undefined &&
      (!Number.isSafeInteger(options.maxBytes) || options.maxBytes < 0 || !options.measureBytes)
    )
      throw new RangeError('Snapshot byte limit needs an owner measurement.');
    this.maxBytes = options.maxBytes;
    this.measureBytes = options.measureBytes;
  }

  private retain(stack: T[], cursor: number): void {
    const entries = stack.slice(0, -1).map(() => ({ actions: 1, bytes: 0 }));
    const measure = this.measureBytes;
    const window = selectHistoryRetentionWindow(
      entries,
      cursor,
      {
        maxActions: this.limit - 1,
        maxBytes: this.maxBytes ?? Number.MAX_SAFE_INTEGER,
      },
      this.maxBytes !== undefined && measure
        ? (start, end) => measure(stack.slice(start, end + 1))
        : undefined
    );
    this.stack = stack.slice(window.start, window.end + 1);
    this.index = window.cursor;
  }

  private readSnapshot(index: number): T {
    const snapshot = this.stack[index];
    if (snapshot === undefined) {
      throw new Error(`Snapshot history index ${index} is out of bounds`);
    }

    return snapshot;
  }

  getState(): SnapshotHistoryState<T> {
    return {
      current: cloneHistorySnapshot(this.readSnapshot(this.index)),
      canUndo: this.index > 0,
      canRedo: this.index < this.stack.length - 1,
      index: this.index,
      size: this.stack.length,
    };
  }

  getCurrent(): T {
    return cloneHistorySnapshot(this.readSnapshot(this.index));
  }

  /** Returns retained snapshots for owners that keep resources outside the snapshot stack. */
  getSnapshots(): T[] {
    return this.stack.map((snapshot) => cloneHistorySnapshot(snapshot));
  }

  reset(snapshot: T): SnapshotHistoryState<T> {
    this.stack = [cloneHistorySnapshot(snapshot)];
    this.index = 0;
    return this.getState();
  }

  push(snapshot: T): SnapshotHistoryState<T> {
    const current = this.readSnapshot(this.index);
    if (!shouldTreatSnapshotsAsDistinct(current, snapshot) && current === snapshot) {
      return this.getState();
    }

    const nextStack = this.stack.slice(0, this.index + 1);
    nextStack.push(cloneHistorySnapshot(snapshot));

    this.retain(nextStack, nextStack.length - 1);
    return this.getState();
  }

  undo(): SnapshotHistoryState<T> | null {
    if (this.index === 0) {
      return null;
    }
    this.index -= 1;
    this.retain(this.stack, this.index);
    return this.getState();
  }

  redo(): SnapshotHistoryState<T> | null {
    if (this.index >= this.stack.length - 1) {
      return null;
    }
    this.index += 1;
    this.retain(this.stack, this.index);
    return this.getState();
  }
}
