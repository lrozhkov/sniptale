import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createBrowserFrameLayerObject: vi.fn(),
  readCurrentBrowserFrameSourceState: vi.fn(),
}));

vi.mock('../../../../objects/browser-frame', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../objects/browser-frame')>()),
  createBrowserFrameLayerObject: mocks.createBrowserFrameLayerObject,
}));

vi.mock('../../../browser-frame/source-state', () => ({
  readCurrentBrowserFrameSourceState: mocks.readCurrentBrowserFrameSourceState,
}));

import { upsertBrowserFrameLayer } from './upsert';

function createCanvas(objects: unknown[]) {
  return {
    add: vi.fn((object: unknown) => objects.push(object)),
    bringObjectToFront: vi.fn(),
    getObjects: vi.fn(() => objects),
    moveObjectTo: vi.fn(),
    remove: vi.fn((object: unknown) => {
      objects.splice(objects.indexOf(object), 1);
    }),
    requestRenderAll: vi.fn(),
    setActiveObject: vi.fn(),
  };
}

function createOptions(canvas: ReturnType<typeof createCanvas> | null) {
  return {
    canvas,
    canvasDocumentSize: { height: 500, width: 700 },
    commitHistory: vi.fn(),
    ensureBrowserFrameOnTop: vi.fn(),
    nextLabelIndex: vi.fn(() => 9),
    prepareObject: vi.fn(),
    relayoutScene: vi.fn(),
    source: null,
    store: {
      getBrowserFrame: vi.fn(),
      getFrame: vi.fn(() => ({ padding: 0 })),
      setBrowserFrame: vi.fn(),
    },
    syncRuntimeState: vi.fn(),
  };
}

it('skips upsert without an editable canvas or source state', async () => {
  await expect(upsertBrowserFrameLayer(createOptions(null) as never, {} as never)).resolves.toBe(
    false
  );

  const canvas = createCanvas([]);
  mocks.readCurrentBrowserFrameSourceState.mockReturnValueOnce(null);
  await expect(upsertBrowserFrameLayer(createOptions(canvas) as never, {} as never)).resolves.toBe(
    false
  );
});

it('creates and installs a browser-frame layer before syncing scene order', async () => {
  const canvas = createCanvas([]);
  const nextLayer = { setCoords: vi.fn() };
  const options = createOptions(canvas);
  const browserFrame = { canvasMode: 'keep-size', contentMode: 'fit-content' };
  mocks.readCurrentBrowserFrameSourceState.mockReturnValueOnce({
    displayHeight: 300,
    displayWidth: 400,
    left: 10,
    top: 40,
  });
  mocks.createBrowserFrameLayerObject.mockResolvedValueOnce(nextLayer);

  await expect(upsertBrowserFrameLayer(options as never, browserFrame as never)).resolves.toBe(
    true
  );

  expect(mocks.createBrowserFrameLayerObject).toHaveBeenCalledWith(
    expect.objectContaining({
      browserFrame,
      left: expect.any(Number),
      nextLabelIndex: 9,
      prepareObject: options.prepareObject,
      top: expect.any(Number),
      width: expect.any(Number),
    })
  );
  expect(options.relayoutScene).toHaveBeenCalledWith(
    browserFrame,
    expect.objectContaining({ hasBrowserFrame: true })
  );
  expect(canvas.add).toHaveBeenCalledWith(nextLayer);
  expect(options.ensureBrowserFrameOnTop).toHaveBeenCalledOnce();
  expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
});
