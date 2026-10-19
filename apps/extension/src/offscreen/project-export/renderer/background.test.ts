import { beforeEach, expect, it, vi } from 'vitest';
import { drawExportSceneBackground } from './background';

const {
  drawSceneBackgroundMock,
  getProjectSceneBackgroundMock,
  resolveSceneBackgroundAudioEnvelopeMock,
} = vi.hoisted(() => ({
  drawSceneBackgroundMock: vi.fn(),
  getProjectSceneBackgroundMock: vi.fn(() => ({ color: '#000000', kind: 'solid' })),
  resolveSceneBackgroundAudioEnvelopeMock: vi.fn(() => 0.5),
}));

vi.mock('../../../features/video/project/scene/background', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../features/video/project/scene/background')>()),
  drawSceneBackground: drawSceneBackgroundMock,
  getProjectSceneBackground: getProjectSceneBackgroundMock,
}));

vi.mock('../../../features/video/project/scene/background-audio', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../features/video/project/scene/background-audio')
  >()),
  resolveSceneBackgroundAudioEnvelope: resolveSceneBackgroundAudioEnvelopeMock,
}));

beforeEach(() => {
  vi.clearAllMocks();
  getProjectSceneBackgroundMock.mockReturnValue({ color: '#000000', kind: 'solid' });
  resolveSceneBackgroundAudioEnvelopeMock.mockReturnValue(0.5);
  vi.unstubAllGlobals();
});

it('draws export backgrounds with the shared time-aware resolver inputs', () => {
  const context = {} as CanvasRenderingContext2D;
  const project = { id: 'project', width: 640 } as never;
  const loadedImages = { image: {} as HTMLImageElement };

  drawExportSceneBackground({
    context,
    currentTime: 3,
    height: 720,
    loadedImages,
    project,
    width: 1280,
  });

  expect(resolveSceneBackgroundAudioEnvelopeMock).toHaveBeenCalledWith(project, 3);
  expect(getProjectSceneBackgroundMock).toHaveBeenCalledWith(project);
  expect(drawSceneBackgroundMock).toHaveBeenCalledWith({
    projectScale: 2,
    audioEnvelope: 0.5,
    context,
    currentTime: 3,
    height: 720,
    loadedImages,
    sceneBackground: { color: '#000000', kind: 'solid' },
    width: 1280,
  });
});

it('reuses a static background cache when the background key is unchanged', () => {
  const bufferContext = {} as CanvasRenderingContext2D;
  const context = { drawImage: vi.fn() } as unknown as CanvasRenderingContext2D;
  class OffscreenCanvasMock {
    getContext = vi.fn(() => bufferContext);

    constructor(_width: number, _height: number) {}
  }
  vi.stubGlobal('OffscreenCanvas', OffscreenCanvasMock as unknown as typeof OffscreenCanvas);
  const cache = { buffer: null, key: null };
  const params = {
    cache,
    context,
    currentTime: 3,
    height: 720,
    loadedImages: {},
    project: { id: 'project', width: 640 } as never,
    width: 1280,
  };

  drawExportSceneBackground(params);
  drawExportSceneBackground({ ...params, currentTime: 4 });

  expect(drawSceneBackgroundMock).toHaveBeenCalledTimes(1);
  expect(drawSceneBackgroundMock).toHaveBeenCalledWith(
    expect.objectContaining({ context: bufferContext, currentTime: 3 })
  );
  expect(context.drawImage).toHaveBeenCalledTimes(2);
});

it('uses document-backed buffers for cached image backgrounds when OffscreenCanvas is unavailable', () => {
  vi.stubGlobal('OffscreenCanvas', undefined);
  const buffer = {
    getContext: vi.fn(() => ({}) as CanvasRenderingContext2D),
    height: 0,
    width: 0,
  };
  const ownerDocument = { createElement: vi.fn(() => buffer) };
  const context = {
    canvas: { ownerDocument },
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
  getProjectSceneBackgroundMock.mockReturnValue({ assetId: 'image-1', kind: 'image' } as never);

  drawExportSceneBackground({
    cache: { buffer: null, key: null },
    context,
    currentTime: 3,
    height: 720,
    loadedImages: {},
    project: { id: 'project', width: 640 } as never,
    width: 1280,
  });

  expect(ownerDocument.createElement).toHaveBeenCalledWith('canvas');
  expect(buffer.height).toBe(720);
  expect(buffer.width).toBe(1280);
  expect(context.drawImage).toHaveBeenCalledWith(buffer, 0, 0, 1280, 720);
});

it('falls back to uncached drawing for dynamic or unavailable cache buffers', () => {
  vi.stubGlobal('OffscreenCanvas', undefined);
  vi.stubGlobal('document', undefined);
  const context = { drawImage: vi.fn() } as unknown as CanvasRenderingContext2D;
  const project = { id: 'project', width: 640 } as never;

  getProjectSceneBackgroundMock.mockReturnValue({ colors: [], kind: 'gradient' } as never);
  drawExportSceneBackground({
    cache: { buffer: null, key: null },
    context,
    currentTime: 3,
    height: 720,
    loadedImages: {},
    project,
    width: 1280,
  });

  getProjectSceneBackgroundMock.mockReturnValue({ color: '#000000', kind: 'solid' });
  drawExportSceneBackground({
    cache: { buffer: null, key: null },
    context,
    currentTime: 4,
    height: 720,
    loadedImages: {},
    project,
    width: 1280,
  });

  expect(drawSceneBackgroundMock).toHaveBeenCalledTimes(2);
  expect(context.drawImage).not.toHaveBeenCalled();
});

it('invalidates cached image paint for blur, fit, source and authored pixel scale changes', () => {
  const context = { drawImage: vi.fn() } as unknown as CanvasRenderingContext2D;
  class CanvasMock {
    getContext = () => ({});
    constructor(_w: number, _h: number) {}
  }
  vi.stubGlobal('OffscreenCanvas', CanvasMock);
  const cache = { buffer: null, key: null };
  const params = {
    cache,
    context,
    currentTime: 0,
    height: 180,
    loadedImages: {},
    project: { width: 320 } as never,
    width: 320,
  };
  for (const background of [
    { kind: 'image', assetId: 'image', blur: 0 },
    { kind: 'image', assetId: 'image', blur: 12 },
    { kind: 'image', assetId: 'image', blur: 12, imageFit: 'contain' },
    { kind: 'image', assetId: 'other', blur: 12, imageFit: 'contain' },
  ]) {
    getProjectSceneBackgroundMock.mockReturnValue(background as never);
    const before = drawSceneBackgroundMock.mock.calls.length;
    drawExportSceneBackground(params);
    drawExportSceneBackground(params);
    expect(drawSceneBackgroundMock.mock.calls.length).toBe(before + 1);
  }
  drawExportSceneBackground({ ...params, project: { width: 640 } as never });
  expect(drawSceneBackgroundMock).toHaveBeenCalledTimes(5);
});

it('retries a failed static raster instead of publishing an incomplete cached surface', () => {
  const context = { drawImage: vi.fn() } as unknown as CanvasRenderingContext2D;
  class CanvasMock {
    getContext = () => ({});
    constructor(_w: number, _h: number) {}
  }
  vi.stubGlobal('OffscreenCanvas', CanvasMock);
  getProjectSceneBackgroundMock.mockReturnValue({
    kind: 'image',
    assetId: 'image',
    blur: 12,
  } as never);
  const cache = { buffer: null, key: null };
  const params = {
    cache,
    context,
    currentTime: 0,
    height: 180,
    loadedImages: {},
    project: { width: 320 } as never,
    width: 320,
  };
  drawSceneBackgroundMock.mockImplementationOnce(() => {
    throw new Error('native filter failed');
  });
  expect(() => drawExportSceneBackground(params)).toThrow('native filter failed');
  expect(cache.key).toBeNull();
  expect(context.drawImage).not.toHaveBeenCalled();
  drawExportSceneBackground(params);
  expect(drawSceneBackgroundMock).toHaveBeenCalledTimes(2);
  expect(context.drawImage).toHaveBeenCalledOnce();
});
