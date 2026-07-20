import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  applyImageSettings: vi.fn(),
  isImageLayerStyleObject: vi.fn(),
}));

vi.mock('../../../objects/image-style', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../objects/image-style')>()),
  applyImageSettings: mocks.applyImageSettings,
  isImageLayerStyleObject: mocks.isImageLayerStyleObject,
}));

import { applyImageLayerSettings } from './image';

it('applies image settings only to image-style objects', () => {
  const image = { id: 'image' };
  const shape = { id: 'shape' };
  mocks.isImageLayerStyleObject.mockImplementation((object) => object === image);

  applyImageLayerSettings([image, shape] as never, { borderRadius: 4 } as never);

  expect(mocks.applyImageSettings).toHaveBeenCalledWith(image, { borderRadius: 4 });
  expect(mocks.applyImageSettings).toHaveBeenCalledTimes(1);
});
