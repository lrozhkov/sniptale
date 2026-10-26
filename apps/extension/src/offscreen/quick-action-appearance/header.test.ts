// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_WINDOW_HEADER } from '@sniptale/runtime-contracts/window-header';
const mocks = vi.hoisted(() => ({ favicon: vi.fn() }));
vi.mock('../../workflows/browser-frame/favicon', () => ({
  acquireWindowHeaderFavicon: mocks.favicon,
}));
import { renderQuickActionHeader } from './header';
const raster =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAYAAAC56t6BAAAAFElEQVR4AWKS8Mj5D8JMDFAAZwAAAAD//238wugAAAAGSURBVAMATl0DnQxeRbkAAAAASUVORK5CYII=';
let fail = false;
const revoke = vi.fn(),
  draw = vi.fn();
class RasterImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  set src(value: string) {
    if (value)
      queueMicrotask(() => {
        if (fail) this.onerror?.();
        else this.onload?.();
      });
  }
}
beforeEach(() => {
  vi.clearAllMocks();
  fail = false;
  mocks.favicon.mockResolvedValue(null);
  vi.stubGlobal('Image', RasterImage);
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:header');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(revoke);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage: draw,
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(raster);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it('renders local artwork and does not acquire a favicon without explicit enable', async () => {
  await expect(
    renderQuickActionHeader({
      header: DEFAULT_WINDOW_HEADER,
      source: { width: 1280, height: 560 },
      faviconWebsite: 'https://example.test',
    })
  ).resolves.toEqual({ dataUrl: raster });
  expect(mocks.favicon).not.toHaveBeenCalled();
  expect(draw).toHaveBeenCalledOnce();
  expect(revoke).toHaveBeenCalledWith('blob:header');
});
it('omits unavailable favicon and still completes the configured header', async () => {
  mocks.favicon.mockRejectedValue(new Error('unavailable'));
  await expect(
    renderQuickActionHeader({
      header: { ...DEFAULT_WINDOW_HEADER, faviconEnabled: true },
      source: { width: 1280, height: 560 },
      faviconWebsite: 'https://example.test',
    })
  ).resolves.toEqual({ dataUrl: raster });
  expect(mocks.favicon).toHaveBeenCalledWith('https://example.test', expect.any(AbortSignal));
});
it('releases the object URL after raster failure and allows an explicit retry', async () => {
  fail = true;
  const input = { header: DEFAULT_WINDOW_HEADER, source: { width: 1280, height: 560 } };
  await expect(renderQuickActionHeader(input)).rejects.toThrow('rasterization');
  expect(revoke).toHaveBeenCalledOnce();
  fail = false;
  await expect(renderQuickActionHeader(input)).resolves.toEqual({ dataUrl: raster });
  expect(revoke).toHaveBeenCalledTimes(2);
});
