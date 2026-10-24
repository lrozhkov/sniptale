// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { drawSceneLens } from './scene-lens';

const bounds = { x: 20, y: 10, width: 16, height: 16 };
const source = document.createElement('canvas');

afterEach(() => vi.restoreAllMocks());

function canvasContexts(options: { readbackFails?: boolean; missingOutput?: boolean } = {}) {
  const sampled = vi.fn();
  const published = vi.fn();
  const pixels = new Uint8ClampedArray(16 * 16 * 4);
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const index = (y * 16 + x) * 4;
      pixels[index] = x * 12;
      pixels[index + 3] = 255;
    }
  let calls = 0;
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => {
    calls++;
    if (options.missingOutput && calls === 2) return null;
    return {
      drawImage: sampled,
      scale: vi.fn(),
      getImageData: () => {
        if (options.readbackFails) throw new DOMException('Unavailable', 'SecurityError');
        return { data: pixels };
      },
      createImageData: () => ({ data: new Uint8ClampedArray(pixels.length) }),
      putImageData: published,
    } as unknown as CanvasRenderingContext2D;
  });
  const target = { drawImage: vi.fn() } as unknown as CanvasRenderingContext2D;
  return { target, sampled, published, pixels };
}

it('magnifies original pixels with a bounded optical readback', () => {
  const { target, sampled, published, pixels } = canvasContexts();
  drawSceneLens(target, source, bounds, { scale: 2, optics: 'optical' });
  expect(sampled).toHaveBeenCalledWith(source, 20, 10, 16, 16, 0, 0, 16, 16);
  expect(published).toHaveBeenCalledOnce();
  const warped = published.mock.calls[0]![0].data as Uint8ClampedArray;
  expect(warped[(8 * 16 + 11) * 4 + 3]).toBe(0);
  expect(pixels[(8 * 16 + 11) * 4 + 3]).toBe(255);
  expect(sampled).toHaveBeenCalledWith(source, 24, 14, 8, 8, 0, 0, 16, 16);
  expect(target.drawImage).toHaveBeenCalledTimes(2);
});

it('flat sampling uses the centered inner crop without pixel readback', () => {
  const { target, sampled, published } = canvasContexts();
  drawSceneLens(target, source, bounds, { scale: 2, optics: 'flat' });
  expect(sampled).toHaveBeenCalledWith(source, 24, 14, 8, 8, 0, 0, 16, 16);
  expect(published).not.toHaveBeenCalled();
  expect(target.drawImage).toHaveBeenCalledOnce();
});

it.each([{ readbackFails: true }, { missingOutput: true }])(
  'falls back to a flat crop when optical sampling is unavailable (%j)',
  (failure) => {
    const { target, sampled, published } = canvasContexts(failure);
    drawSceneLens(target, source, bounds, { scale: 2, optics: 'optical' });
    expect(sampled).toHaveBeenCalledWith(source, 24, 14, 8, 8, 0, 0, 16, 16);
    expect(published).not.toHaveBeenCalled();
    expect(target.drawImage).toHaveBeenCalledOnce();
  }
);

it('skips work when the lens has no magnification or opening', () => {
  const { target, sampled } = canvasContexts();
  drawSceneLens(target, source, bounds, { scale: 1, optics: 'optical' });
  drawSceneLens(target, source, { ...bounds, width: 0 }, { scale: 2, optics: 'flat' });
  expect(sampled).not.toHaveBeenCalled();
  expect(target.drawImage).not.toHaveBeenCalled();
});
