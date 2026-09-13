import { afterEach, expect, it, vi } from 'vitest';
import { prepareTourRaster } from './tour-html-images';
import type { TourMask } from '@sniptale/runtime-contracts/scenario/types/tour';
const png = new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0])], {
  type: 'image/png',
});
afterEach(() => vi.unstubAllGlobals());
function setup() {
  const calls: string[] = [];
  const close = vi.fn();
  vi.stubGlobal('createImageBitmap', async () => ({ width: 4000, height: 2000, close }));
  vi.stubGlobal(
    'OffscreenCanvas',
    class {
      width: number;
      height: number;
      constructor(w: number, h: number) {
        this.width = w;
        this.height = h;
      }
      getContext() {
        const width = this.width;
        return {
          fillStyle: '',
          drawImage: () => calls.push(`draw:${width}`),
          fillRect: () => calls.push(`mask:${width}`),
        };
      }
      async convertToBlob() {
        return new Blob(['encoded output larger than original'], { type: 'image/webp' });
      }
    }
  );
  return { calls, close };
}
it('erases at source resolution before resampling and never falls back to original redacted bytes', async () => {
  const s = setup();
  const mask: TourMask = {
    id: 'mask',
    kind: 'redact',
    color: '#00000000',
    opacity: 0,
    rect: { x: 0.1, y: 0.2, width: 0.2, height: 0.2 },
  };
  const output = await prepareTourRaster(
    png,
    [mask],
    { optimize: true, maxEdge: 1000, quality: 0.85 },
    new AbortController().signal
  );
  expect(s.calls).toEqual(['draw:4000', 'mask:4000', 'mask:4000', 'draw:1000']);
  expect(output.blob).not.toBe(png);
  expect(output.width).toBe(1000);
  expect(s.close).toHaveBeenCalledOnce();
});
it('keeps originals when optimization increases bytes and resolution is unchanged', async () => {
  setup();
  const output = await prepareTourRaster(
    png,
    [],
    { optimize: true, maxEdge: 4096, quality: 0.85 },
    new AbortController().signal
  );
  expect(output.blob).toBe(png);
});
