import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createBrowserFrameObjectsMock: vi.fn(),
  getSourceObjectMock: vi.fn(),
  isFrameObjectMock: vi.fn(),
}));

vi.mock('../../objects/browser-frame', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../objects/browser-frame')>()),
  createBrowserFrameObjects: mocks.createBrowserFrameObjectsMock,
}));

vi.mock('../document/layers', async () => ({
  ...(await vi.importActual<typeof import('../document/layers')>('../document/layers')),
  getSourceObject: mocks.getSourceObjectMock,
}));

vi.mock('../../document/model', async () => ({
  ...(await vi.importActual<typeof import('../../document/model')>('../../document/model')),
  isFrameObject: mocks.isFrameObjectMock,
}));

import { findBrowserFrameHeader, rebuildEditorFrameDecorations } from './decorations';

function createCanvasObject(id: string) {
  return {
    id,
    set: vi.fn(),
    setCoords: vi.fn(),
  };
}

function createCanvas() {
  const existingFrame = { id: 'existing-frame', kind: 'frame' };
  const existingHeader = { id: 'existing-header', kind: 'browser-frame' };

  return {
    add: vi.fn(),
    getObjects: vi.fn(() => [existingFrame, existingHeader]),
    remove: vi.fn(),
    sendObjectToBack: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isFrameObjectMock.mockImplementation(
    (object: { kind?: string }) => object.kind === 'frame'
  );
  mocks.getSourceObjectMock.mockReturnValue({
    clipPath: createCanvasObject('existing-clip'),
    height: 120,
    set: vi.fn(),
    setCoords: vi.fn(),
    width: 160,
  });
});

function createFrameDecorationRequest(canvas: ReturnType<typeof createCanvas>) {
  return {
    canvas: canvas as never,
    canvasSize: { width: 800, height: 600 },
    frame: {
      mode: 'frame',
      sourceImage: {
        opacity: 0.5,
        radius: 10,
        shadow: 0,
        strokeColor: '#123456',
        strokeOpacity: 1,
        strokeStyle: 'solid',
        strokeWidth: 2,
      },
    } as never,
    browserFrame: {
      canvasMode: 'resize',
      contentMode: 'push-down',
      title: 'Page title',
      faviconDataUrl: null,
      url: 'https://example.com',
    } as never,
    source: {
      displayHeight: 200,
      displayWidth: 320,
      left: 40,
      top: 98,
    } as never,
    renderToken: 2,
    isCurrentRenderToken: () => true,
  };
}

it('swaps only frame decorations and clears source clip paths after async rebuild completes', async () => {
  const canvas = createCanvas();
  const nextFrame = createCanvasObject('frame-1');
  const sourceObject = {
    clipPath: createCanvasObject('existing-clip'),
    height: 120,
    set: vi.fn(),
    setCoords: vi.fn(),
    width: 160,
  };

  mocks.getSourceObjectMock.mockReturnValue(sourceObject);
  mocks.createBrowserFrameObjectsMock.mockResolvedValue([nextFrame]);

  await expect(
    rebuildEditorFrameDecorations(createFrameDecorationRequest(canvas))
  ).resolves.toEqual({ aborted: false, frameObjectsCount: 1 });

  expect(canvas.remove).toHaveBeenCalledTimes(1);
  expect(canvas.remove).toHaveBeenCalledWith(expect.objectContaining({ id: 'existing-frame' }));
  expect(canvas.add).toHaveBeenNthCalledWith(1, nextFrame);
  expect(canvas.sendObjectToBack).toHaveBeenCalledWith(nextFrame);
  expect(mocks.getSourceObjectMock).toHaveBeenCalledWith(canvas);
  expect(sourceObject.clipPath).toBeUndefined();
  expect(sourceObject.set).toHaveBeenCalledWith(
    expect.objectContaining({ opacity: 0.5, stroke: null, strokeWidth: 0 })
  );
  expect((sourceObject as { sniptaleImageStrokeWidth?: number }).sniptaleImageStrokeWidth).toBe(2);
  expect(sourceObject.setCoords).toHaveBeenCalledTimes(2);
});

it('finds browser-frame layers by canonical object type', () => {
  const browserHeader = { sniptaleType: 'browser-frame' };
  const canvas = {
    getObjects: vi.fn(() => [{ sniptaleType: 'rectangle' }, browserHeader]),
  };

  expect(findBrowserFrameHeader(canvas as never)).toBe(browserHeader);
  expect(findBrowserFrameHeader(null)).toBeUndefined();
});

it('does not clear existing decorations when a newer render already owns the seam', async () => {
  const canvas = createCanvas();
  const nextFrame = createCanvasObject('frame-1');

  mocks.createBrowserFrameObjectsMock.mockResolvedValue([nextFrame]);

  await expect(
    rebuildEditorFrameDecorations({
      canvas: canvas as never,
      canvasSize: { width: 800, height: 600 },
      frame: { mode: 'frame' } as never,
      browserFrame: {
        canvasMode: 'resize',
        contentMode: 'push-down',
        faviconDataUrl: null,
        title: '',
        url: '',
      } as never,
      renderToken: 1,
      isCurrentRenderToken: () => false,
    })
  ).resolves.toEqual({ aborted: true, frameObjectsCount: 1 });

  expect(canvas.remove).not.toHaveBeenCalled();
  expect(canvas.add).not.toHaveBeenCalled();
  expect(canvas.sendObjectToBack).not.toHaveBeenCalled();
});

it('skips decoration work when the controller has no canvas', async () => {
  mocks.createBrowserFrameObjectsMock.mockResolvedValue([createCanvasObject('frame-1')]);

  await expect(
    rebuildEditorFrameDecorations({
      canvas: null,
      canvasSize: { width: 800, height: 600 },
      frame: { mode: 'frame' } as never,
      browserFrame: {
        canvasMode: 'resize',
        contentMode: 'push-down',
        faviconDataUrl: null,
        title: '',
        url: '',
      } as never,
      renderToken: 1,
      isCurrentRenderToken: () => true,
    })
  ).resolves.toEqual({ aborted: true, frameObjectsCount: 0 });

  expect(mocks.createBrowserFrameObjectsMock).not.toHaveBeenCalled();
});
