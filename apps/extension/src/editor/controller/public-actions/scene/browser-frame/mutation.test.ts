import type { Canvas } from 'fabric';
import { beforeEach, expect, it, vi } from 'vitest';

import {
  DEFAULT_BROWSER_FRAME_STATE,
  DEFAULT_EDITOR_FRAME_SETTINGS,
} from '../../../../../features/editor/document/constants';

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

import { applyEditorBrowserFrameSettings } from './mutation';

function createCanvas(objects: unknown[]) {
  const canvas = {
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
  return canvas as typeof canvas & Canvas;
}

function createOptions(canvas: ReturnType<typeof createCanvas> | null) {
  const effects = {
    commitHistory: vi.fn(),
    ensureBrowserFrameOnTop: vi.fn(),
    syncRuntimeState: vi.fn(),
  };
  const options: Parameters<typeof applyEditorBrowserFrameSettings>[0] = {
    browserFrame: { ...DEFAULT_BROWSER_FRAME_STATE, title: 'Next' },
    canvas,
    canvasDocumentSize: { height: 500, width: 700 },
    commitHistory: effects.commitHistory,
    ensureBrowserFrameOnTop: effects.ensureBrowserFrameOnTop,
    nextLabelIndex: vi.fn(() => 9),
    prepareObject: vi.fn(),
    relayoutScene: vi.fn(),
    source: null,
    store: {
      getBrowserFrame: vi.fn(() => ({ ...DEFAULT_BROWSER_FRAME_STATE, title: 'Current' })),
      getFrame: vi.fn(() => DEFAULT_EDITOR_FRAME_SETTINGS),
      setBrowserFrame: vi.fn(),
    },
    syncRuntimeState: effects.syncRuntimeState,
  };
  return { effects, options };
}

beforeEach(() => {
  vi.clearAllMocks();
});

it('syncs without history when no editable canvas or source state exists', async () => {
  const missingCanvas = createOptions(null);

  await applyEditorBrowserFrameSettings(missingCanvas.options);

  expect(missingCanvas.effects.commitHistory).not.toHaveBeenCalled();
  expect(missingCanvas.effects.syncRuntimeState).toHaveBeenCalledOnce();

  const missingSource = createOptions(createCanvas([]));
  mocks.readCurrentBrowserFrameSourceState.mockReturnValueOnce(null);

  await applyEditorBrowserFrameSettings(missingSource.options);

  expect(missingSource.effects.commitHistory).not.toHaveBeenCalled();
  expect(missingSource.effects.syncRuntimeState).toHaveBeenCalledOnce();
});

it('creates and installs a browser-frame layer before committing the mutation', async () => {
  const canvas = createCanvas([]);
  const nextLayer = { setCoords: vi.fn() };
  const { effects, options } = createOptions(canvas);
  mocks.readCurrentBrowserFrameSourceState.mockReturnValueOnce({
    displayHeight: 300,
    displayWidth: 400,
    left: 10,
    top: 40,
  });
  mocks.createBrowserFrameLayerObject.mockResolvedValueOnce(nextLayer);

  await applyEditorBrowserFrameSettings(options);

  expect(mocks.createBrowserFrameLayerObject).toHaveBeenCalledWith(
    expect.objectContaining({
      browserFrame: options.browserFrame,
      nextLabelIndex: 9,
      prepareObject: options.prepareObject,
    })
  );
  expect(options.relayoutScene).toHaveBeenCalledWith(
    options.browserFrame,
    expect.objectContaining({ hasBrowserFrame: true })
  );
  expect(canvas.add).toHaveBeenCalledWith(nextLayer);
  expect(effects.ensureBrowserFrameOnTop).toHaveBeenCalledOnce();
  expect(effects.commitHistory).toHaveBeenCalledOnce();
  expect(effects.syncRuntimeState).toHaveBeenCalledOnce();
  expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
});

it('finds and replaces an existing browser-frame layer at its sibling index', async () => {
  const unrelated = { sniptaleType: 'shape' };
  const existingLayer = {
    getScaledWidth: vi.fn(() => 640),
    left: 20,
    sniptaleType: 'browser-frame',
    top: 30,
  };
  const annotation = { sniptaleType: 'rectangle' };
  const canvas = createCanvas([unrelated, existingLayer, annotation]);
  const nextLayer = { setCoords: vi.fn() };
  const { options } = createOptions(canvas);
  mocks.readCurrentBrowserFrameSourceState.mockReturnValueOnce({
    displayHeight: 300,
    displayWidth: 400,
    left: 10,
    top: 40,
  });
  mocks.createBrowserFrameLayerObject.mockResolvedValueOnce(nextLayer);

  await applyEditorBrowserFrameSettings(options);

  expect(mocks.createBrowserFrameLayerObject).toHaveBeenCalledWith(
    expect.objectContaining({ existingObject: existingLayer })
  );
  expect(canvas.remove).toHaveBeenCalledWith(existingLayer);
  expect(canvas.moveObjectTo).toHaveBeenCalledWith(nextLayer, 1);
});
