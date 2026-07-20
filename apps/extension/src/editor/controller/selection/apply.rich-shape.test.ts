import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  updateRichShapeObjectStyleMock: vi.fn(),
}));

vi.mock('../../objects/rich-shape', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../objects/rich-shape')>()),
  updateRichShapeObjectStyle: mocks.updateRichShapeObjectStyleMock,
}));

import { applySelectionToolSettingsToObjects } from './apply';

it('projects selection style changes through the rich shape factory seam', () => {
  const shape = { kind: 'rich-shape' };
  const settings = { rectangle: { fillColor: '#fff' } };

  applySelectionToolSettingsToObjects([shape] as never, 'rich-shape', settings as never);

  expect(mocks.updateRichShapeObjectStyleMock).toHaveBeenCalledWith(shape, settings);
});
