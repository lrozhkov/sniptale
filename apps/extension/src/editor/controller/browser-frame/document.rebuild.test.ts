import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createBrowserFrameLayerObjectMock: vi.fn(),
  createBrowserFrameRebuildDonePayloadMock: vi.fn(),
  createBrowserFrameRebuildPayloadMock: vi.fn(),
  debugMock: vi.fn(),
  findBrowserFrameHeaderMock: vi.fn(),
  getEditorStoreStateMock: vi.fn(),
  getSourceObjectMock: vi.fn(),
  rebuildEditorFrameDecorationsMock: vi.fn(),
}));

vi.mock('@sniptale/platform/observability/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/observability/logger')>()),
  createLogger: () => ({
    debug: mocks.debugMock,
  }),
}));

vi.mock('../../state/useEditorStore', () => ({
  useEditorStore: {
    getState: mocks.getEditorStoreStateMock,
  },
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

import { rebuildEditorControllerFrameDecorations } from './document';

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
  };
}

async function rebuildDecorationsWithDefaults(
  canvas: ReturnType<typeof createProjectCanvas>,
  overrides: Partial<Parameters<typeof rebuildEditorControllerFrameDecorations>[0]> = {}
) {
  await rebuildEditorControllerFrameDecorations({
    browserFrameRenderToken: 1,
    canvas: canvas as never,
    canvasDocumentSize: { width: 800, height: 600 },
    ensureBrowserFrameOnTop: vi.fn(),
    setBrowserFrameRenderToken: vi.fn(),
    ...overrides,
  });
}

function createHeader() {
  return {
    getScaledWidth: vi.fn(() => 320),
    left: 24,
    sniptaleId: 'browser-frame-1',
    sniptaleLabel: 'Browser Header 1',
    sniptaleLocked: false,
    top: 12,
    visible: true,
  };
}

it('skips the rebuild when neither a source object nor a fallback source exists', async () => {
  const canvas = createProjectCanvas();

  mocks.findBrowserFrameHeaderMock.mockReturnValue(createHeader());
  mocks.getSourceObjectMock.mockReturnValue(undefined);

  await rebuildDecorationsWithDefaults(canvas, { source: null });

  expect(mocks.createBrowserFrameLayerObjectMock).not.toHaveBeenCalled();
  expect(canvas.remove).not.toHaveBeenCalled();
  expect(canvas.requestRenderAll).not.toHaveBeenCalled();
});

it('falls back to the next source coordinates when the previous header has no fixed position', async () => {
  const canvas = createProjectCanvas();
  const header = {
    getScaledWidth: vi.fn(() => 280),
    left: undefined,
    sniptaleId: undefined,
    sniptaleLabel: undefined,
    sniptaleLocked: undefined,
    top: undefined,
    visible: true,
  };

  mocks.findBrowserFrameHeaderMock.mockReturnValue(header);
  mocks.getSourceObjectMock.mockReturnValue(undefined);
  mocks.createBrowserFrameLayerObjectMock.mockResolvedValue({ id: 'next-header' });

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
      left: 40,
      top: 60,
      width: 280,
    })
  );
});
