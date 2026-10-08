import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createReviewWatermarkRenderer } from './render-watermark';
import type { QuickEditWatermarkSettings } from '../../features/video/review/advanced/watermark';

function settings(): QuickEditWatermarkSettings {
  return {
    mode: 'text',
    layout: 'single',
    text: {
      value: 'Latin Кириллица',
      font: 'sans',
      weight: 'bold',
      size: 24 / 1080,
      color: '#ffffff80',
      align: 'center',
      shadow: true,
      wrapWidth: 0.5,
    },
    placement: { anchor: 'bottom-right', margin: 0.02 },
    tile: { spacing: 0.04, rotation: -30 },
  };
}
const contexts: CanvasRenderingContext2D[] = [];
const surfaces: { width: number; height: number }[] = [];
const load = vi.fn();
beforeEach(() => {
  load.mockResolvedValue([{ status: 'loaded' }]);
  vi.stubGlobal('document', {
    fonts: { load, check: () => true },
    createElement: () => {
      const context = {
        font: '',
        fillStyle: '',
        globalAlpha: 1,
        measureText: vi.fn((text: string) => ({
          width: text.length * 12,
          actualBoundingBoxLeft: 2,
          actualBoundingBoxRight: text.length * 12 + 2,
          actualBoundingBoxAscent: 20,
          actualBoundingBoxDescent: 7,
        })),
        fillText: vi.fn(),
        drawImage: vi.fn(),
        save: vi.fn(),
        restore: vi.fn(),
        translate: vi.fn(),
        rotate: vi.fn(),
        scale: vi.fn(),
      } as unknown as CanvasRenderingContext2D;
      contexts.push(context);
      const surface = { width: 0, height: 0, getContext: () => context };
      surfaces.push(surface);
      return surface;
    },
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  contexts.length = 0;
  surfaces.length = 0;
});
it('loads the selected bundled face and actual text once before measuring and reuses its painted surface', async () => {
  const value = settings();
  const painter = await createReviewWatermarkRenderer(value, { width: 1920, height: 1080 });
  expect(load).toHaveBeenCalledWith('700 24px "Sniptale Sans"', value.text.value);
  expect(load.mock.invocationCallOrder[0]).toBeLessThan(
    vi.mocked(contexts[0]!.measureText).mock.invocationCallOrder[0]!
  );
  const target = contexts[0]!;
  painter.draw(target);
  painter.draw(target);
  expect(load).toHaveBeenCalledTimes(1);
  expect(surfaces).toHaveLength(1);
  expect(painter.bounds.x + painter.bounds.width).toBeLessThanOrEqual(1920);
  expect(painter.bounds.y + painter.bounds.height).toBeLessThanOrEqual(1080);
  expect(contexts[0]!.fillStyle).toBe('#ffffff80');
  painter.dispose();
  expect(surfaces[0]!.width).toBe(0);
});
it('refuses an unavailable bundled face instead of exporting fallback text', async () => {
  load.mockResolvedValue([]);
  await expect(
    createReviewWatermarkRenderer(settings(), { width: 1920, height: 1080 })
  ).rejects.toThrow();
  expect(contexts.every((context) => vi.mocked(context.measureText).mock.calls.length === 0)).toBe(
    true
  );
});
it('keeps None, image acquisition and empty text resource free', async () => {
  for (const value of [
    { ...settings(), mode: 'none' as const },
    { ...settings(), mode: 'image' as const },
    { ...settings(), text: { ...settings().text, value: '' } },
  ]) {
    const renderer = await createReviewWatermarkRenderer(value, { width: 1920, height: 1080 });
    renderer.dispose();
  }
  expect(load).not.toHaveBeenCalled();
  expect(surfaces).toHaveLength(0);
});
it('loads a logo once, retains its alpha and closes the bitmap after rasterization', async () => {
  const bitmap = { width: 400, height: 200, close: vi.fn() };
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => bitmap)
  );
  const read = vi.fn(async () => new Blob(['image'], { type: 'image/png' }));
  const renderer = await createReviewWatermarkRenderer(
    {
      ...settings(),
      mode: 'image',
      image: { assetId: 'project-asset:logo', width: 400, height: 200, size: 0.2, opacity: 0.4 },
    },
    { width: 3840, height: 2160 },
    undefined,
    read
  );
  expect(read).toHaveBeenCalledOnce();
  expect(bitmap.close).toHaveBeenCalledOnce();
  expect(renderer.bounds.width / renderer.bounds.height).toBeCloseTo(2);
  expect(contexts[0]!.globalAlpha).toBe(0.4);
  renderer.dispose();
});
it('fails missing logo and rejects excessive decoded dimensions', async () => {
  const value = {
    ...settings(),
    mode: 'image' as const,
    image: { assetId: 'project-asset:logo', width: 400, height: 200, size: 0.2, opacity: 1 },
  };
  await expect(
    createReviewWatermarkRenderer(value, { width: 1920, height: 1080 }, undefined, async () => null)
  ).rejects.toThrow();
  const bitmap = { width: 8000, height: 8000, close: vi.fn() };
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => bitmap)
  );
  await expect(
    createReviewWatermarkRenderer(
      value,
      { width: 1920, height: 1080 },
      undefined,
      async () => new Blob(['x'])
    )
  ).rejects.toThrow();
  expect(bitmap.close).toHaveBeenCalledOnce();
});
it('wraps without truncation and paints repeated instances from one bounded cache', async () => {
  const value = settings();
  value.layout = 'tiled';
  value.text.value = 'ABCD\nEFGH';
  value.text.wrapWidth = 0.03;
  const renderer = await createReviewWatermarkRenderer(value, { width: 1920, height: 1080 });
  expect(
    vi
      .mocked(contexts[0]!.fillText)
      .mock.calls.map((call) => call[0])
      .join('')
  ).toBe('ABCDEFGH');
  renderer.draw(contexts[0]!);
  expect(vi.mocked(contexts[0]!.drawImage).mock.calls.length).toBeGreaterThan(1);
  expect(vi.mocked(contexts[0]!.drawImage).mock.calls.length).toBeLessThanOrEqual(4096);
  expect(surfaces).toHaveLength(1);
  renderer.dispose();
});
it.each([
  { width: 1920, height: 1080 },
  { width: 1080, height: 1920 },
  { width: 720, height: 720 },
  { width: 320, height: 180 },
  { width: 3840, height: 2160 },
])(
  'keeps painted glyph and shadow bounds inside the final $width×$height canvas',
  async (output) => {
    const renderer = await createReviewWatermarkRenderer(settings(), output);
    expect(renderer.bounds.x).toBeGreaterThanOrEqual(0);
    expect(renderer.bounds.y).toBeGreaterThanOrEqual(0);
    expect(renderer.bounds.x + renderer.bounds.width).toBeLessThanOrEqual(output.width);
    expect(renderer.bounds.y + renderer.bounds.height).toBeLessThanOrEqual(output.height);
    renderer.dispose();
  }
);
it('accepts generic system families without fabricating downloadable faces', async () => {
  load.mockResolvedValue([]);
  const value = settings();
  value.text.font = 'serif';
  value.text.weight = 'normal';
  const renderer = await createReviewWatermarkRenderer(value, { width: 1920, height: 1080 });
  expect(load).toHaveBeenCalledWith('400 24px serif', value.text.value);
  renderer.dispose();
});
it('closes a late bitmap and never paints when resource acquisition is cancelled', async () => {
  const controller = new AbortController();
  const bitmap = { width: 400, height: 200, close: vi.fn() };
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => {
      controller.abort();
      return bitmap;
    })
  );
  const value = {
    ...settings(),
    mode: 'image' as const,
    image: { assetId: 'project-asset:logo', width: 400, height: 200, size: 0.2, opacity: 1 },
  };
  await expect(
    createReviewWatermarkRenderer(
      value,
      { width: 1920, height: 1080 },
      controller.signal,
      async () => new Blob(['x'])
    )
  ).rejects.toMatchObject({ name: 'AbortError' });
  expect(bitmap.close).toHaveBeenCalledOnce();
  expect(contexts[0]!.drawImage).not.toHaveBeenCalled();
  expect(surfaces[0]!.width).toBe(0);
});
it('releases the cache on abort and makes later draw calls harmless', async () => {
  const controller = new AbortController();
  const renderer = await createReviewWatermarkRenderer(
    settings(),
    { width: 1920, height: 1080 },
    controller.signal
  );
  controller.abort();
  renderer.draw(contexts[0]!);
  renderer.dispose();
  expect(contexts[0]!.drawImage).not.toHaveBeenCalled();
  expect(surfaces[0]!.width).toBe(0);
});

it.each(['missing', 'read', 'decode', 'dimensions'] as const)(
  'classifies %s logo failure as recoverable asset unavailability',
  async (failure) => {
    const value = {
      ...settings(),
      mode: 'image' as const,
      image: { assetId: 'project-asset:logo', width: 400, height: 200, size: 0.2, opacity: 1 },
    };
    const bitmap = { width: failure === 'dimensions' ? 401 : 400, height: 200, close: vi.fn() };
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => {
        if (failure === 'decode') throw new Error('Corrupt private bytes');
        return bitmap;
      })
    );
    const read = async () => {
      if (failure === 'read') throw new Error('Storage unavailable');
      return failure === 'missing' ? null : new Blob(['image']);
    };
    await expect(
      createReviewWatermarkRenderer(value, { width: 1920, height: 1080 }, undefined, read)
    ).rejects.toMatchObject({ name: 'QuickEditExportUnavailable', reasons: ['asset-missing'] });
    expect(contexts[0]!.drawImage).not.toHaveBeenCalled();
    expect(surfaces[0]!.width).toBe(0);
    if (failure === 'dimensions') expect(bitmap.close).toHaveBeenCalledOnce();
  }
);

it('preserves cancellation when an aborted asset read also rejects', async () => {
  const controller = new AbortController();
  const value = {
    ...settings(),
    mode: 'image' as const,
    image: { assetId: 'project-asset:logo', width: 400, height: 200, size: 0.2, opacity: 1 },
  };
  await expect(
    createReviewWatermarkRenderer(
      value,
      { width: 1920, height: 1080 },
      controller.signal,
      async () => {
        controller.abort();
        throw new Error('Read interrupted');
      }
    )
  ).rejects.toMatchObject({ name: 'AbortError' });
});

it('does not misclassify image cache geometry failures as missing assets', async () => {
  const bitmap = { width: 400, height: 200, close: vi.fn() };
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => bitmap)
  );
  const value = {
    ...settings(),
    mode: 'image' as const,
    image: { assetId: 'project-asset:logo', width: 400, height: 200, size: 0.2, opacity: 1 },
  };
  await expect(
    createReviewWatermarkRenderer(
      value,
      { width: 100000, height: 100000 },
      undefined,
      async () => new Blob(['image'])
    )
  ).rejects.toThrow('Watermark cache budget exceeded.');
  expect(bitmap.close).toHaveBeenCalledOnce();
});
