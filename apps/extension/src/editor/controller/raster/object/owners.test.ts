// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';

const utilityMocks = vi.hoisted(() => ({
  isSourceObject: vi.fn(() => false),
}));

vi.mock('../../../document/model', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../document/model')>()),
  isSourceObject: utilityMocks.isSourceObject,
}));

import { copyRasterReplacementMetadata } from './metadata';
import { getReplacementScale } from './scale';
import { getRasterReplacementType } from './type';

it('keeps raster replacement scale math in the scale owner', () => {
  const bitmap = document.createElement('canvas');
  bitmap.width = 50;
  bitmap.height = 0;

  expect(getReplacementScale({ getScaledWidth: () => 200, scaleX: 1 } as never, bitmap, 'x')).toBe(
    4
  );
  expect(getReplacementScale({ scaleY: 3 } as never, bitmap, 'y')).toBe(3);
});

it('keeps background metadata preservation in the metadata owner', () => {
  const image = {};

  copyRasterReplacementMetadata(
    image as never,
    {
      sniptaleBackgroundColor: '#ffffff',
      sniptaleBackgroundGradientAngle: 45,
      sniptaleBackgroundImageData: undefined,
      sniptaleBackgroundMode: 'image',
    } as never
  );

  expect(image).toEqual({
    sniptaleBackgroundColor: '#ffffff',
    sniptaleBackgroundGradientAngle: 45,
    sniptaleBackgroundMode: 'image',
  });
});

it('keeps raster replacement type classification in the type owner', () => {
  expect(getRasterReplacementType({ sniptaleType: 'background' } as never)).toBe('background');
  expect(getRasterReplacementType({ sniptaleType: 'rich-shape' } as never)).toBe('image');

  utilityMocks.isSourceObject.mockReturnValueOnce(true);
  expect(getRasterReplacementType({ sniptaleType: 'image' } as never)).toBe('source-image');
});
