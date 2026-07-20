import { expect, it, vi } from 'vitest';

vi.mock('fabric', async () => await import('./fabric-brush.test-support'));

import { Point } from 'fabric';
import {
  consumeCommittedFreehandPoints,
  consumeCommittedFreehandStrokeSamples,
} from './brush-committed';
import { EditorFreehandBrush } from './brush/instance';
import {
  createFreehandBrushCanvas,
  createFreehandBrushPointerEvent,
} from './brush-committed.test-support';

it('reads committed points and stroke samples from brush prototype methods', () => {
  expect(consumeCommittedFreehandPoints(null)).toBeNull();
  expect(consumeCommittedFreehandStrokeSamples(null)).toBeNull();

  const brush = new EditorFreehandBrush(createFreehandBrushCanvas());
  brush.onMouseDown(new Point(1, 2), createFreehandBrushPointerEvent(10));
  brush.onMouseMove(new Point(3, 4), createFreehandBrushPointerEvent(40));
  brush.onMouseUp(createFreehandBrushPointerEvent(190));

  expect(consumeCommittedFreehandPoints(brush)).toEqual([
    { x: 1, y: 2 },
    { x: 3, y: 4 },
  ]);
  expect(consumeCommittedFreehandStrokeSamples(brush)).toEqual([
    { t: 10, x: 1, y: 2 },
    { t: 40, x: 3, y: 4 },
  ]);
});
