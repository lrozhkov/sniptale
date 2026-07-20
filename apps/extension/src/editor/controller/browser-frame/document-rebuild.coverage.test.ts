import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createBrowserFrameLayerObjectMock: vi.fn(),
  createBrowserFrameRebuildDonePayloadMock: vi.fn(() => ({ kind: 'done-payload' })),
  createBrowserFrameRebuildPayloadMock: vi.fn(() => ({ kind: 'start-payload' })),
  debugMock: vi.fn(),
  findBrowserFrameHeaderMock: vi.fn(),
  getEditorStoreStateMock: vi.fn(() => ({
    browserFrame: { enabled: true },
    frame: { mode: 'browser' },
  })),
  getSourceObjectMock: vi.fn(),
  rebuildEditorFrameDecorationsMock: vi.fn(),
}));

vi.mock('@sniptale/platform/observability/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/observability/logger')>()),
  createLogger: () => ({ debug: mocks.debugMock }),
}));
vi.mock('../../state/useEditorStore', () => ({
  useEditorStore: { getState: mocks.getEditorStoreStateMock },
}));
vi.mock('../tools/decorations', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../tools/decorations')>()),
  findBrowserFrameHeader: mocks.findBrowserFrameHeaderMock,
  rebuildEditorFrameDecorations: mocks.rebuildEditorFrameDecorationsMock,
}));
vi.mock('../document/lifecycle-helpers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../document/lifecycle-helpers')>()),
  createBrowserFrameRebuildDonePayload: mocks.createBrowserFrameRebuildDonePayloadMock,
  createBrowserFrameRebuildPayload: mocks.createBrowserFrameRebuildPayloadMock,
}));
vi.mock('../../objects/browser-frame', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../objects/browser-frame')>()),
  createBrowserFrameLayerObject: mocks.createBrowserFrameLayerObjectMock,
}));
vi.mock('../document/layers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../document/layers')>()),
  getSourceObject: mocks.getSourceObjectMock,
}));
vi.mock('../document/scene', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../document/scene')>()),
  relayoutEditorScene: vi.fn(),
}));

import { rebuildEditorControllerFrameDecorations } from './document';

beforeEach(() => {
  vi.clearAllMocks();
});

function createCanvas(header: unknown) {
  return {
    add: vi.fn(),
    getActiveObjects: vi.fn(() => [header]),
    getObjects: vi.fn(() => [header]),
    moveObjectTo: vi.fn(),
    remove: vi.fn(),
    requestRenderAll: vi.fn(),
    setActiveObject: vi.fn(),
  };
}

it('preserves active browser-frame header metadata during rebuild replacement', async () => {
  const header = {
    getScaledWidth: vi.fn(() => 320),
    sniptaleId: 'browser-frame-1',
    sniptaleLabel: 'Browser Header 1',
    sniptaleLocked: true,
    visible: false,
  };
  const canvas = createCanvas(header);
  const nextHeader: Record<string, unknown> = {};
  mocks.findBrowserFrameHeaderMock.mockReturnValue(header);
  mocks.getSourceObjectMock.mockReturnValue({
    getScaledHeight: vi.fn(() => 180),
    getScaledWidth: vi.fn(() => 320),
    left: 24,
    top: 98,
  });
  mocks.createBrowserFrameLayerObjectMock.mockImplementation(async (options) => {
    options.prepareObject(nextHeader);
    return nextHeader;
  });

  await rebuildEditorControllerFrameDecorations({
    browserFrameRenderToken: 1,
    canvas: canvas as never,
    canvasDocumentSize: { width: 800, height: 600 },
    ensureBrowserFrameOnTop: vi.fn(),
    setBrowserFrameRenderToken: vi.fn(),
  });

  expect(mocks.createBrowserFrameLayerObjectMock).toHaveBeenCalledWith(
    expect.objectContaining({ left: 24, top: 98, width: 320 })
  );
  expect(nextHeader).toMatchObject({
    sniptaleId: 'browser-frame-1',
    sniptaleLabel: 'Browser Header 1',
    sniptaleLocked: true,
    visible: false,
  });
  expect(canvas.setActiveObject).toHaveBeenCalledWith(nextHeader);
});

it('skips browser-frame header replacement when no source state remains', async () => {
  const header = { getScaledWidth: vi.fn(() => 320) };
  const canvas = createCanvas(header);
  mocks.findBrowserFrameHeaderMock.mockReturnValue(header);
  mocks.getSourceObjectMock.mockReturnValue(undefined);

  await rebuildEditorControllerFrameDecorations({
    browserFrameRenderToken: 1,
    canvas: canvas as never,
    canvasDocumentSize: { width: 800, height: 600 },
    ensureBrowserFrameOnTop: vi.fn(),
    setBrowserFrameRenderToken: vi.fn(),
  });

  expect(mocks.createBrowserFrameLayerObjectMock).not.toHaveBeenCalled();
  expect(canvas.remove).not.toHaveBeenCalled();
});
