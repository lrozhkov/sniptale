// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { DEFAULT_WINDOW_HEADER } from '@sniptale/runtime-contracts/window-header';
import { createZoomPreviewGpuArtwork } from './zoom-preview-gpu-artwork';
import { computeQuickEditSceneLayout } from '../../features/video/review/advanced/scene';
import type { RenderResources } from '../../features/video/composition/canvas/render-resources';
import type { createReviewBackgroundPainter } from '../../workflows/video-review/scene-background';

afterEach(() => vi.unstubAllGlobals());
function fixture() {
  const leases: {
    release: ReturnType<typeof vi.fn>;
    context: { drawImage: ReturnType<typeof vi.fn> };
  }[] = [];
  const canvas = vi.fn((_role: string, size: { width: number; height: number }) => {
    const value = {
      canvas: Object.assign(document.createElement('canvas'), size),
      context: { translate: vi.fn(), drawImage: vi.fn(), fillRect: vi.fn() },
      release: vi.fn(),
    };
    leases.push(value);
    return value;
  });
  const painter = { draw: vi.fn((_context: CanvasRenderingContext2D, _settings: unknown) => {}) };
  const owner = createZoomPreviewGpuArtwork(
    { canvas } as unknown as RenderResources,
    painter as unknown as ReturnType<typeof createReviewBackgroundPainter>
  );
  const output = { width: 320, height: 200 };
  const input: Parameters<typeof owner.prepare>[0] = {
    output,
    background: { enabled: false },
    imageUrl: null,
    cornerRadius: 0,
    layout: computeQuickEditSceneLayout({
      source: { width: 320, height: 180 },
      output,
      background: { enabled: false },
      windowHeader: { ...DEFAULT_WINDOW_HEADER, kind: 'browser' },
      camera: { scale: 1, centerX: 0.5, centerY: 0.5 },
    }),
  };
  return { owner, input, canvas, painter, leases, signal: new AbortController().signal };
}
function imageLoader() {
  const images: { src: string; onload: (() => void) | null; onerror: (() => void) | null }[] = [];
  vi.stubGlobal(
    'Image',
    class {
      src = '';
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor() {
        images.push(this);
      }
    }
  );
  return images;
}
const imageBackground = {
  enabled: true,
  type: 'image',
  assetId: 'image',
  imageFit: 'cover',
  zoomBehavior: 'fixed',
  layout: { padding: 0, cornerRadius: 0, blur: 8, shadow: { intensity: 0, color: '#000000' } },
} as const;

it('reuses static artwork and invalidates its leases when the header changes', async () => {
  const f = fixture();
  const first = await f.owner.prepare(f.input, f.signal);
  expect(await f.owner.prepare({ ...f.input, currentTime: 2 }, f.signal)).toBe(first);
  expect(f.painter.draw).toHaveBeenCalledOnce();
  const header = document.createElement('canvas');
  const next = await f.owner.prepare({ ...f.input, headerImage: header }, f.signal);
  expect(next).not.toBe(first);
  expect(f.leases[0]!.release).toHaveBeenCalledOnce();
  expect(f.leases[1]!.release).toHaveBeenCalledOnce();
  expect(next.header).not.toBeNull();
  expect(next.header!.context.drawImage).toHaveBeenCalledWith(
    header,
    0,
    0,
    next.header!.canvas.width,
    next.header!.canvas.height
  );
  f.owner.dispose();
  f.owner.dispose();
  for (const lease of f.leases) expect(lease.release).toHaveBeenCalledOnce();
});

it('loads and reuses a background image, scales blur and replaces the previous image', async () => {
  const images = imageLoader();
  const f = fixture();
  const input = {
    ...f.input,
    background: imageBackground,
    imageUrl: 'blob:first',
    previewScale: 0.5,
  };
  const pending = f.owner.prepare(input, f.signal);
  expect(images).toHaveLength(1);
  images[0]!.onload!();
  const first = await pending;
  expect(f.painter.draw.mock.lastCall![1]).toMatchObject({
    image: images[0],
    background: { layout: { blur: 4 } },
  });
  expect(await f.owner.prepare(input, f.signal)).toBe(first);
  expect(images).toHaveLength(1);
  const replacement = f.owner.prepare({ ...input, imageUrl: 'blob:second' }, f.signal);
  images[1]!.onload!();
  await replacement;
  expect(images[0]!.src).toBe('');
  f.owner.dispose();
  expect(images[1]!.src).toBe('');
  expect(images[1]!.onload).toBeNull();
  expect(images[1]!.onerror).toBeNull();
});

it('repaints animated backgrounds with the requested programme time', async () => {
  const f = fixture();
  const input = {
    ...f.input,
    background: {
      ...imageBackground,
      type: 'solid' as const,
      color: '#101010',
      motion: { mode: 'drift' as const, speed: 50, intensity: 50 },
    },
    currentTime: 1,
  };
  const art = await f.owner.prepare(input, f.signal);
  expect(art.backgroundRevision).toBe(1);
  expect(await f.owner.prepare({ ...input, currentTime: 3 }, f.signal)).toBe(art);
  expect(art.backgroundRevision).toBe(2);
  expect(f.painter.draw.mock.lastCall![1]).toMatchObject({ currentTime: 3 });
  f.owner.dispose();
});

it.each(['abort', 'error', 'already-aborted'] as const)(
  'cleans image handlers after %s without admitting artwork',
  async (outcome) => {
    const images = imageLoader();
    const f = fixture();
    const controller = new AbortController();
    if (outcome === 'already-aborted') controller.abort();
    const pending = f.owner.prepare(
      { ...f.input, background: imageBackground, imageUrl: 'blob:failed' },
      controller.signal
    );
    const rejected = expect(pending).rejects.toThrow(
      outcome === 'error' ? 'Inspector background is unavailable.' : undefined
    );
    if (outcome === 'abort') controller.abort();
    if (outcome === 'error') images[0]!.onerror!();
    await rejected;
    expect(f.canvas).not.toHaveBeenCalled();
    expect(images[0]!.onload).toBeNull();
    expect(images[0]!.onerror).toBeNull();
    if (outcome !== 'error') expect(images[0]!.src).toBe('');
    f.owner.dispose();
  }
);

it('releases partial allocations when header rasterization fails and can retry', async () => {
  const f = fixture();
  const allocate = f.canvas.getMockImplementation()!;
  f.canvas.mockImplementation((role, size) => {
    const lease = allocate(role, size);
    if (role === 'inspector-gpu-header')
      lease.context.drawImage.mockImplementationOnce(() => {
        throw new Error('Header failed');
      });
    return lease;
  });
  await expect(
    f.owner.prepare({ ...f.input, headerImage: document.createElement('canvas') }, f.signal)
  ).rejects.toThrow('Header failed');
  expect(f.leases).toHaveLength(3);
  for (const lease of f.leases) expect(lease.release).toHaveBeenCalledOnce();
  await f.owner.prepare(f.input, f.signal);
  f.owner.dispose();
  for (const lease of f.leases) expect(lease.release).toHaveBeenCalledOnce();
});

it('borrows native sources and caches only converted non-native source rasters', () => {
  const f = fixture();
  class NativeFrame {
    close = vi.fn();
  }
  class NativeBitmap {
    close = vi.fn();
  }
  class NativeOffscreen {}
  vi.stubGlobal('VideoFrame', NativeFrame);
  vi.stubGlobal('ImageBitmap', NativeBitmap);
  vi.stubGlobal('OffscreenCanvas', NativeOffscreen);
  const borrowed = [
    document.createElement('canvas'),
    new NativeFrame(),
    new NativeBitmap(),
    new NativeOffscreen(),
  ];
  for (const image of borrowed)
    expect(f.owner.source({ image: image as CanvasImageSource, width: 320, height: 180 })).toBe(
      image
    );
  expect(f.canvas).not.toHaveBeenCalled();
  const image = document.createElement('img');
  const frame = { image, width: 320, height: 180 };
  const raster = f.owner.source(frame);
  expect(f.owner.source(frame)).toBe(raster);
  expect(f.leases[0]!.context.drawImage).toHaveBeenCalledOnce();
  f.owner.source({ ...frame, image: document.createElement('img') });
  expect(f.leases[0]!.release).toHaveBeenCalledOnce();
  f.owner.clear();
  expect(f.leases[1]!.release).toHaveBeenCalledOnce();
  f.owner.source(null);
  expect(f.canvas.mock.lastCall![1]).toEqual({ width: 1, height: 1 });
  f.owner.dispose();
  expect((borrowed[1] as NativeFrame).close).not.toHaveBeenCalled();
  expect((borrowed[2] as NativeBitmap).close).not.toHaveBeenCalled();
});
