import { beforeEach, expect, it, vi } from 'vitest';

const { createCropGuideRect, cropMode } = vi.hoisted(() => ({
  createCropGuideRect: vi.fn((point) => ({ point })),
  cropMode: { current: 'crop' as 'crop' | 'expand' },
}));
vi.mock('../../state/useEditorStore', () => ({
  useEditorStore: { getState: () => ({ canvasCropMode: cropMode.current }) },
}));
vi.mock('../tools/crop', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../tools/crop')>()),
  createCropGuideRect,
}));

import { cropDown } from './pointer';

beforeEach(() => {
  vi.clearAllMocks();
  cropMode.current = 'crop';
});

it('starts a crop draft only for enabled crop interactions outside the current guide', () => {
  const point = { x: 12, y: 24 };
  const canvas = { getScenePoint: vi.fn(() => point), getZoom: vi.fn(() => 1) };
  const guide = { id: 'guide' };
  const bindings = {
    getCanvasDocumentSize: vi.fn(() => ({ width: 800, height: 600 })),
    getCropGuide: vi.fn(() => guide),
    getCropSelectionMouseEnabled: vi.fn(() => true),
    startDrawSession: vi.fn(),
  };

  expect(Reflect.apply(cropDown, null, [bindings, canvas, 'crop', { e: {}, target: guide }])).toBe(
    false
  );
  expect(bindings.startDrawSession).not.toHaveBeenCalled();

  expect(Reflect.apply(cropDown, null, [bindings, canvas, 'crop', { e: {} }])).toBe(true);
  expect(bindings.startDrawSession).toHaveBeenCalledWith('crop', point, { point }, null);
});

it('declines non-crop tools and disabled crop interaction', () => {
  const bindings = {
    getCanvasDocumentSize: vi.fn(() => ({ width: 800, height: 600 })),
    getCropGuide: vi.fn(() => null),
    getCropSelectionMouseEnabled: vi.fn(() => false),
    startDrawSession: vi.fn(),
  };
  const canvas = { getScenePoint: vi.fn(), getZoom: vi.fn(() => 1) };

  expect(Reflect.apply(cropDown, null, [bindings, canvas, 'pencil', { e: {} }])).toBe(false);
  expect(Reflect.apply(cropDown, null, [bindings, canvas, 'crop', { e: {} }])).toBe(false);
});

it('clamps a bounded crop start at the image edge and starts a free expansion anywhere', () => {
  const canvas = { getScenePoint: vi.fn(() => ({ x: -50, y: -30 })), getZoom: vi.fn(() => 1) };
  const bindings = {
    getCanvasDocumentSize: vi.fn(() => ({ width: 800, height: 600 })),
    getCropGuide: vi.fn(() => null),
    getCropSelectionMouseEnabled: vi.fn(() => true),
    startDrawSession: vi.fn(),
  };

  Reflect.apply(cropDown, null, [bindings, canvas, 'crop', { e: {} }]);
  expect(bindings.startDrawSession).toHaveBeenLastCalledWith(
    'crop',
    { x: 0, y: 0 },
    expect.anything(),
    null
  );

  cropMode.current = 'expand';
  Reflect.apply(cropDown, null, [bindings, canvas, 'crop', { e: {} }]);
  expect(bindings.startDrawSession).toHaveBeenLastCalledWith(
    'crop',
    { x: -50, y: -30 },
    expect.anything(),
    null
  );
});
