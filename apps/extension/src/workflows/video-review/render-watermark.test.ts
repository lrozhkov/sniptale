import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createReviewWatermarkRenderer, measureReviewWatermark } from './render-watermark';
import type { RenderResources } from '../../features/video/composition/canvas/render-resources';
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
        fillRect: vi.fn(),
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
  expect(contexts.every((context) => vi.mocked(context.drawImage).mock.calls.length === 0)).toBe(
    true
  );
  expect(surfaces.every((surface) => surface.width === 0)).toBe(true);
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
  expect(contexts.every((context) => vi.mocked(context.drawImage).mock.calls.length === 0)).toBe(
    true
  );
  expect(surfaces.every((surface) => surface.width === 0)).toBe(true);
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
    expect(contexts.every((context) => vi.mocked(context.drawImage).mock.calls.length === 0)).toBe(
      true
    );
    expect(surfaces.every((surface) => surface.width === 0)).toBe(true);
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

function managedResources() {
  const releases: ReturnType<typeof vi.fn>[] = [];
  const resources: RenderResources = {
    canvas: vi.fn((_role, size) => {
      const canvas = document.createElement('canvas');
      canvas.width = size.width;
      canvas.height = size.height;
      const context = canvas.getContext('2d')!;
      const release = vi.fn(() => {
        canvas.width = 0;
        canvas.height = 0;
      });
      releases.push(release);
      return { canvas, context, release };
    }),
    bytes: vi.fn(() => {
      const release = vi.fn();
      releases.push(release);
      return { release };
    }),
  };
  return { resources, releases };
}

it('keeps canonical wrapping and tiled destinations while scaling only the managed text cache', async () => {
  const value = settings();
  value.layout = 'tiled';
  value.text.value = 'ABCD\nEFGH';
  value.text.wrapWidth = 0.03;
  const baseline = await createReviewWatermarkRenderer(value, { width: 1920, height: 1080 });
  const baselineSurface = { ...surfaces[0]! };
  const baselinePaint = vi.mocked(contexts[0]!.fillText).mock.calls;
  const { resources, releases } = managedResources();
  const renderer = await createReviewWatermarkRenderer(
    value,
    { width: 1920, height: 1080 },
    undefined,
    undefined,
    { scaleX: 0.5, scaleY: 0.25, resources }
  );
  expect(renderer.bounds).toEqual(baseline.bounds);
  expect(resources.canvas).toHaveBeenNthCalledWith(1, 'watermark-measurement', {
    width: 1,
    height: 1,
  });
  expect(resources.canvas).toHaveBeenNthCalledWith(2, 'watermark-cache', {
    width: Math.ceil(baselineSurface.width * 0.5),
    height: Math.ceil(baselineSurface.height * 0.25),
  });
  expect(contexts[2]!.fillText).toHaveBeenCalledTimes(baselinePaint.length);
  expect(vi.mocked(contexts[2]!.fillText).mock.calls).toEqual(baselinePaint);
  expect(contexts[2]!.scale).toHaveBeenCalledWith(0.5, 0.25);
  expect(contexts[2]!.shadowBlur).toBe(contexts[0]!.shadowBlur * 0.5);
  expect(contexts[2]!.shadowOffsetY).toBe(contexts[0]!.shadowOffsetY * 0.25);
  baseline.draw(contexts[0]!);
  renderer.draw(contexts[2]!);
  expect(vi.mocked(contexts[2]!.drawImage).mock.calls.map((call) => call.slice(5))).toEqual(
    vi.mocked(contexts[0]!.drawImage).mock.calls.map((call) => call.slice(5))
  );
  expect(vi.mocked(contexts[2]!.drawImage).mock.calls[0]!.slice(3, 5)).toEqual([
    surfaces[2]!.width,
    surfaces[2]!.height,
  ]);
  expect(releases[0]).toHaveBeenCalledOnce();
  renderer.dispose();
  renderer.dispose();
  expect(releases[1]).toHaveBeenCalledOnce();
  baseline.dispose();
});

it.each(['success', 'decode', 'dimensions', 'abort', 'cache', 'paint'] as const)(
  'releases managed logo reservations and bitmap on %s',
  async (outcome) => {
    const { resources, releases } = managedResources();
    const controller = new AbortController();
    const bitmap = { width: outcome === 'dimensions' ? 401 : 400, height: 200, close: vi.fn() };
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => {
        expect(resources.bytes).toHaveBeenCalledWith('watermark-source-bitmap', 400 * 200 * 4);
        if (outcome === 'decode') throw new Error('decode');
        if (outcome === 'abort') controller.abort();
        return bitmap;
      })
    );
    if (outcome === 'cache')
      vi.mocked(resources.canvas).mockImplementation(() => {
        throw new Error('budget');
      });
    if (outcome === 'paint') {
      const allocate = resources.canvas;
      resources.canvas = (...args) => {
        const lease = allocate(...args);
        vi.mocked(lease.context.drawImage).mockImplementation(() => {
          throw new Error('paint');
        });
        return lease;
      };
    }
    const preparation = createReviewWatermarkRenderer(
      {
        ...settings(),
        mode: 'image',
        image: { assetId: 'project-asset:logo', width: 400, height: 200, size: 0.2, opacity: 0.4 },
      },
      { width: 1920, height: 1080 },
      controller.signal,
      async () => new Blob(['image']),
      { scaleX: 0.25, scaleY: 0.25, resources }
    );
    if (outcome === 'success') {
      const renderer = await preparation;
      expect(resources.canvas).toHaveBeenCalledWith('watermark-cache', { width: 96, height: 48 });
      expect(renderer.bounds.width).toBe(384);
      renderer.dispose();
    } else await expect(preparation).rejects.toThrow();
    expect(releases[0]).toHaveBeenCalledOnce();
    if (outcome !== 'decode') expect(bitmap.close).toHaveBeenCalledOnce();
    for (const release of releases) expect(release).toHaveBeenCalledOnce();
  }
);

it.each([0, -1, NaN, Infinity])(
  'refuses invalid raster scale %s before managed allocation',
  async (scaleX) => {
    const { resources } = managedResources();
    await expect(
      createReviewWatermarkRenderer(
        settings(),
        { width: 1920, height: 1080 },
        undefined,
        undefined,
        { scaleX, scaleY: 1, resources }
      )
    ).rejects.toThrow('Invalid watermark raster scale.');
    expect(resources.canvas).not.toHaveBeenCalled();
  }
);

it('releases a managed text cache on abort and does not draw or release twice', async () => {
  const { resources, releases } = managedResources();
  const controller = new AbortController();
  const renderer = await createReviewWatermarkRenderer(
    settings(),
    { width: 1920, height: 1080 },
    controller.signal,
    undefined,
    { scaleX: 0.5, scaleY: 0.5, resources }
  );
  controller.abort();
  renderer.draw(contexts[1]!);
  renderer.dispose();
  expect(contexts[1]!.drawImage).not.toHaveBeenCalled();
  for (const release of releases) expect(release).toHaveBeenCalledOnce();
});

it('releases the measurement lease when canonical text metrics exceed their existing budget', async () => {
  const { resources, releases } = managedResources();
  await expect(
    createReviewWatermarkRenderer(
      settings(),
      { width: 1000000, height: 1000000 },
      undefined,
      undefined,
      { scaleX: 0.1, scaleY: 0.1, resources }
    )
  ).rejects.toThrow('Watermark cache budget exceeded.');
  expect(resources.canvas).toHaveBeenCalledOnce();
  expect(releases[0]).toHaveBeenCalledOnce();
});

it('measures once and exposes rounded allocation before painting the captured canonical text', async () => {
  const { resources, releases } = managedResources();
  const value = settings();
  const measured = await measureReviewWatermark(
    value,
    { width: 1920, height: 1080 },
    new AbortController().signal,
    { scaleX: 0.333, scaleY: 0.333, resources }
  );
  expect(resources.canvas).toHaveBeenCalledTimes(1);
  expect(releases[0]).toHaveBeenCalledOnce();
  expect(measured.kind).toBe('text');
  expect(Object.isFrozen(measured.cache)).toBe(true);
  const calls = vi.mocked(contexts[0]!.measureText).mock.calls.length;
  value.text.value = 'changed';
  const painter = await measured.paint();
  expect(resources.canvas).toHaveBeenLastCalledWith('watermark-cache', measured.cache);
  expect(vi.mocked(contexts[0]!.measureText).mock.calls).toHaveLength(calls);
  expect(contexts[1]!.fillText).not.toHaveBeenCalledWith(
    'changed',
    expect.anything(),
    expect.anything()
  );
  expect(load).toHaveBeenCalledTimes(1);
  painter.dispose();
});

it('exposes image source storage without decoding and rejects painting an aborted descriptor', async () => {
  const { resources } = managedResources();
  const controller = new AbortController();
  const read = vi.fn();
  const measured = await measureReviewWatermark(
    {
      ...settings(),
      mode: 'image',
      image: {
        assetId: 'project-asset:logo',
        width: 400,
        height: 200,
        size: 0.2,
        opacity: 1,
      },
    },
    { width: 1920, height: 1080 },
    controller.signal,
    { scaleX: 0.25, scaleY: 0.25, resources }
  );
  expect(measured.cache).toEqual({ width: 96, height: 48 });
  expect(measured.source).toEqual({ width: 400, height: 200 });
  expect(resources.canvas).not.toHaveBeenCalled();
  expect(resources.bytes).not.toHaveBeenCalled();
  controller.abort();
  await expect(measured.paint(read)).rejects.toThrow();
  expect(read).not.toHaveBeenCalled();
});

it('draws strikethrough with the same text alpha, alignment and raster transform', async () => {
  const value = settings();
  value.text.strike = true;
  value.text.value = 'Latin\nКириллица';
  const painter = await createReviewWatermarkRenderer(value, { width: 1920, height: 1080 });
  const context = contexts[0]!;
  const glyphs = vi.mocked(context.fillText).mock.calls;
  const strokes = vi.mocked(context.fillRect).mock.calls;
  expect(strokes).toHaveLength(glyphs.length);
  for (const [index, [text, x, y]] of glyphs.entries()) {
    const [left, top, width, height] = strokes[index]!;
    expect(left).toBe(x);
    expect(top).toBeCloseTo(y - 24 * 0.3);
    expect(width).toBe(text.length * 12);
    expect(height).toBeCloseTo(24 * 0.06);
  }
  expect(context.fillStyle).toBe(value.text.color);
  painter.dispose();
});

it('loads and paints italic with the same font description in preview and export', async () => {
  const value = settings();
  value.text.italic = true;
  const painter = await createReviewWatermarkRenderer(value, { width: 1920, height: 1080 });
  expect(load).toHaveBeenCalledWith('italic 700 24px "Sniptale Sans"', value.text.value);
  expect(contexts[0]!.font).toBe('italic 700 24px "Sniptale Sans"');
  painter.dispose();
});
