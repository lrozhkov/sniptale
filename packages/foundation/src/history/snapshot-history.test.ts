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
  it('keeps the existing 80-snapshot default for consumers without a product policy', () => {
    const history = new SnapshotHistory('start');
    for (let index = 0; index < 100; index++) history.push(String(index));
    expect(history.getSnapshots()).toHaveLength(80);
  });
  it('uses owner-measured UTF8 bytes and preserves an oversized current snapshot', () => {
    const encoder = new TextEncoder();
    const history = new SnapshotHistory('a', {
      limit: 51,
      maxBytes: 4,
      measureBytes: (values) =>
        values.reduce((sum, value) => sum + encoder.encode(value).byteLength, 0),
    });
    history.push('界');
    expect(history.getSnapshots()).toEqual(['a', '界']);
    history.push('界界');
    expect(history.getSnapshots()).toEqual(['界界']);
    expect(history.getCurrent()).toBe('界界');
    expect(history.undo()).toBeNull();
  });
  it('measures one shared value once and preserves combined Undo/Redo after movement', () => {
    const history = new SnapshotHistory(
      { id: 0, source: 'shared' },
      {
        limit: 51,
        maxBytes: 100,
        measureBytes: (values) =>
          values.length + new Set(values.map((value) => value.source)).size * 90,
      }
    );
    for (let id = 1; id <= 9; id++) history.push({ id, source: 'shared' });
    expect(history.getState()).toMatchObject({ size: 10, index: 9 });
    expect(history.undo()?.current.id).toBe(8);
    expect(history.redo()?.current.id).toBe(9);
    history.push({ id: 10, source: 'new source' });
    expect(history.getState()).toMatchObject({ size: 1, index: 0, current: { id: 10 } });
  });
  it('ignores duplicate snapshots, truncates redo history, and respects the limit', () => {
    const history = new SnapshotHistory('a', { limit: 2 });

    expect(history.push('a')).toEqual(history.getState());

    history.push('b');
    history.push('c');

    expect(history.getSnapshots()).toEqual(['b', 'c']);

    expect(history.getState()).toEqual({
      canRedo: false,
      canUndo: true,
      current: 'c',
      index: 1,
      size: 2,
    });

    expect(history.undo()?.current).toBe('b');
    history.push('d');

    expect(history.getSnapshots()).toEqual(['b', 'd']);

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
