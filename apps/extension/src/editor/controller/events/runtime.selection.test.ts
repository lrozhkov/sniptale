// @vitest-environment jsdom

import { ActiveSelection, Canvas, Rect } from 'fabric';
import { expect, it, vi } from 'vitest';
import { createEditorDrawingFabricObject } from '../../drawing/object/vector';
import { createSelectionChangeHandler } from './runtime.selection';

function createDrawingShape(id: string, x: number) {
  return createEditorDrawingFabricObject(
    {
      bounds: { height: 40, width: 60, x, y: 20 },
      color: '#111111',
      fillColor: null,
      id,
      kind: 'rectangle',
      width: 4,
    },
    1
  );
}

it('restores generic chrome when an all-drawing ActiveSelection becomes mixed', () => {
  const canvas = new Canvas(document.createElement('canvas'));
  const first = createDrawingShape('shape-1', 10);
  const second = createDrawingShape('shape-2', 90);
  const ordinary = new Rect({ height: 40, width: 40 });
  canvas.add(first, second, ordinary);
  const selection = new ActiveSelection([first, second], { canvas });
  canvas.setActiveObject(selection);
  const handleSelectionChange = createSelectionChangeHandler({
    getCanvas: () => canvas,
    syncRuntimeState: vi.fn(),
  });

  handleSelectionChange();
  expect(selection.borderColor).toBe('#2563eb');
  expect(selection.hasControls).toBe(false);

  selection.add(ordinary);
  handleSelectionChange();
  expect(selection.borderColor).toBe('#f97316');
  expect(selection.borderDashArray).toBeNull();
  expect(selection.hasControls).toBe(true);
  canvas.dispose();
});
