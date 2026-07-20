/* eslint-disable max-lines-per-function --
   exact snapshot-history proof keeps navigation and limit semantics together */
import { describe, expect, it } from 'vitest';
import { SnapshotHistory } from './snapshot-history';

describe('SnapshotHistory navigation', () => {
  it('tracks pushes, undo, redo, and reset state', () => {
    const history = new SnapshotHistory('initial');

    expect(history.getState()).toEqual({
      canRedo: false,
      canUndo: false,
      current: 'initial',
      index: 0,
      size: 1,
    });

    history.push('next');
    expect(history.getCurrent()).toBe('next');
    expect(history.undo()).toEqual(
      expect.objectContaining({
        canRedo: true,
        canUndo: false,
        current: 'initial',
      })
    );
    expect(history.redo()).toEqual(
      expect.objectContaining({
        canRedo: false,
        canUndo: true,
        current: 'next',
      })
    );
    expect(history.reset('reset')).toEqual({
      canRedo: false,
      canUndo: false,
      current: 'reset',
      index: 0,
      size: 1,
    });
  });
});

describe('SnapshotHistory limits', () => {
  it('ignores duplicate snapshots, truncates redo history, and respects the limit', () => {
    const history = new SnapshotHistory('a', { limit: 2 });

    expect(history.push('a')).toEqual(history.getState());

    history.push('b');
    history.push('c');

    expect(history.getState()).toEqual({
      canRedo: false,
      canUndo: true,
      current: 'c',
      index: 1,
      size: 2,
    });

    expect(history.undo()?.current).toBe('b');
    history.push('d');

    expect(history.getState()).toEqual({
      canRedo: false,
      canUndo: true,
      current: 'd',
      index: 1,
      size: 2,
    });
    expect(history.redo()).toBeNull();
    expect(history.undo()?.current).toBe('b');
    expect(history.undo()).toBeNull();
  });

  it('treats object snapshots as distinct even when the same reference is pushed again', () => {
    const snapshot = { value: 'a' };
    const history = new SnapshotHistory(snapshot);

    snapshot.value = 'b';
    history.push(snapshot);

    expect(history.getState()).toEqual({
      canRedo: false,
      canUndo: true,
      current: { value: 'b' },
      index: 1,
      size: 2,
    });
    expect(history.undo()?.current).toEqual({ value: 'a' });
  });

  it('clamps the limit to one snapshot and drops older entries once the cap is exceeded', () => {
    const history = new SnapshotHistory('a', { limit: 0 });

    history.push('b');

    expect(history.getState()).toEqual({
      canRedo: false,
      canUndo: false,
      current: 'b',
      index: 0,
      size: 1,
    });
  });
});
