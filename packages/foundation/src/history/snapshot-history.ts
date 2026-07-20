import { cloneHistorySnapshot } from './clone';

interface SnapshotHistoryState<T> {
  current: T;
  canUndo: boolean;
  canRedo: boolean;
  index: number;
  size: number;
}

interface SnapshotHistoryOptions {
  limit?: number;
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

  constructor(initialSnapshot: T, options: SnapshotHistoryOptions = {}) {
    this.limit = Math.max(1, options.limit ?? 80);
    this.stack = [cloneHistorySnapshot(initialSnapshot)];
    this.index = 0;
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

    if (nextStack.length > this.limit) {
      nextStack.splice(0, nextStack.length - this.limit);
    }

    this.stack = nextStack;
    this.index = this.stack.length - 1;
    return this.getState();
  }

  undo(): SnapshotHistoryState<T> | null {
    if (this.index === 0) {
      return null;
    }
    this.index -= 1;
    return this.getState();
  }

  redo(): SnapshotHistoryState<T> | null {
    if (this.index >= this.stack.length - 1) {
      return null;
    }
    this.index += 1;
    return this.getState();
  }
}
