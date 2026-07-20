import { Point } from 'fabric';
import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  updateRichShapeDraftMock: vi.fn(() => null),
}));

vi.mock('../tools/rich-shape-drawing/resize', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../tools/rich-shape-drawing/resize')>()),
  updateRichShapeDraft: mocks.updateRichShapeDraftMock,
}));

import { updateEditorDrawSessionObject } from './';

it('forwards Shift-constrained rich shape drags to the rich shape draft owner', () => {
  const richShape = { sniptaleType: 'rich-shape' };

  expect(
    updateEditorDrawSessionObject(
      { object: richShape, start: { x: 10, y: 20 }, tool: 'rich-shape' } as never,
      new Point(25, 45),
      { width: 4 } as never,
      { strokeWidth: 4 } as never,
      { amount: 10, blurType: 'gaussian', showBorder: false } as never,
      true
    )
  ).toBeNull();
  expect(mocks.updateRichShapeDraftMock).toHaveBeenCalledWith(
    expect.objectContaining({ object: richShape }),
    new Point(25, 45),
    true
  );
});
