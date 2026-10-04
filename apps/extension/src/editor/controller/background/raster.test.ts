// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';
import { FabricImage, type FabricObject } from 'fabric';
import { createTypedTestFixture } from '../../testing/fabric-canvas.test-support';

const mocks = vi.hoisted(() => ({
  add: vi.fn(),
  dispose: vi.fn(),
  renderAll: vi.fn(),
}));

vi.mock('fabric', async (importOriginal) => ({
  ...(await importOriginal<typeof import('fabric')>()),
  StaticCanvas: class StaticCanvas {
    add = mocks.add;
    dispose = mocks.dispose;
    renderAll = mocks.renderAll;
  },
}));

import { rasterizeBlurredBackground, resolveBackgroundRasterSize } from './raster';

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value: vi.fn(() => ({ drawImage: vi.fn(), filter: 'none' })),
  });
});

it('bounds large background rasters without changing their target aspect ratio', () => {
  expect(resolveBackgroundRasterSize({ width: 12_000, height: 6_000 })).toEqual({
    width: 2048,
    height: 1024,
  });
  expect(resolveBackgroundRasterSize({ width: 320, height: 180 })).toEqual({
    width: 320,
    height: 180,
  });
});

it('rasterizes the complete backing with edge padding and scales it to the document', () => {
  const result = rasterizeBlurredBackground({
    amount: 10,
    object: createTypedTestFixture<FabricObject>({ id: 'background' }),
    rasterSize: { width: 200, height: 100 },
    targetSize: { width: 400, height: 200 },
  });

  expect(mocks.add).toHaveBeenCalledWith({ id: 'background' });
  expect(mocks.renderAll).toHaveBeenCalledOnce();
  expect(mocks.dispose).toHaveBeenCalledOnce();
  expect(result).toMatchObject({ left: 0, scaleX: 2, scaleY: 2, top: 0 });
});

it('disposes the renderer when either raster context is unavailable', () => {
  const createObject = () => createTypedTestFixture<FabricObject>({ id: 'background' });
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value: vi.fn(() => null),
  });
  expect(() =>
    rasterizeBlurredBackground({
      amount: 4,
      object: createObject(),
      rasterSize: { width: 20, height: 10 },
      targetSize: { width: 20, height: 10 },
    })
  ).toThrow('raster context');

  const context = { drawImage: vi.fn(), filter: 'none' };
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value: vi.fn().mockReturnValueOnce(context).mockReturnValueOnce(null),
  });
  expect(() =>
    rasterizeBlurredBackground({
      amount: 4,
      object: createObject(),
      rasterSize: { width: 20, height: 10 },
      targetSize: { width: 20, height: 10 },
    })
  ).toThrow('blur context');
  expect(mocks.dispose).toHaveBeenCalledTimes(2);
});

it('caps blur padding for valid sub-pixel imported target dimensions', () => {
  const canvases: HTMLCanvasElement[] = [];
  const createElement = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
    const element = createElement(tagName);
    if (tagName === 'canvas') canvases.push(element as HTMLCanvasElement);
    return element;
  });

  rasterizeBlurredBackground({
    amount: 25,
    object: createTypedTestFixture<FabricObject>({ id: 'background' }),
    rasterSize: { width: 1, height: 1 },
    targetSize: { width: 0.01, height: 0.01 },
  });

  expect(canvases[1]).toMatchObject({ height: 101, width: 101 });
});

it('encodes immutable raster once through real Fabric serialization, preserving replaced and filtered sources', () => {
  const encode = vi
    .spyOn(HTMLCanvasElement.prototype, 'toDataURL')
    .mockReturnValue('data:image/png;base64,original');
  const result = rasterizeBlurredBackground({
    amount: 4,
    object: createTypedTestFixture<FabricObject>({}),
    rasterSize: { width: 20, height: 10 },
    targetSize: { width: 20, height: 10 },
  });
  expect(result).toBeInstanceOf(FabricImage);
  if (!(result instanceof FabricImage)) throw new Error('Expected raster image');
  expect(encode).not.toHaveBeenCalled();
  expect(result.toObject().src).toBe('data:image/png;base64,original');
  expect(result.toObject().src).toBe('data:image/png;base64,original');
  expect(result.getSrc(true)).toBe('data:image/png;base64,original');
  expect(encode).toHaveBeenCalledOnce();
  const filtered = document.createElement('canvas');
  filtered.toDataURL = vi.fn(() => 'data:image/png;base64,filtered');
  result._element = filtered;
  expect(result.getSrc(true)).toBe('data:image/png;base64,filtered');
  expect(result.toObject().src).toBe('data:image/png;base64,original');
  result.setElement(filtered);
  expect(result.toObject().src).toBe('data:image/png;base64,filtered');
  expect(filtered.toDataURL).toHaveBeenCalledTimes(2);
  encode.mockRestore();
});

it('retries failed raster encoding instead of caching failure', () => {
  const encode = vi
    .spyOn(HTMLCanvasElement.prototype, 'toDataURL')
    .mockImplementationOnce(() => {
      throw new Error('encoding failed');
    })
    .mockReturnValue('data:image/png;base64,retry');
  const result = rasterizeBlurredBackground({
    amount: 4,
    object: createTypedTestFixture<FabricObject>({}),
    rasterSize: { width: 20, height: 10 },
    targetSize: { width: 20, height: 10 },
  });
  expect(() => result.toObject()).toThrow('encoding failed');
  expect(result.toObject()).toMatchObject({ src: 'data:image/png;base64,retry' });
  expect(result.toObject()).toMatchObject({ src: 'data:image/png;base64,retry' });
  expect(encode).toHaveBeenCalledTimes(2);
  encode.mockRestore();
});
