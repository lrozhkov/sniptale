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
  const project = { id: 'project' } as never;
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
    project: { id: 'project' } as never,
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
    project: { id: 'project' } as never,
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
  const project = { id: 'project' } as never;

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
