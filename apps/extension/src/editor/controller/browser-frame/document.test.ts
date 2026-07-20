import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createBrowserFrameLayerObjectMock: vi.fn(),
  createBrowserFrameRebuildDonePayloadMock: vi.fn(),
  createBrowserFrameRebuildPayloadMock: vi.fn(),
  debugMock: vi.fn(),
  findBrowserFrameHeaderMock: vi.fn(),
  getEditorStoreStateMock: vi.fn(),
  getSourceObjectMock: vi.fn(),
  relayoutEditorSceneMock: vi.fn(),
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

vi.mock('../document/scene/relayout', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../document/scene/relayout')>()),
  relayoutEditorScene: mocks.relayoutEditorSceneMock,
}));
import {
  ensureEditorBrowserFrameOnTop,
  logEditorBrowserFrame,
  rebuildEditorControllerFrameDecorations,
  relayoutEditorControllerScene,
} from './document';
import { logEditorOpenTrace, logEditorSourceTrace } from '../core/debug';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getEditorStoreStateMock.mockReturnValue({
    browserFrame: { enabled: true },
    frame: { mode: 'browser' },
  });
  mocks.createBrowserFrameRebuildPayloadMock.mockReturnValue({ kind: 'start-payload' });
  mocks.createBrowserFrameRebuildDonePayloadMock.mockReturnValue({ kind: 'done-payload' });
});

function createProjectCanvas() {
  return {
    add: vi.fn(),
    bringObjectToFront: vi.fn(),
    getActiveObjects: vi.fn(() => []),
    getObjects: vi.fn(() => []),
    moveObjectTo: vi.fn(),
    remove: vi.fn(),
    requestRenderAll: vi.fn(),
    setActiveObject: vi.fn(),
    setDimensions: vi.fn(),
  };
}

async function rebuildDecorationsWithDefaults(
  canvas: ReturnType<typeof createProjectCanvas>,
  overrides: Partial<Parameters<typeof rebuildEditorControllerFrameDecorations>[0]> = {}
) {
  const ensureBrowserFrameOnTop = vi.fn();
  const setBrowserFrameRenderToken = vi.fn();

  await rebuildEditorControllerFrameDecorations({
    canvas: canvas as never,
    canvasDocumentSize: { width: 800, height: 600 },
    browserFrameRenderToken: 1,
    setBrowserFrameRenderToken,
    ensureBrowserFrameOnTop,
    ...overrides,
  });

  return { ensureBrowserFrameOnTop, setBrowserFrameRenderToken };
}

function createBrowserFrameRebuildFixture() {
  const canvas = createProjectCanvas();
  const header = {
    getScaledWidth: vi.fn(() => 320),
    left: 24,
    sniptaleId: 'browser-frame-1',
    sniptaleLabel: 'Browser Header 1',
    sniptaleLocked: false,
    top: 12,
    visible: true,
  };
  const nextHeader = { id: 'next-header' };
  const sourceObject = {
    getScaledHeight: vi.fn(() => 180),
    getScaledWidth: vi.fn(() => 320),
    left: 24,
    sniptaleId: 'source-image-1',
    sniptaleLocked: false,
    top: 98,
    visible: true,
  };

  canvas.getObjects.mockReturnValue([header] as never[]);
  return { canvas, header, nextHeader, sourceObject };
}

function expectSuccessfulRebuild(args: {
  canvas: ReturnType<typeof createProjectCanvas>;
  header: Record<string, unknown>;
  nextHeader: Record<string, unknown>;
  successful: Awaited<ReturnType<typeof rebuildDecorationsWithDefaults>>;
}) {
  expect(args.successful.setBrowserFrameRenderToken).toHaveBeenCalledWith(2);
  expect(mocks.createBrowserFrameLayerObjectMock).toHaveBeenCalledWith(
    expect.objectContaining({
      browserFrame: { enabled: true },
      existingObject: args.header,
      left: 24,
      top: 12,
      width: 320,
      nextLabelIndex: 1,
      prepareObject: expect.any(Function),
    })
  );
  expect(mocks.createBrowserFrameRebuildPayloadMock).toHaveBeenCalledWith(
    expect.objectContaining({ browserEnabled: true, renderToken: 2 })
  );
  expect(args.canvas.remove).toHaveBeenCalledWith(args.header);
  expect(args.canvas.add).toHaveBeenCalledWith(args.nextHeader);
  expect(args.canvas.moveObjectTo).toHaveBeenCalledWith(args.nextHeader, 0);
  expect(args.successful.ensureBrowserFrameOnTop).toHaveBeenCalledOnce();
  expect(args.canvas.requestRenderAll).toHaveBeenCalledOnce();
  expect(mocks.createBrowserFrameRebuildDonePayloadMock).toHaveBeenCalledWith({
    header: args.nextHeader,
    renderToken: 2,
    frameObjectsCount: 0,
  });
  expect(mocks.debugMock).toHaveBeenCalledWith('rebuild:start', { kind: 'start-payload' });
  expect(mocks.debugMock).toHaveBeenCalledWith('rebuild:done', { kind: 'done-payload' });
}

it('logs browser-frame and editor trace events through the shared logger', () => {
  logEditorBrowserFrame('frame:ready', { width: 100 });
  logEditorOpenTrace('begin', { fileName: 'capture.png' });
  logEditorSourceTrace('replace', { sourceId: 'source-1' });

  expect(mocks.debugMock).toHaveBeenNthCalledWith(1, 'frame:ready', { width: 100 });
  expect(mocks.debugMock).toHaveBeenNthCalledWith(2, 'open-image', {
    stage: 'begin',
    fileName: 'capture.png',
  });
  expect(mocks.debugMock).toHaveBeenNthCalledWith(3, 'source-layer', {
    stage: 'replace',
    sourceId: 'source-1',
  });
});

it('keeps the browser-frame header above the scene when one exists', () => {
  const header = { setCoords: vi.fn() };
  const canvas = createProjectCanvas();

  ensureEditorBrowserFrameOnTop(null);
  expect(mocks.findBrowserFrameHeaderMock).not.toHaveBeenCalled();

  mocks.findBrowserFrameHeaderMock.mockReturnValueOnce(null);
  ensureEditorBrowserFrameOnTop(canvas as never);
  expect(canvas.bringObjectToFront).not.toHaveBeenCalled();

  mocks.findBrowserFrameHeaderMock.mockReturnValueOnce(header);
  ensureEditorBrowserFrameOnTop(canvas as never);

  expect(canvas.bringObjectToFront).toHaveBeenCalledWith(header);
  expect(canvas.bringObjectToFront).toHaveBeenCalledTimes(1);
  expect(header.setCoords).toHaveBeenCalledOnce();
});

it('relayouts the scene and applies the next canvas size', () => {
  const canvas = createProjectCanvas();

  mocks.relayoutEditorSceneMock.mockReturnValueOnce(null);
  expect(
    relayoutEditorControllerScene({
      canvas: canvas as never,
      source: { id: 'source-1' } as never,
      canvasDocumentSize: { width: 800, height: 600 },
      frame: { mode: 'frame' } as never,
      browserFrame: { enabled: true } as never,
    })
  ).toBeNull();

  mocks.relayoutEditorSceneMock.mockReturnValueOnce({
    source: { id: 'source-2' },
    canvasSize: { width: 1280, height: 720 },
  });

  const nextScene = relayoutEditorControllerScene({
    canvas: canvas as never,
    source: { id: 'source-1' } as never,
    canvasDocumentSize: { width: 800, height: 600 },
    frame: { mode: 'frame' } as never,
    browserFrame: { enabled: true } as never,
  });

  expect(canvas.setDimensions).toHaveBeenCalledWith({ width: 1280, height: 720 });
  expect(nextScene).toEqual({
    source: { id: 'source-2' },
    canvasSize: { width: 1280, height: 720 },
  });
});

it('rebuilds browser-frame decorations and skips aborted renders', async () => {
  const { canvas, header, nextHeader, sourceObject } = createBrowserFrameRebuildFixture();

  const noCanvas = await rebuildDecorationsWithDefaults(canvas, { canvas: null as never });
  expect(noCanvas.setBrowserFrameRenderToken).not.toHaveBeenCalled();

  mocks.findBrowserFrameHeaderMock.mockReturnValue(header);
  mocks.getSourceObjectMock.mockReturnValue(sourceObject);
  mocks.createBrowserFrameLayerObjectMock.mockResolvedValue(nextHeader);

  const successful = await rebuildDecorationsWithDefaults(canvas);
  expectSuccessfulRebuild({ canvas, header, nextHeader, successful });

  const aborted = await rebuildDecorationsWithDefaults(canvas, {
    browserFrameRenderToken: 2,
    canvasDocumentSize: { width: 640, height: 480 },
    source: { id: 'source-1' } as never,
    isBrowserFrameRenderTokenCurrent: () => false,
  });
  expect(aborted.ensureBrowserFrameOnTop).not.toHaveBeenCalled();
  expect(canvas.requestRenderAll).toHaveBeenCalledTimes(1);
  expect(canvas.remove).toHaveBeenCalledTimes(1);
});

it('stops after logging the rebuild start when no browser header exists', async () => {
  const canvas = createProjectCanvas();

  mocks.findBrowserFrameHeaderMock.mockReturnValueOnce(undefined);

  const result = await rebuildDecorationsWithDefaults(canvas);

  expect(result.setBrowserFrameRenderToken).toHaveBeenCalledWith(2);
  expect(mocks.createBrowserFrameLayerObjectMock).not.toHaveBeenCalled();
  expect(mocks.createBrowserFrameRebuildPayloadMock).toHaveBeenCalledWith(
    expect.objectContaining({ browserEnabled: false, renderToken: 2 })
  );
});

it('rebuilds the header from fallback source state when the source object is missing', async () => {
  const { canvas, header, nextHeader } = createBrowserFrameRebuildFixture();

  mocks.findBrowserFrameHeaderMock.mockReturnValue(header);
  mocks.getSourceObjectMock.mockReturnValue(undefined);
  mocks.createBrowserFrameLayerObjectMock.mockResolvedValue(nextHeader);

  await rebuildDecorationsWithDefaults(canvas, {
    source: {
      dataUrl: 'data:image/png;base64,fallback',
      displayHeight: 180,
      displayWidth: 320,
      id: 'fallback-source',
      intrinsicHeight: 720,
      intrinsicWidth: 1280,
      left: 40,
      locked: true,
      name: 'fallback',
      top: 60,
      visible: true,
    },
  });

  expect(mocks.createBrowserFrameLayerObjectMock).toHaveBeenCalledWith(
    expect.objectContaining({
      existingObject: header,
      left: 24,
      top: 12,
      width: 320,
    })
  );
});
