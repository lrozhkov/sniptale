import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { acquireVideoCompositionBuffer } from '../../composition/canvas/buffer-pool';
vi.mock('../../composition/canvas/buffer-pool', () => ({ acquireVideoCompositionBuffer: vi.fn() }));
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  vi.mocked(acquireVideoCompositionBuffer).mockReset();
});
import {
  drawSceneBackground,
  getProjectSceneBackground,
  getProjectSceneBackgroundImageAssetId,
  getSceneBackgroundLegacyColor,
  syncProjectSceneBackground,
} from './background';
import { VideoSceneBackgroundKind } from '../types/index';

function createContext() {
  return {
    beginPath: vi.fn(),
    clip: vi.fn(),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    drawImage: vi.fn(),
    fillRect: vi.fn(),
    rect: vi.fn(),
    restore: vi.fn(),
    save: vi.fn(),
    set fillStyle(_value: unknown) {},
  } as unknown as CanvasRenderingContext2D;
}

it('normalizes legacy solid backgrounds and syncs the legacy color field', () => {
  const project = { backgroundColor: '#101010' };
  const sceneBackground = getProjectSceneBackground(project);

  expect(sceneBackground).toEqual({
    color: '#101010',
    kind: VideoSceneBackgroundKind.SOLID,
  });
  expect(syncProjectSceneBackground(project, sceneBackground)).toEqual({
    backgroundColor: '#101010',
    sceneBackground,
  });
});

it('resolves image asset references and fallback colors', () => {
  expect(
    getProjectSceneBackgroundImageAssetId({
      backgroundColor: '#000000',
      sceneBackground: { kind: 'image', assetId: 'image-1' },
    })
  ).toBe('image-1');
  expect(
    getSceneBackgroundLegacyColor({
      assetId: 'image-1',
      kind: VideoSceneBackgroundKind.IMAGE,
    })
  ).toBe('#eef2f7');
});

it('fills the image fallback color and draws loaded images when available', () => {
  const context = createContext();

  drawSceneBackground({
    context,
    height: 100,
    sceneBackground: { assetId: 'missing', kind: VideoSceneBackgroundKind.IMAGE },
    width: 200,
  });
  drawSceneBackground({
    context,
    height: 100,
    loadedImages: {
      hero: {
        naturalHeight: 50,
        naturalWidth: 25,
      } as HTMLImageElement,
    },
    sceneBackground: { assetId: 'hero', kind: VideoSceneBackgroundKind.IMAGE },
    width: 200,
  });

  expect(context.fillRect).toHaveBeenCalledWith(0, 0, 200, 100);
  expect(context.drawImage).toHaveBeenCalled();
});

it('draws canonical gradients through the scene entry point and forwards animation inputs', async () => {
  const { createSceneGradientBackground } = await import('./background-gradient');
  const background = createSceneGradientBackground();
  background.animation = { mode: 'rotate', speed: 80, intensity: 70 };
  const context = createContext();
  drawSceneBackground({ context, sceneBackground: background, width: 200, height: 100 });
  const initial = vi.mocked(context.createLinearGradient).mock.calls[0];
  drawSceneBackground({
    context,
    sceneBackground: background,
    width: 200,
    height: 100,
    currentTime: 3,
    audioEnvelope: 0.8,
  });
  expect(vi.mocked(context.createLinearGradient).mock.calls[1]).not.toEqual(initial);
  expect(context.fillRect).toHaveBeenCalledTimes(2);
});

it.each([
  { imageFit: 'cover' as const, expected: [0, -150, 200, 400] },
  { imageFit: 'contain' as const, expected: [75, 0, 50, 100] },
  { imageFit: undefined, expected: [0, -150, 200, 400] },
])('draws the original image with centered $imageFit geometry', ({ imageFit, expected }) => {
  const context = createContext();
  const image = { naturalWidth: 25, naturalHeight: 50 } as HTMLImageElement;
  drawSceneBackground({
    context,
    width: 200,
    height: 100,
    loadedImages: { image },
    sceneBackground: { kind: 'image', assetId: 'image', ...(imageFit ? { imageFit } : {}) },
  });
  expect(context.drawImage).toHaveBeenCalledWith(image, ...expected);
  expect(context.fillRect).toHaveBeenCalledWith(0, 0, 200, 100);
});

function mockSurfaces() {
  const surfaces: {
    canvas: OffscreenCanvas;
    context: CanvasRenderingContext2D;
    release: ReturnType<typeof vi.fn>;
  }[] = [];
  vi.mocked(acquireVideoCompositionBuffer).mockImplementation((width, height) => {
    const context = {
      ...createContext(),
      filter: 'none',
      setTransform: vi.fn(),
      clearRect: vi.fn(),
    };
    const canvas = {
      width,
      height,
      getContext: vi.fn(() => context),
    } as unknown as OffscreenCanvas;
    const release = vi.fn();
    surfaces.push({ canvas, context, release });
    return { canvas, release };
  });
  return surfaces;
}

it('scales blur once into the raster and releases every exclusive surface after drawing', () => {
  const surfaces = mockSurfaces(),
    context = createContext();
  drawSceneBackground({
    context,
    sceneBackground: { kind: 'image', assetId: 'image', imageFit: 'contain', blur: 8 },
    width: 200,
    height: 100,
    projectScale: 0.5,
  });
  expect(surfaces.map(({ canvas }) => [canvas.width, canvas.height])).toEqual([
    [200, 100],
    [200, 100],
    [228, 128],
  ]);
  expect(surfaces[0]!.context.fillRect).toHaveBeenCalledWith(0, 0, 200, 100);
  expect(surfaces[1]!.context.drawImage).toHaveBeenCalledWith(surfaces[2]!.canvas, -14, -14);
  expect(context.drawImage).toHaveBeenCalledWith(surfaces[1]!.canvas, 0, 0, 200, 100);
  vi.advanceTimersByTime(1000);
  for (const surface of surfaces) expect(surface.release).toHaveBeenCalledOnce();
});

it('bounds raster, kernel and total scratch memory for tiny projects exported to large canvases', () => {
  const surfaces = mockSurfaces();
  drawSceneBackground({
    context: createContext(),
    sceneBackground: { kind: 'image', assetId: 'image', blur: 25 },
    width: 8192,
    height: 8192,
    projectScale: 8192,
  });
  expect(surfaces).toHaveLength(3);
  for (const { canvas } of surfaces.slice(0, 2))
    expect(Math.max(canvas.width, canvas.height)).toBeLessThanOrEqual(2048);
  expect(Math.max(surfaces[2]!.canvas.width, surfaces[2]!.canvas.height)).toBeLessThanOrEqual(2820);
  expect(
    surfaces.reduce((bytes, { canvas }) => bytes + canvas.width * canvas.height * 4, 0)
  ).toBeLessThan(64 * 1024 * 1024);
});

it('keeps solid and zero-blur backgrounds on the allocation-free sharp path', () => {
  const context = createContext();
  for (const sceneBackground of [
    { kind: 'solid' as const, color: '#abcdef', blur: 25 },
    { kind: 'image' as const, assetId: 'image', blur: 0 },
  ])
    drawSceneBackground({ context, sceneBackground, width: 200, height: 100 });
  expect(acquireVideoCompositionBuffer).not.toHaveBeenCalled();
  expect(context.fillRect).toHaveBeenCalledTimes(2);
});

it.each([1, 2, 3])(
  'releases earlier surfaces when allocation %s fails without a sharp fallback',
  (failure) => {
    const surfaces = mockSurfaces(),
      context = createContext();
    const allocate = vi.mocked(acquireVideoCompositionBuffer).getMockImplementation()!;
    let call = 0;
    vi.mocked(acquireVideoCompositionBuffer).mockImplementation((...args) =>
      ++call === failure ? null : allocate(...args)
    );
    expect(() =>
      drawSceneBackground({
        context,
        sceneBackground: { kind: 'image', assetId: 'image', blur: 8 },
        width: 200,
        height: 100,
      })
    ).toThrow('Scene background compositor is unavailable.');
    for (const surface of surfaces) expect(surface.release).toHaveBeenCalledOnce();
    expect(context.drawImage).not.toHaveBeenCalled();
    expect(context.fillRect).not.toHaveBeenCalled();
  }
);

it('releases every surface after native draw failure and restores filtering', () => {
  const surfaces = mockSurfaces(),
    context = createContext();
  vi.mocked(context.drawImage).mockImplementation(() => {
    throw new Error('native draw failed');
  });
  expect(() =>
    drawSceneBackground({
      context,
      sceneBackground: { kind: 'image', assetId: 'image', blur: 8 },
      width: 200,
      height: 100,
    })
  ).toThrow('native draw failed');
  for (const surface of surfaces) expect(surface.release).toHaveBeenCalledOnce();
  expect(surfaces[1]!.context.filter).toBe('none');
});

it('reuses a static raster and returns its lease after one second without retaining the image', () => {
  const surfaces = mockSurfaces(),
    context = createContext();
  const params = {
    context,
    width: 200,
    height: 100,
    sceneBackground: { kind: 'image' as const, assetId: 'image', blur: 8 },
  };
  drawSceneBackground(params);
  expect(surfaces).toHaveLength(3);
  expect(surfaces[1]!.release).not.toHaveBeenCalled();
  drawSceneBackground({ ...params, currentTime: 50, audioEnvelope: 1 });
  expect(surfaces).toHaveLength(3);
  expect(context.drawImage).toHaveBeenCalledTimes(2);
  vi.advanceTimersByTime(1000);
  for (const surface of surfaces) expect(surface.release).toHaveBeenCalledOnce();
  drawSceneBackground(params);
  expect(surfaces).toHaveLength(6);
});

it('invalidates static rasters for blur, fit, dimensions, image identity and decoded image size', () => {
  const surfaces = mockSurfaces(),
    context = createContext();
  const image = { naturalWidth: 100, naturalHeight: 50 } as HTMLImageElement;
  const params = {
    context,
    width: 200,
    height: 100,
    loadedImages: { image },
    sceneBackground: { kind: 'image' as const, assetId: 'image', blur: 8 },
  };
  drawSceneBackground(params);
  const updates = [
    { ...params, sceneBackground: { ...params.sceneBackground, blur: 4 } },
    { ...params, sceneBackground: { ...params.sceneBackground, imageFit: 'contain' as const } },
    { ...params, width: 300 },
    { ...params, loadedImages: { image: { ...image } as HTMLImageElement } },
  ];
  for (const [index, next] of updates.entries()) {
    drawSceneBackground(next);
    expect(surfaces).toHaveLength((index + 2) * 3);
    expect(surfaces[index * 3 + 1]!.release).toHaveBeenCalledOnce();
  }
  drawSceneBackground(params);
  Object.defineProperty(image, 'naturalWidth', { value: 200 });
  drawSceneBackground(params);
  expect(surfaces).toHaveLength(21);
  drawSceneBackground({ ...params, sceneBackground: { ...params.sceneBackground, blur: 0 } });
  expect(surfaces.at(-2)!.release).toHaveBeenCalledOnce();
});

it('does not cache animation and releases prior static paint before dynamic rendering', async () => {
  const surfaces = mockSurfaces(),
    context = createContext();
  const background = (await import('./background-gradient')).createSceneGradientBackground();
  const params = { context, width: 200, height: 100, sceneBackground: { ...background, blur: 8 } };
  drawSceneBackground(params);
  for (const currentTime of [1, 2])
    drawSceneBackground({
      ...params,
      currentTime,
      sceneBackground: {
        ...params.sceneBackground,
        animation: { mode: 'rotate', speed: 80, intensity: 70 },
      },
    });
  expect(surfaces).toHaveLength(9);
  for (const surface of surfaces) expect(surface.release).toHaveBeenCalledOnce();
});

it('releases a cached raster on destination failure and retries cleanly', () => {
  const surfaces = mockSurfaces(),
    context = createContext();
  const params = {
    context,
    width: 200,
    height: 100,
    sceneBackground: { kind: 'image' as const, assetId: 'image', blur: 8 },
  };
  drawSceneBackground(params);
  vi.mocked(context.drawImage).mockImplementationOnce(() => {
    throw new Error('destination failed');
  });
  expect(() => drawSceneBackground(params)).toThrow('destination failed');
  for (const surface of surfaces) expect(surface.release).toHaveBeenCalledOnce();
  drawSceneBackground(params);
  expect(surfaces).toHaveLength(6);
});

it.each([0, 1, 2])('releases all leases when surface %s has no 2d compositor', (failure) => {
  const surfaces = mockSurfaces(),
    context = createContext();
  const allocate = vi.mocked(acquireVideoCompositionBuffer).getMockImplementation()!;
  vi.mocked(acquireVideoCompositionBuffer).mockImplementation((...args) => {
    const lease = allocate(...args)!;
    if (surfaces.length - 1 === failure) vi.mocked(lease.canvas.getContext).mockReturnValue(null);
    return lease;
  });
  expect(() =>
    drawSceneBackground({
      context,
      width: 200,
      height: 100,
      sceneBackground: { kind: 'image', assetId: 'image', blur: 8 },
    })
  ).toThrow('Scene background compositor is unavailable.');
  for (const surface of surfaces) expect(surface.release).toHaveBeenCalledOnce();
  expect(context.drawImage).not.toHaveBeenCalled();
});

it('does not paint or request a disabled background image and leaves retained bytes referenced', () => {
  const context = createContext();
  const sceneBackground = {
    kind: 'image' as const,
    assetId: 'retained',
    blur: 5,
    enabled: false as const,
  };
  drawSceneBackground({ context, sceneBackground, width: 200, height: 100 });
  expect(context.fillRect).not.toHaveBeenCalled();
  expect(context.drawImage).not.toHaveBeenCalled();
  expect(acquireVideoCompositionBuffer).not.toHaveBeenCalled();
  expect(
    getProjectSceneBackgroundImageAssetId({ backgroundColor: '#00000000', sceneBackground })
  ).toBeNull();
  expect(getSceneBackgroundLegacyColor(sceneBackground)).toBe('#00000000');
  expect(getProjectSceneBackground({ backgroundColor: '#00000000', sceneBackground })).toEqual(
    sceneBackground
  );
});

it('restores the background camera context after paint failure and leaves disabled paint untouched', () => {
  const context = createContext();
  const scale = vi.fn(),
    translate = vi.fn();
  context.scale = scale;
  context.translate = translate;
  const paint = {
    context,
    width: 640,
    height: 360,
    projectScale: 0.5,
    sceneBackground: { kind: 'solid' as const, color: '#123456' },
    camera: { scale: 2, viewportX: 40, viewportY: 30 },
  };
  drawSceneBackground(paint);
  expect(scale).toHaveBeenCalledExactlyOnceWith(2, 2);
  expect(translate).toHaveBeenCalledExactlyOnceWith(-20, -15);
  vi.mocked(context.fillRect).mockImplementationOnce(() => {
    throw new Error('paint failed');
  });
  expect(() => drawSceneBackground(paint)).toThrow('paint failed');
  expect(context.restore).toHaveBeenCalledTimes(2);
  vi.clearAllMocks();
  drawSceneBackground({ ...paint, sceneBackground: { ...paint.sceneBackground, enabled: false } });
  expect(scale).not.toHaveBeenCalled();
  expect(context.fillRect).not.toHaveBeenCalled();
});
