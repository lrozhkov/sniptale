import type { Canvas } from 'fabric';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  findBrowserFrameHeaderMock: vi.fn(),
  shouldFitSourceForBrowserTransitionMock: vi.fn(() => false),
  shouldPreserveCanvasForBrowserTransitionMock: vi.fn(() => false),
  applyEditorViewportZoomMock: vi.fn(),
}));

vi.mock('../tools/decorations', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../tools/decorations')>()),
  findBrowserFrameHeader: mocks.findBrowserFrameHeaderMock,
}));

vi.mock('../document/scene/transition', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../document/scene/transition')>()),
  shouldFitSourceForBrowserTransition: mocks.shouldFitSourceForBrowserTransitionMock,
  shouldPreserveCanvasForBrowserTransition: mocks.shouldPreserveCanvasForBrowserTransitionMock,
}));

vi.mock('../viewport', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../viewport')>()),
  applyEditorViewportZoom: mocks.applyEditorViewportZoomMock,
}));
import { applyEditorBrowserFrame, removeEditorBrowserFrame } from './';
type BrowserFrameTestCanvas = Canvas & {
  requestRenderAll: ReturnType<typeof vi.fn>;
};

function createCanvas(): BrowserFrameTestCanvas {
  return {
    requestRenderAll: vi.fn(),
  } as unknown as BrowserFrameTestCanvas;
}

function createSource() {
  return {
    displayHeight: 300,
    displayWidth: 400,
    left: 12,
    top: 24,
  } as never;
}

function createBrowserFramePatch(url: string) {
  return {
    title: 'Sniptale',
    url,
    canvasMode: 'resize' as const,
    contentMode: 'push-down' as const,
  };
}

function createOptions() {
  return {
    canvas: createCanvas(),
    source: createSource(),
    canvasDocumentSize: { width: 1200, height: 900 },
    viewportDevicePixelRatioBaseline: 1,
    zoomLevel: 1.25,
    frame: { preset: 'rounded' } as never,
    currentBrowserFrame: {
      title: '',
      url: '',
      faviconDataUrl: null,
      canvasMode: 'resize',
      contentMode: 'push-down',
    } as never,
    applyFrameDecorations: vi.fn(() => true),
    relayoutScene: vi.fn(),
    prepareFrameDecorations: vi.fn(async () => ({
      prepared: {
        browserFrameObjects: { objects: [], sourceClipPath: null },
        frameObjects: [],
      },
      renderToken: 1,
    })),
    setBrowserFrame: vi.fn(),
    rebuildFrameDecorations: vi.fn(async () => undefined),
    ensureReachableObjects: vi.fn(),
    ensureBrowserFrameOnTop: vi.fn(),
    logBrowserFrame: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findBrowserFrameHeaderMock.mockReturnValue({
    getScaledHeight: () => 36,
    getScaledWidth: () => 1280,
    left: 0,
    top: 0,
    visible: true,
  });
  mocks.shouldFitSourceForBrowserTransitionMock.mockReturnValue(true);
  mocks.shouldPreserveCanvasForBrowserTransitionMock.mockReturnValue(false);
});

function runApplyBrowserFrameTransitionSuite() {
  it('applies a browser frame transition through the relayout and render pipeline', async () => {
    const options = createOptions();

    await expect(
      applyEditorBrowserFrame({
        ...options,
        browserFrame: {
          ...createBrowserFramePatch('https://sniptale.dev'),
          faviconDataUrl: 'data:image/png;base64,favicon',
        },
      })
    ).resolves.toBe(true);

    expect(options.relayoutScene).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Sniptale',
        url: 'https://sniptale.dev',
      }),
      {
        fitSourceToContent: true,
        preserveCanvasSize: false,
      }
    );
    expect(options.setBrowserFrame).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Sniptale',
        url: 'https://sniptale.dev',
      })
    );
    expect(options.setBrowserFrame).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Sniptale',
        url: 'https://sniptale.dev',
      })
    );
    expect(options.prepareFrameDecorations).toHaveBeenCalledOnce();
    expect(options.applyFrameDecorations).toHaveBeenCalledOnce();
    expect(mocks.applyEditorViewportZoomMock).toHaveBeenCalledWith(
      options.canvas,
      options.canvasDocumentSize,
      options.zoomLevel,
      1
    );
    expect(options.ensureReachableObjects).toHaveBeenCalledOnce();
    expect(options.ensureBrowserFrameOnTop).toHaveBeenCalledOnce();
    expect(options.canvas.requestRenderAll).toHaveBeenCalledOnce();
  });
}

function runApplyBrowserFrameLoggingSuite() {
  it('logs browser frame apply start and done payloads after a successful transition', async () => {
    const options = createOptions();

    await expect(
      applyEditorBrowserFrame({
        ...options,
        browserFrame: createBrowserFramePatch('https://sniptale.dev'),
      })
    ).resolves.toBe(true);

    expect(options.logBrowserFrame).toHaveBeenNthCalledWith(
      1,
      'apply:start',
      expect.objectContaining({
        hadUrl: false,
        hasUrl: true,
        sourceWidth: 400,
      })
    );
    expect(options.logBrowserFrame).toHaveBeenNthCalledWith(
      2,
      'apply:done',
      expect.objectContaining({
        headerVisible: true,
        sourceLeft: 12,
      })
    );
  });
}

function runBrowserFrameGuardSuite() {
  it('returns early when browser frame apply has no canvas or source', async () => {
    const options = createOptions();

    await expect(
      applyEditorBrowserFrame({
        ...options,
        canvas: null,
        browserFrame: createBrowserFramePatch('https://sniptale.dev'),
      })
    ).resolves.toBe(false);
    await expect(removeEditorBrowserFrame({ ...options, source: null })).resolves.toBe(false);

    expect(options.relayoutScene).not.toHaveBeenCalled();
    expect(options.logBrowserFrame).not.toHaveBeenCalled();
  });
}

function runBrowserFrameRollbackSuite() {
  it('does not commit browser-frame state when rendering fails or becomes stale', async () => {
    const failedOptions = createOptions();
    failedOptions.prepareFrameDecorations.mockRejectedValueOnce(new Error('render failed'));

    await expect(
      applyEditorBrowserFrame({
        ...failedOptions,
        browserFrame: createBrowserFramePatch('https://sniptale.dev'),
      })
    ).rejects.toThrow('render failed');

    expect(failedOptions.relayoutScene).not.toHaveBeenCalled();
    expect(failedOptions.setBrowserFrame).not.toHaveBeenCalled();
    expect(failedOptions.applyFrameDecorations).not.toHaveBeenCalled();

    const staleOptions = createOptions();
    staleOptions.prepareFrameDecorations.mockResolvedValueOnce(null as never);

    await expect(
      applyEditorBrowserFrame({
        ...staleOptions,
        browserFrame: createBrowserFramePatch('https://newer.sniptale.dev'),
      })
    ).resolves.toBe(false);

    expect(staleOptions.relayoutScene).not.toHaveBeenCalled();
    expect(staleOptions.setBrowserFrame).not.toHaveBeenCalled();
    expect(staleOptions.applyFrameDecorations).not.toHaveBeenCalled();
    expect(staleOptions.logBrowserFrame).toHaveBeenCalledOnce();

    const staleApplyOptions = createOptions();
    staleApplyOptions.applyFrameDecorations.mockReturnValueOnce(false);

    await expect(
      applyEditorBrowserFrame({
        ...staleApplyOptions,
        browserFrame: createBrowserFramePatch('https://stale.sniptale.dev'),
      })
    ).resolves.toBe(false);

    expect(staleApplyOptions.relayoutScene).not.toHaveBeenCalled();
    expect(staleApplyOptions.setBrowserFrame).not.toHaveBeenCalled();
    expect(staleApplyOptions.applyFrameDecorations).toHaveBeenCalledOnce();
    expect(staleApplyOptions.logBrowserFrame).toHaveBeenCalledOnce();
  });
}

function runRemoveBrowserFrameSuite() {
  it('removes the browser frame without re-raising frame decorations', async () => {
    const options = createOptions();

    await expect(removeEditorBrowserFrame(options)).resolves.toBe(true);

    expect(options.relayoutScene).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '',
        url: '',
      }),
      {
        fitSourceToContent: true,
        preserveCanvasSize: false,
      }
    );
    expect(options.ensureBrowserFrameOnTop).not.toHaveBeenCalled();
    expect(options.setBrowserFrame).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '',
        url: '',
      })
    );
    expect(options.canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(mocks.applyEditorViewportZoomMock).toHaveBeenCalledWith(
      options.canvas,
      options.canvasDocumentSize,
      options.zoomLevel,
      1
    );
    expect(options.logBrowserFrame).toHaveBeenNthCalledWith(
      1,
      'remove:start',
      expect.objectContaining({
        hasHeader: true,
      })
    );
    expect(options.logBrowserFrame).toHaveBeenNthCalledWith(
      2,
      'remove:done',
      expect.objectContaining({
        sourceTop: 24,
      })
    );
  });
}

describe('editor-controller-browser-frame', () => {
  runApplyBrowserFrameTransitionSuite();
  runApplyBrowserFrameLoggingSuite();
  runBrowserFrameGuardSuite();
  runBrowserFrameRollbackSuite();
  runRemoveBrowserFrameSuite();
});
