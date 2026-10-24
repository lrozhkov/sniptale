import { expect, it, vi } from 'vitest';
import { selectHistoryRetentionWindow } from '@sniptale/foundation/history/retention';
import {
  EDITOR_HISTORY_LIMITS,
  SCENARIO_SAVED_VERSION_LIMITS,
  selectEditorSnapshotWindow,
} from './policy';

it('keeps reversible edits and previous saved versions under independent product budgets', () => {
  expect(EDITOR_HISTORY_LIMITS).toEqual({ maxActions: 50, maxBytes: 8 * 1024 * 1024 });
  expect(SCENARIO_SAVED_VERSION_LIMITS).toEqual({ maxActions: 20, maxBytes: 16 * 1024 * 1024 });
  expect(Object.isFrozen(EDITOR_HISTORY_LIMITS)).toBe(true);
  expect(Object.isFrozen(SCENARIO_SAVED_VERSION_LIMITS)).toBe(true);
});

it('rejects an oversized current snapshot without serializing its neighbors or allocating UTF8', () => {
  const current = { text: 'x'.repeat(EDITOR_HISTORY_LIMITS.maxBytes) };
  const stringify = vi.spyOn(JSON, 'stringify');
  const encode = vi.spyOn(TextEncoder.prototype, 'encode');
  try {
    const window = selectEditorSnapshotWindow([{ text: 'before' }, current, { text: 'after' }], 1);
    expect(window.start).toBe(1);
    expect(window.end).toBe(1);
    expect(stringify).toHaveBeenCalledTimes(1);
    expect(stringify).toHaveBeenCalledWith(current);
    expect(encode).not.toHaveBeenCalled();
  } finally {
    stringify.mockRestore();
    encode.mockRestore();
  }
});

it('preserves eager UTF8 retention decisions for mixed sizes, Unicode and both directions', () => {
  const cases = [
    [{ text: 'small' }, { text: '😀'.repeat(500_000) }, { text: 'ю'.repeat(1_000_000) }],
    [{ text: 'x'.repeat(4_000_000) }, { text: 'y'.repeat(4_000_000) }, { text: 'tail' }],
    [{ text: 'x'.repeat(EDITOR_HISTORY_LIMITS.maxBytes) }, { text: 'middle' }, { text: '\ud800' }],
  ];
  for (const snapshots of cases) {
    let bytes = 0;
    const cumulative = snapshots.map(
      (value) => (bytes += new TextEncoder().encode(JSON.stringify(value)).byteLength)
    );
    for (let cursor = 0; cursor < snapshots.length; cursor++) {
      const expected = selectHistoryRetentionWindow(
        snapshots.slice(0, -1).map(() => ({ actions: 1, bytes: 0 })),
        cursor,
        EDITOR_HISTORY_LIMITS,
        (start, end) => cumulative[end]! - (cumulative[start - 1] ?? 0)
      );
      expect(selectEditorSnapshotWindow(snapshots, cursor)).toEqual(expected);
    }
  }
});
