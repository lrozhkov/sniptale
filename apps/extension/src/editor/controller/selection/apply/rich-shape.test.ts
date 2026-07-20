import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  updateRichShapeObjectStyle: vi.fn(),
}));

vi.mock('../../../objects/rich-shape', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../objects/rich-shape')>()),
  updateRichShapeObjectStyle: mocks.updateRichShapeObjectStyle,
}));

import { applyRichShapeSettings } from './rich-shape';

it('applies the full tool settings surface through the rich-shape adapter', () => {
  const shape = { id: 'rich-shape' };
  const settings = { richShape: { fill: '#111111' } };

  applyRichShapeSettings([shape] as never, settings as never);

  expect(mocks.updateRichShapeObjectStyle).toHaveBeenCalledWith(shape, settings);
});
