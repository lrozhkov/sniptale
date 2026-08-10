// @vitest-environment jsdom

import { Canvas, Rect } from 'fabric';
import { expect, it, vi } from 'vitest';

vi.mock('../../../document/model', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../document/model')>()),
  isEditableObject: vi.fn(() => true),
}));

import { isStickyAnnotationTool } from './classification';
import { setCanvasObjectInteractivity } from './interactivity';

it('classifies current drawing tools as sticky and retained utility tools as non-sticky', () => {
  expect(
    (['pencil', 'marker', 'shape', 'blur', 'arrow', 'text', 'step'] as const).every((tool) =>
      isStickyAnnotationTool(tool)
    )
  ).toBe(true);
  expect(
    (['select', 'image', 'crop'] as const).every((tool) => !isStickyAnnotationTool(tool))
  ).toBe(true);
});

it('applies all, selection, text, and disabled interactivity modes', () => {
  const selected = new Rect();
  selected.sniptaleId = 'selected';
  selected.sniptaleType = 'shape';
  const text = new Rect();
  text.sniptaleId = 'text';
  text.sniptaleType = 'text';
  const canvas = new Canvas(document.createElement('canvas'));
  canvas.add(selected, text);
  vi.spyOn(canvas, 'getActiveObjects').mockReturnValue([selected]);

  setCanvasObjectInteractivity(canvas, 'selection');
  expect(selected.selectable).toBe(true);
  expect(text.selectable).toBe(false);

  setCanvasObjectInteractivity(canvas, 'text');
  expect(selected.selectable).toBe(false);
  expect(text.selectable).toBe(true);

  setCanvasObjectInteractivity(canvas, 'all');
  expect(selected.evented).toBe(true);
  expect(text.evented).toBe(true);

  setCanvasObjectInteractivity(canvas, 'none');
  expect(selected.evented).toBe(false);
  expect(text.evented).toBe(false);
});
