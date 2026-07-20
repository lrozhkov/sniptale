import { beforeEach, expect, it, vi } from 'vitest';
import { createDrawingBindings } from '../drawing-tool-actions.test-support';

const storeState = vi.hoisted(() => ({
  toolSettings: {
    blur: { amount: 11, blurType: 'gaussian' as const, showBorder: false },
  },
}));

const mocks = vi.hoisted(() => ({
  createBlurObject: vi.fn(() => ({ id: 'blur-object' })),
}));

vi.mock('../../../state/useEditorStore', () => ({
  useEditorStore: {
    getState: () => storeState,
  },
}));

vi.mock('../../../objects/annotation/blur/object', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../objects/annotation/blur/object')>()),
  createBlurObject: mocks.createBlurObject,
}));

import { handleBlurMouseDown } from './blur';

beforeEach(() => {
  vi.clearAllMocks();
});

it('creates blur draw sessions with the active source image', () => {
  const bindings = createDrawingBindings();
  const point = { x: 22, y: 28 } as never;

  handleBlurMouseDown({ ...bindings, getSource: () => ({ id: 'source-1' }) } as never, point);

  expect(mocks.createBlurObject).toHaveBeenCalledWith(
    expect.objectContaining({
      left: 22,
      top: 28,
      settings: { amount: 11, blurType: 'gaussian', showBorder: false },
      source: { id: 'source-1' },
    })
  );
  expect(bindings.prepareObject).toHaveBeenCalledWith({ id: 'blur-object' });
  expect(bindings.startDrawSession).toHaveBeenCalledWith('blur', point, { id: 'blur-object' });
});

it('skips blur draw sessions when no source image is available', () => {
  const bindings = createDrawingBindings();
  const point = { x: 22, y: 28 } as never;

  handleBlurMouseDown({ ...bindings, getSource: () => null } as never, point);

  expect(mocks.createBlurObject).not.toHaveBeenCalled();
  expect(bindings.prepareObject).not.toHaveBeenCalled();
  expect(bindings.startDrawSession).not.toHaveBeenCalled();
});
