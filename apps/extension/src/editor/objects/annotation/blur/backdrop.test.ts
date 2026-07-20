// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';

import { captureBlurBackdrop } from './backdrop';
import type { BlurRuntimeObject } from './types';

function installCanvasElementMock(backdropContext: CanvasRenderingContext2D) {
  const originalCreateElement = document.createElement.bind(document);
  return vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
    if (tagName === 'canvas') {
      return {
        getContext: vi.fn(() => backdropContext),
        height: 0,
        width: 0,
      } as unknown as HTMLCanvasElement;
    }

    return originalCreateElement(tagName);
  });
}

function createBackdropObject() {
  const lowerObject = { sniptaleId: 'lower-object', visible: true };
  const hiddenObject = { sniptaleId: 'hidden-object', visible: false };
  const object = {
    height: 20,
    left: 10,
    top: 12,
    width: 40,
  } as BlurRuntimeObject;
  const canvas = {
    calcViewportBoundaries: vi.fn(),
    enableRetinaScaling: true,
    getObjects: vi.fn(() => [lowerObject, hiddenObject, object, { sniptaleId: 'upper-object' }]),
    height: 180,
    renderCanvas: vi.fn(),
    skipControlsDrawing: false,
    viewportTransform: [2, 0, 0, 2, 30, 40],
    width: 320,
  };
  object.canvas = canvas as never;
  return { canvas, lowerObject, object };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

it('returns null when blur backdrop capture has no mounted canvas owner', () => {
  expect(
    captureBlurBackdrop(
      {
        height: 20,
        left: 10,
        top: 12,
        width: 40,
      } as BlurRuntimeObject,
      { amount: 8, blurType: 'gaussian', showBorder: false }
    )
  ).toBeNull();
});

it('captures only lower visible objects and restores canvas state after gaussian capture', () => {
  const { canvas, lowerObject, object } = createBackdropObject();
  const backdropContext = { drawImage: vi.fn() } as unknown as CanvasRenderingContext2D;
  const createElementSpy = installCanvasElementMock(backdropContext);

  const result = captureBlurBackdrop(object, {
    amount: 5,
    blurType: 'gaussian',
    showBorder: false,
  });

  expect(createElementSpy).toHaveBeenCalledWith('canvas');
  expect(canvas.renderCanvas).toHaveBeenCalledWith(backdropContext, [lowerObject]);
  expect(result).toEqual(
    expect.objectContaining({
      height: 20,
      padding: 15,
      width: 40,
    })
  );
  expect(canvas.viewportTransform).toEqual([2, 0, 0, 2, 30, 40]);
  expect(canvas.skipControlsDrawing).toBe(false);
});

it('extends gaussian backdrop pixels at canvas edges before blur filtering', () => {
  const { canvas, object } = createBackdropObject();
  object.left = 0;
  object.top = 0;
  const backdropContext = { drawImage: vi.fn() } as unknown as CanvasRenderingContext2D;
  installCanvasElementMock(backdropContext);

  captureBlurBackdrop(object, {
    amount: 5,
    blurType: 'gaussian',
    showBorder: false,
  });

  expect(backdropContext.drawImage).toHaveBeenCalledWith(
    expect.anything(),
    15,
    0,
    1,
    50,
    0,
    0,
    15,
    50
  );
  expect(backdropContext.drawImage).toHaveBeenCalledWith(
    expect.anything(),
    0,
    15,
    70,
    1,
    0,
    0,
    70,
    15
  );
  expect(canvas.viewportTransform).toEqual([2, 0, 0, 2, 30, 40]);
});

it('keeps in-canvas gaussian backdrop padding intact', () => {
  const { object } = createBackdropObject();
  const backdropContext = { drawImage: vi.fn() } as unknown as CanvasRenderingContext2D;
  installCanvasElementMock(backdropContext);

  captureBlurBackdrop(object, {
    amount: 2,
    blurType: 'gaussian',
    showBorder: false,
  });

  expect(backdropContext.drawImage).not.toHaveBeenCalled();
});

it('uses effect-specific padding for distortion and pixelate backdrop captures', () => {
  const { object } = createBackdropObject();
  const backdropContext = { drawImage: vi.fn() } as unknown as CanvasRenderingContext2D;
  installCanvasElementMock(backdropContext);

  const distortionCapture = captureBlurBackdrop(object, {
    amount: 4,
    blurType: 'distortion',
    showBorder: false,
  });
  const pixelateCapture = captureBlurBackdrop(object, {
    amount: 9,
    blurType: 'pixelate',
    showBorder: false,
  });

  expect(distortionCapture?.padding).toBe(6);
  expect(pixelateCapture?.padding).toBe(0);
});

it('captures bordered blur backdrops from the inner blur area instead of the expanded frame', () => {
  const { canvas, lowerObject, object } = createBackdropObject();
  object.left = 10;
  object.top = 12;
  object.width = 40;
  object.height = 20;
  const backdropContext = { drawImage: vi.fn() } as unknown as CanvasRenderingContext2D;
  installCanvasElementMock(backdropContext);

  const result = captureBlurBackdrop(object, {
    amount: 5,
    blurType: 'gaussian',
    showBorder: true,
    strokeWidth: 6,
  });

  expect(canvas.renderCanvas).toHaveBeenCalledWith(backdropContext, [lowerObject]);
  expect(result).toEqual(
    expect.objectContaining({
      height: 20,
      padding: 15,
      width: 40,
    })
  );
  expect(canvas.viewportTransform).toEqual([2, 0, 0, 2, 30, 40]);
  expect(canvas.skipControlsDrawing).toBe(false);
});

it('returns null when the blur object is no longer present in the canvas stack', () => {
  const { object } = createBackdropObject();
  object.canvas = {
    calcViewportBoundaries: vi.fn(),
    enableRetinaScaling: false,
    getObjects: vi.fn(() => []),
    height: 180,
    renderCanvas: vi.fn(),
    skipControlsDrawing: false,
    viewportTransform: [1, 0, 0, 1, 0, 0],
    width: 320,
  } as never;

  expect(
    captureBlurBackdrop(object, {
      amount: 8,
      blurType: 'solid',
      showBorder: false,
    })
  ).toBeNull();
});
