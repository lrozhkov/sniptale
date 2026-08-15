import { beforeEach, expect, it, vi } from 'vitest';

const createCropGuideRect = vi.hoisted(() => vi.fn((point) => ({ point })));
vi.mock('../tools/crop', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../tools/crop')>()),
  createCropGuideRect,
}));

import { cropDown } from './pointer';

beforeEach(() => vi.clearAllMocks());

it('starts a crop draft only for enabled crop interactions outside the current guide', () => {
  const point = { x: 12, y: 24 };
  const canvas = { getScenePoint: vi.fn(() => point) };
  const guide = { id: 'guide' };
  const bindings = {
    getCropGuide: vi.fn(() => guide),
    getCropSelectionMouseEnabled: vi.fn(() => true),
    startDrawSession: vi.fn(),
  };

  expect(Reflect.apply(cropDown, null, [bindings, canvas, 'crop', { e: {}, target: guide }])).toBe(
    true
  );
  expect(bindings.startDrawSession).not.toHaveBeenCalled();

  expect(Reflect.apply(cropDown, null, [bindings, canvas, 'crop', { e: {} }])).toBe(true);
  expect(bindings.startDrawSession).toHaveBeenCalledWith('crop', point, { point }, null);
});

it('declines non-crop tools and disabled crop interaction', () => {
  const bindings = {
    getCropGuide: vi.fn(() => null),
    getCropSelectionMouseEnabled: vi.fn(() => false),
    startDrawSession: vi.fn(),
  };
  const canvas = { getScenePoint: vi.fn() };

  expect(Reflect.apply(cropDown, null, [bindings, canvas, 'pencil', { e: {} }])).toBe(false);
  expect(Reflect.apply(cropDown, null, [bindings, canvas, 'crop', { e: {} }])).toBe(false);
});
