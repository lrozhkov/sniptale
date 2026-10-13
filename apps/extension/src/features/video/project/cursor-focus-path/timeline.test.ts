import { expect, it } from 'vitest';
import {
  reviewCursorFocusTimelineKeys,
  layoutCursorFocusKeyGroups,
  adjacentCursorFocusKey,
} from './timeline';
import type { CursorFocusPath } from './types';
const path: CursorFocusPath = {
  version: 1,
  mode: 'fixed',
  smoothing: 0.5,
  sensitivity: 0.5,
  gapPolicy: 'hold',
  segments: [
    {
      id: 'run',
      binding: { kind: 'project' },
      start: 0,
      end: 2,
      keys: [
        { id: 'auto', time: 0, x: 0.2, y: 0.2, anchor: 'boundary', interpolation: 'smooth' },
        { id: 'manual', time: 0, x: 0.5, y: 0.5, anchor: 'manual', interpolation: 'smooth' },
        { id: 'end', time: 2, x: 0.8, y: 0.8, anchor: 'boundary', interpolation: 'smooth' },
      ],
    },
  ],
};
it('retains every coincident automatic and authored key through grouping and navigation', () => {
  const keys = reviewCursorFocusTimelineKeys(path);
  const grouped = layoutCursorFocusKeyGroups(keys, 10);
  expect(grouped).toHaveLength(1);
  expect(grouped[0]!.members.map((key) => key.id)).toEqual(['auto', 'manual', 'end']);
  expect(layoutCursorFocusKeyGroups(keys, 100)).toHaveLength(2);
  expect(adjacentCursorFocusKey(keys, 'auto', 0, 1)?.id).toBe('manual');
  expect(adjacentCursorFocusKey(keys, 'manual', 0, -1)?.id).toBe('auto');
  expect(adjacentCursorFocusKey(keys, 'end', 2, 1)).toBeNull();
  expect(path.segments[0]!.keys).toHaveLength(3);
});
