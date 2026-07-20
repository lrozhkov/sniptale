// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  renderBackdropCanvas: vi.fn(),
}));

vi.mock('./canvas', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./canvas')>()),
  renderBackdropCanvas: mocks.renderBackdropCanvas,
}));

import type { BlurRuntimeObject } from '../types';
import { captureBlurBackdrop } from './capture';

function createBlurObject() {
  const object = {
    height: 20,
    left: 10,
    top: 12,
    width: 40,
  } as BlurRuntimeObject;
  object.canvas = {
    getObjects: vi.fn(() => [{ id: 'lower' }, object]),
  } as never;
  return object;
}

describe('blur backdrop capture owner', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('creates a padded backdrop canvas and delegates canvas rendering', () => {
    const context = { drawImage: vi.fn() } as unknown as CanvasRenderingContext2D;
    const backdropCanvas = { getContext: vi.fn(() => context), height: 0, width: 0 };
    vi.spyOn(document, 'createElement').mockReturnValue(backdropCanvas as never);

    const result = captureBlurBackdrop(createBlurObject(), {
      amount: 3,
      blurType: 'gaussian',
      showBorder: false,
    });

    expect(backdropCanvas.width).toBe(58);
    expect(backdropCanvas.height).toBe(38);
    expect(mocks.renderBackdropCanvas).toHaveBeenCalledWith(
      expect.objectContaining({ backdropCanvas, context, objectIndex: 1 })
    );
    expect(result).toEqual(expect.objectContaining({ height: 20, padding: 9, width: 40 }));
  });

  it('returns null when the canvas owner, object stack, or 2d context is unavailable', () => {
    expect(
      captureBlurBackdrop({ height: 1, left: 0, top: 0, width: 1 } as BlurRuntimeObject, {
        amount: 1,
        blurType: 'solid',
        showBorder: false,
      })
    ).toBeNull();

    const object = createBlurObject();
    object.canvas = { getObjects: vi.fn(() => []) } as never;
    expect(
      captureBlurBackdrop(object, { amount: 1, blurType: 'solid', showBorder: false })
    ).toBeNull();

    vi.spyOn(document, 'createElement').mockReturnValue({
      getContext: vi.fn(() => null),
      height: 0,
      width: 0,
    } as never);
    expect(
      captureBlurBackdrop(createBlurObject(), { amount: 1, blurType: 'solid', showBorder: false })
    ).toBeNull();
  });
});
