import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createBrowserFrameLayerObjectMock: vi.fn(),
  getSourceObjectMock: vi.fn(),
}));

vi.mock('../../../objects/browser-frame', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../objects/browser-frame')>()),
  createBrowserFrameLayerObject: mocks.createBrowserFrameLayerObjectMock,
}));

vi.mock('../../document/layers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../document/layers')>()),
  getSourceObject: mocks.getSourceObjectMock,
}));
import type { BrowserFrameState } from '../../../../features/editor/document/types';
import {
  applyEditorBrowserFrameSettings,
  previewEditorBrowserFrameSettings,
  previewRemoveEditorBrowserFrameSettings,
  removeEditorBrowserFrameSettings,
} from './';

function createStoreBridge() {
  return {
    getBrowserFrame: () =>
      ({
        canvasMode: 'resize',
        contentMode: 'push-down',
        title: 'Current title',
        url: 'https://current.example',
      }) as BrowserFrameState,
    getFrame: vi.fn(() => ({
      backgroundColor: '#fff',
      backgroundGradientAngle: 0,
      backgroundGradientFrom: '#fff',
      backgroundGradientTo: '#000',
      backgroundImageData: null,
      backgroundImageFit: 'cover',
      backgroundMode: 'gradient',
      browserMode: false,
      browserTitle: '',
      browserUrl: '',
      layoutMode: 'expand-canvas',
      paddingBottom: 48,
      paddingLeft: 48,
      paddingRight: 48,
      paddingTop: 48,
    })),
    setBrowserFrame: vi.fn(),
  };
}

function createCanvas(existingObjects: unknown[] = []) {
  return {
    add: vi.fn(),
    bringObjectToFront: vi.fn(),
    getObjects: vi.fn(() => existingObjects),
    moveObjectTo: vi.fn(),
    remove: vi.fn(),
    requestRenderAll: vi.fn(),
    setActiveObject: vi.fn(),
  };
}

function createSourceObject() {
  return {
    getScaledHeight: vi.fn(() => 180),
    getScaledWidth: vi.fn(() => 320),
    left: 24,
    sniptaleId: 'source-image-1',
    sniptaleLocked: false,
    top: 98,
    visible: true,
  };
}

function createActionOptions(overrides: Record<string, unknown> = {}) {
  const store = createStoreBridge();
  const canvas = createCanvas();
  const effects = {
    commitHistory: vi.fn(),
    ensureBrowserFrameOnTop: vi.fn(),
    syncRuntimeState: vi.fn(),
  };

  return {
    canvas,
    effects,
    options: {
      browserFrame: {
        canvasMode: 'keep-size',
        contentMode: 'fit-content',
        title: 'Next title',
        url: 'https://next.example',
      } as BrowserFrameState,
      canvas,
      canvasDocumentSize: { width: 1200, height: 900 },
      commitHistory: effects.commitHistory,
      ensureBrowserFrameOnTop: effects.ensureBrowserFrameOnTop,
      nextLabelIndex: vi.fn(() => 3),
      prepareObject: vi.fn(),
      relayoutScene: vi.fn(),
      source: null,
      store,
      syncRuntimeState: effects.syncRuntimeState,
      ...overrides,
    },
    store,
  };
}

async function applyBrowserHeaderLayerMutation() {
  const sourceObject = createSourceObject();
  const nextLayer = { setCoords: vi.fn() };
  const { options, canvas, effects, store } = createActionOptions();
  mocks.getSourceObjectMock.mockReturnValue(sourceObject);
  mocks.createBrowserFrameLayerObjectMock.mockResolvedValue(nextLayer);

  await applyEditorBrowserFrameSettings(options as never);

  return { canvas, effects, nextLayer, options, store };
}

function expectInsertedBrowserHeaderMutation(args: {
  canvas: ReturnType<typeof createCanvas>;
  effects: ReturnType<typeof createActionOptions>['effects'];
  nextLayer: { setCoords: ReturnType<typeof vi.fn> };
  options: ReturnType<typeof createActionOptions>['options'];
  store: ReturnType<typeof createStoreBridge>;
}) {
  expect(args.store.setBrowserFrame).toHaveBeenCalledWith({
    canvasMode: 'keep-size',
    contentMode: 'fit-content',
    title: 'Next title',
    url: 'https://next.example',
  });
  expect(args.options.relayoutScene).toHaveBeenCalledWith(
    args.options.browserFrame,
    expect.objectContaining({
      hasBrowserFrame: true,
      fitSourceToContent: true,
      preserveCanvasSize: true,
    })
  );
  expect(args.canvas.add).toHaveBeenCalledWith(args.nextLayer);
  expect(args.canvas.bringObjectToFront).toHaveBeenCalledWith(args.nextLayer);
  expect(args.canvas.setActiveObject).toHaveBeenCalledWith(args.nextLayer);
  expect(args.nextLayer.setCoords).toHaveBeenCalledOnce();
  expect(args.effects.ensureBrowserFrameOnTop).toHaveBeenCalledOnce();
  expect(args.effects.commitHistory).toHaveBeenCalledOnce();
  expect(args.effects.syncRuntimeState).toHaveBeenCalledOnce();
}

function runInsertBrowserHeaderLayerSuite() {
  it('upserts a generated browser-header layer and commits the mutation', async () => {
    const mutation = await applyBrowserHeaderLayerMutation();

    expect(mocks.createBrowserFrameLayerObjectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        browserFrame: mutation.options.browserFrame,
        left: 48,
        nextLabelIndex: 3,
        top: 48,
        width: 1104,
      })
    );
    expectInsertedBrowserHeaderMutation(mutation);
  });
}

function runNoSourceBrowserHeaderLayerSuite() {
  it('syncs runtime without committing when no source is available for rebuild', async () => {
    const { options, effects } = createActionOptions();
    mocks.getSourceObjectMock.mockReturnValue(undefined);

    await applyEditorBrowserFrameSettings(options as never);

    expect(mocks.createBrowserFrameLayerObjectMock).not.toHaveBeenCalled();
    expect(effects.commitHistory).not.toHaveBeenCalled();
    expect(effects.syncRuntimeState).toHaveBeenCalledOnce();
  });
}

function runExistingBrowserHeaderLayerSuite() {
  it('reuses the current browser-header width and layer slot when updating an existing layer', async () => {
    const existingLayer = {
      getScaledWidth: vi.fn(() => 480),
      left: 30,
      sniptaleType: 'browser-frame',
      top: 18,
      visible: true,
    };
    const sourceObject = createSourceObject();
    const nextLayer = { setCoords: vi.fn() };
    const canvas = createCanvas([existingLayer]);
    const { options } = createActionOptions({ canvas });
    mocks.getSourceObjectMock.mockReturnValue(sourceObject);
    mocks.createBrowserFrameLayerObjectMock.mockResolvedValue(nextLayer);

    await applyEditorBrowserFrameSettings(options as never);

    expect(mocks.createBrowserFrameLayerObjectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        existingObject: existingLayer,
        left: 54,
        top: 54,
        width: 1104,
      })
    );
    expect(canvas.remove).toHaveBeenCalledWith(existingLayer);
    expect(canvas.moveObjectTo).toHaveBeenCalledWith(nextLayer, 0);
  });
}

function runStableSourceSizeBrowserHeaderSuite() {
  it('keeps the current browser-header width when relayout only shifts the source', async () => {
    const existingLayer = {
      getScaledWidth: vi.fn(() => 480),
      left: 30,
      sniptaleType: 'browser-frame',
      top: 18,
      visible: true,
    };
    const sourceObject = createSourceObject();
    const nextLayer = { setCoords: vi.fn() };
    const canvas = createCanvas([existingLayer]);
    const { options } = createActionOptions({
      browserFrame: {
        canvasMode: 'resize',
        contentMode: 'push-down',
        title: 'Next title',
        url: 'https://next.example',
      } satisfies BrowserFrameState,
      canvas,
    });
    mocks.getSourceObjectMock.mockReturnValue(sourceObject);
    mocks.createBrowserFrameLayerObjectMock.mockResolvedValue(nextLayer);

    await applyEditorBrowserFrameSettings(options as never);

    expect(mocks.createBrowserFrameLayerObjectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        existingObject: existingLayer,
        width: 480,
      })
    );
  });
}

function runBrowserHeaderRenderFailureSuite() {
  it('does not relayout or commit when header rendering fails before the layer is prepared', async () => {
    const sourceObject = createSourceObject();
    const { options, effects } = createActionOptions();
    const error = new Error('render failed');

    mocks.getSourceObjectMock.mockReturnValue(sourceObject);
    mocks.createBrowserFrameLayerObjectMock.mockRejectedValueOnce(error);

    await expect(applyEditorBrowserFrameSettings(options as never)).rejects.toThrow(error);

    expect(options.relayoutScene).not.toHaveBeenCalled();
    expect(effects.commitHistory).not.toHaveBeenCalled();
    expect(effects.syncRuntimeState).not.toHaveBeenCalled();
  });
}

describe('applyEditorBrowserFrameSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  runInsertBrowserHeaderLayerSuite();
  runNoSourceBrowserHeaderLayerSuite();
  runExistingBrowserHeaderLayerSuite();
  runStableSourceSizeBrowserHeaderSuite();
  runBrowserHeaderRenderFailureSuite();
});

describe('browser-frame preview and remove compat no-ops', () => {
  it('keeps preview and remove helpers inert while the insert/update model owns the seam', async () => {
    await expect(previewEditorBrowserFrameSettings({} as never)).resolves.toBeUndefined();
    await expect(removeEditorBrowserFrameSettings({} as never)).resolves.toBeUndefined();
    await expect(previewRemoveEditorBrowserFrameSettings({} as never)).resolves.toBeUndefined();
  });
});
