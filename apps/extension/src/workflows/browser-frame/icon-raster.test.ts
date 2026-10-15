// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { rasterizeWindowHeaderIcon } from './icon-raster';
const png =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlH0H8AAAAASUVORK5CYII=';
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function setup(width: number, height: number, decode = async () => undefined) {
  const drawImage = vi.fn();
  const revoke = vi.fn();
  vi.stubGlobal('URL', { createObjectURL: () => 'blob:icon', revokeObjectURL: revoke });
  vi.stubGlobal(
    'Image',
    class {
      src = '';
      naturalWidth = width;
      naturalHeight = height;
      decode = decode;
    }
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage,
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(png);
  return { drawImage, revoke };
}
it('fits a portrait icon without stretching, with transparent horizontal margins', async () => {
  const { drawImage, revoke } = setup(32, 128);
  expect(await rasterizeWindowHeaderIcon(new Blob(), new AbortController().signal)).toBe(png);
  expect(drawImage).toHaveBeenCalledWith(expect.anything(), 24, 0, 16, 64);
  expect(revoke).toHaveBeenCalledWith('blob:icon');
});
it.each([
  [0, 40],
  [4097, 40],
  [40, 4097],
])('rejects invalid dimensions %s × %s and releases the URL', async (width, height) => {
  const { drawImage, revoke } = setup(width, height);
  expect(await rasterizeWindowHeaderIcon(new Blob(), new AbortController().signal)).toBeNull();
  expect(drawImage).not.toHaveBeenCalled();
  expect(revoke).toHaveBeenCalledOnce();
});
it('releases a failed decoder URL', async () => {
  const { revoke } = setup(32, 32, async () => {
    throw new Error('decode');
  });
  await expect(rasterizeWindowHeaderIcon(new Blob(), new AbortController().signal)).rejects.toThrow(
    'decode'
  );
  expect(revoke).toHaveBeenCalledOnce();
});
it('discards pixels when aborted during decode and releases the URL', async () => {
  const controller = new AbortController();
  const { drawImage, revoke } = setup(32, 32, async () => {
    controller.abort();
  });
  await expect(rasterizeWindowHeaderIcon(new Blob(), controller.signal)).rejects.toMatchObject({
    name: 'AbortError',
  });
  expect(drawImage).not.toHaveBeenCalled();
  expect(revoke).toHaveBeenCalledOnce();
});
