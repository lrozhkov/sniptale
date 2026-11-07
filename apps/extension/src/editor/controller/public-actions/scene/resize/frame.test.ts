// @vitest-environment jsdom
import { FabricImage, Rect } from 'fabric';
import { expect, it, vi } from 'vitest';
import * as browserFrameLayers from '../../../browser-frame/document-layer';
import { relayoutEditorScene } from '../../../document/scene/relayout';
import {
  DEFAULT_BROWSER_FRAME_STATE,
  DEFAULT_EDITOR_FRAME_SETTINGS,
  DEFAULT_EDITOR_IMAGE_SETTINGS,
} from '../../../../../features/editor/document/constants';
import { createFabricCanvasFixture } from '../../../../testing/fabric-canvas.test-support';
import { applyEditorFrameSceneSettings } from './frame';

vi.mock('../../../viewport', () => ({ applyEditorViewportZoom: vi.fn() }));

it.each([false, true])(
  'applies source decoration without geometry changes (browser header: %s)',
  async (withHeader) => {
    const image = new FabricImage(document.createElement('img'), { width: 200, height: 100 });
    image.sniptaleType = 'source-image';
    image.sniptaleRole = 'source';
    const header = new Rect();
    header.sniptaleType = 'browser-frame';
    const frame = {
      ...DEFAULT_EDITOR_FRAME_SETTINGS,
      sourceImage: {
        ...DEFAULT_EDITOR_IMAGE_SETTINGS,
        strokeWidth: 8,
        shadow: 60,
        opacity: 0.7,
        radius: 12,
      },
    };
    const relayoutScene = vi.fn();
    await applyEditorFrameSceneSettings({
      canvas: createFabricCanvasFixture({
        getObjects: () => (withHeader ? [image, header] : [image]),
        requestRenderAll: vi.fn(),
      }),
      source: {
        id: 'source',
        dataUrl: '',
        name: null,
        intrinsicWidth: 200,
        intrinsicHeight: 100,
        displayWidth: 200,
        displayHeight: 100,
        left: 0,
        top: 0,
        locked: true,
        visible: true,
      },
      frame,
      store: {
        getFrame: () => DEFAULT_EDITOR_FRAME_SETTINGS,
        getBrowserFrame: () => DEFAULT_BROWSER_FRAME_STATE,
        updateFrame: vi.fn(),
      },
      relayoutScene,
      zoomLevel: 1,
      getCanvasDocumentSize: () => ({ width: 264, height: 164 }),
      ensureReachableObjects: () => false,
      rebuildFrameDecorations: async () => undefined,
      commitHistory: vi.fn(),
      syncRuntimeState: vi.fn(),
    });
    expect(relayoutScene).not.toHaveBeenCalled();
    expect(image.sniptaleImageStrokeWidth).toBe(8);
    expect(image.sniptaleImageRadius).toBe(12);
    expect(image.opacity).toBe(0.7);
    expect(image.shadow?.color).toContain('0.6');
    image.sniptaleImageStrokeWidth = 3;
    await applyEditorFrameSceneSettings({
      canvas: createFabricCanvasFixture({ getObjects: () => [image], requestRenderAll: vi.fn() }),
      source: {
        id: 'source',
        dataUrl: '',
        name: null,
        intrinsicWidth: 200,
        intrinsicHeight: 100,
        displayWidth: 200,
        displayHeight: 100,
        left: 0,
        top: 0,
        locked: true,
        visible: true,
      },
      frame: { ...frame, backgroundColor: '#ffffff' },
      store: {
        getFrame: () => frame,
        getBrowserFrame: () => DEFAULT_BROWSER_FRAME_STATE,
        updateFrame: vi.fn(),
      },
      relayoutScene,
      zoomLevel: 1,
      getCanvasDocumentSize: () => ({ width: 264, height: 164 }),
      ensureReachableObjects: () => false,
      rebuildFrameDecorations: async () => undefined,
      commitHistory: vi.fn(),
      syncRuntimeState: vi.fn(),
    });
    expect(image.sniptaleImageStrokeWidth).toBe(3);
  }
);

function createPreviewFixture() {
  const image = new FabricImage(document.createElement('img'), { width: 200, height: 100 });
  image.sniptaleType = 'source-image';
  image.sniptaleRole = 'source';
  const canvas = createFabricCanvasFixture({
    getObjects: () => [image],
    getActiveObject: () => undefined,
    requestRenderAll: vi.fn(),
  });
  let accepted = DEFAULT_EDITOR_FRAME_SETTINGS;
  return {
    image,
    options: {
      canvas,
      source: {
        id: 'source',
        dataUrl: '',
        name: null,
        intrinsicWidth: 200,
        intrinsicHeight: 100,
        displayWidth: 200,
        displayHeight: 100,
        left: 32,
        top: 32,
        locked: true,
        visible: true,
      },
      frame: { ...accepted, sourceImage: { ...DEFAULT_EDITOR_IMAGE_SETTINGS, radius: 18 } },
      store: {
        getFrame: () => accepted,
        getBrowserFrame: () => DEFAULT_BROWSER_FRAME_STATE,
        updateFrame: vi.fn((frame: typeof accepted) => {
          accepted = frame;
        }),
      },
      relayoutScene: vi.fn(),
      zoomLevel: 1,
      getCanvasDocumentSize: () => ({ width: 264, height: 164 }),
      ensureReachableObjects: vi.fn(() => false),
      rebuildFrameDecorations: vi.fn(async () => undefined),
      commitHistory: vi.fn(),
      syncRuntimeState: vi.fn(),
    },
  };
}

it('previews source style without accepting settings or rebuilding the background', async () => {
  const { image, options } = createPreviewFixture();
  await applyEditorFrameSceneSettings({ ...options, preview: true });
  expect(image.sniptaleImageRadius).toBe(18);
  expect(options.store.updateFrame).not.toHaveBeenCalled();
  expect(options.commitHistory).not.toHaveBeenCalled();
  expect(options.rebuildFrameDecorations).not.toHaveBeenCalled();
  expect(options.ensureReachableObjects).not.toHaveBeenCalled();
});

function deferredBackground() {
  let complete!: (value: { apply: () => boolean; dispose: () => void }) => void;
  const pending = new Promise<{ apply: () => boolean; dispose: () => void }>((resolve) => {
    complete = resolve;
  });
  const prepared = { apply: vi.fn(() => true), dispose: vi.fn() };
  return { prepareBackground: vi.fn(() => pending), complete: () => complete(prepared), prepared };
}

it('accepts one final frame after previews without duplicate history', async () => {
  const { image, options } = createPreviewFixture();
  await applyEditorFrameSceneSettings({ ...options, preview: true });
  await applyEditorFrameSceneSettings({
    ...options,
    preview: true,
    frame: { ...options.frame, sourceImage: { ...options.frame.sourceImage, radius: 24 } },
  });
  expect(options.commitHistory).not.toHaveBeenCalled();
  await applyEditorFrameSceneSettings({
    ...options,
    frame: { ...options.frame, sourceImage: { ...options.frame.sourceImage, radius: 24 } },
  });
  expect(image.sniptaleImageRadius).toBe(24);
  expect(options.store.getFrame().sourceImage?.radius).toBe(24);
  expect(options.store.updateFrame).toHaveBeenCalledOnce();
  expect(options.commitHistory).toHaveBeenCalledOnce();
});

it.each(['padding', 'blur'] as const)(
  'prepares a %s preview before mutating scene state',
  async (kind) => {
    const { options } = createPreviewFixture();
    const background = deferredBackground();
    const frame = {
      ...options.frame,
      ...(kind === 'padding' ? { paddingLeft: 64 } : { backgroundBlurAmount: 12 }),
    };
    const pending = applyEditorFrameSceneSettings({
      ...options,
      ...background,
      frame,
      preview: true,
    });
    expect(options.relayoutScene).not.toHaveBeenCalled();
    expect(options.store.updateFrame).not.toHaveBeenCalled();
    expect(background.prepared.apply).not.toHaveBeenCalled();
    background.complete();
    await pending;
    expect(background.prepared.apply).toHaveBeenCalledOnce();
    expect(background.prepareBackground).toHaveBeenCalledWith({
      width: kind === 'padding' ? 296 : 264,
      height: 164,
    });
    expect(options.relayoutScene).toHaveBeenCalledTimes(kind === 'padding' ? 1 : 0);
    expect(options.commitHistory).not.toHaveBeenCalled();
    expect(options.store.updateFrame).not.toHaveBeenCalled();
  }
);

it('restores accepted style and disposes a delayed preview after cancellation', async () => {
  const { image, options } = createPreviewFixture();
  await applyEditorFrameSceneSettings({ ...options, preview: true });
  const background = deferredBackground();
  const abort = new AbortController();
  const pending = applyEditorFrameSceneSettings({
    ...options,
    ...background,
    preview: true,
    signal: abort.signal,
    frame: { ...options.frame, backgroundBlurAmount: 12 },
  });
  abort.abort();
  await applyEditorFrameSceneSettings({
    ...options,
    preview: true,
    frame: options.store.getFrame(),
  });
  background.complete();
  await pending;
  expect(image.sniptaleImageRadius).toBe(DEFAULT_EDITOR_IMAGE_SETTINGS.radius);
  expect(background.prepared.apply).not.toHaveBeenCalled();
  expect(background.prepared.dispose).toHaveBeenCalledOnce();
  expect(options.store.updateFrame).not.toHaveBeenCalled();
  expect(options.commitHistory).not.toHaveBeenCalled();
});

it.each(['accepted change', 'disposed canvas', 'newer preview'] as const)(
  'rejects a delayed final result after %s',
  async (cause) => {
    const { options } = createPreviewFixture();
    const background = deferredBackground();
    const pending = applyEditorFrameSceneSettings({
      ...options,
      ...background,
      frame: { ...options.frame, backgroundBlurAmount: 12 },
    });
    if (cause === 'accepted change') {
      options.store.updateFrame({ ...DEFAULT_EDITOR_FRAME_SETTINGS });
      options.store.updateFrame.mockClear();
    } else if (cause === 'disposed canvas') options.canvas.disposed = true;
    else await applyEditorFrameSceneSettings({ ...options, preview: true });
    background.complete();
    await pending;
    expect(background.prepared.apply).not.toHaveBeenCalled();
    expect(background.prepared.dispose).toHaveBeenCalledOnce();
    expect(options.store.updateFrame).not.toHaveBeenCalled();
    expect(options.commitHistory).not.toHaveBeenCalled();
  }
);

it('preserves the last successful scene when preparing a new background fails', async () => {
  const { image, options } = createPreviewFixture();
  await applyEditorFrameSceneSettings({ ...options, preview: true });
  await expect(
    applyEditorFrameSceneSettings({
      ...options,
      preview: true,
      frame: {
        ...options.frame,
        paddingLeft: 64,
        sourceImage: { ...options.frame.sourceImage, radius: 30 },
      },
      prepareBackground: async () => {
        throw new Error('Decode failed');
      },
    })
  ).rejects.toThrow('Decode failed');
  expect(image.sniptaleImageRadius).toBe(18);
  expect(options.relayoutScene).not.toHaveBeenCalled();
  expect(options.store.updateFrame).not.toHaveBeenCalled();
  expect(options.commitHistory).not.toHaveBeenCalled();
});

it.each([false, true])(
  'prepares a resized browser header before scene mutation (cancel: %s)',
  async (cancel) => {
    const { image, options } = createPreviewFixture();
    image.set({ left: 32, top: 64 });
    const header = new Rect({ left: 32, top: 32, width: 200, height: 32 });
    header.sniptaleType = 'browser-frame';
    header.sniptaleRole = 'annotation';
    const nextHeader = new Rect({ width: 136, height: 32 });
    const dispose = vi.spyOn(nextHeader, 'dispose');
    let complete!: (value: Rect) => void;
    const preparation = vi
      .spyOn(browserFrameLayers, 'prepareBrowserFrameLayerReplacement')
      .mockImplementation(
        () =>
          new Promise<Rect>((resolve) => {
            complete = resolve;
          })
      );
    const objects = [image, header];
    const canvas = createFabricCanvasFixture({
      getObjects: () => objects,
      getActiveObject: () => undefined,
      getActiveObjects: () => [],
      add: (object: Rect) => objects.push(object),
      remove: (object: Rect) => objects.splice(objects.indexOf(object), 1),
      moveObjectTo: vi.fn(),
      requestRenderAll: vi.fn(),
    });
    const relayoutScene = vi.fn((frame, browserFrame, relayoutOptions) => {
      relayoutEditorScene(
        canvas,
        options.source,
        options.getCanvasDocumentSize(),
        frame,
        browserFrame,
        relayoutOptions
      );
    });
    const abort = new AbortController();
    const pending = applyEditorFrameSceneSettings({
      ...options,
      canvas,
      relayoutScene,
      preview: true,
      signal: abort.signal,
      frame: { ...options.frame, layoutMode: 'fit-image', paddingLeft: 64, paddingRight: 64 },
    });
    expect(preparation).toHaveBeenCalledOnce();
    expect(relayoutScene).not.toHaveBeenCalled();
    if (cancel) abort.abort();
    complete(nextHeader);
    await pending;
    if (cancel) {
      expect(objects).toContain(header);
      expect(objects).not.toContain(nextHeader);
      expect(relayoutScene).not.toHaveBeenCalled();
      expect(dispose).toHaveBeenCalledOnce();
    } else {
      expect(objects).toContain(nextHeader);
      expect(objects).not.toContain(header);
      expect(image.getScaledWidth()).toBeLessThan(200);
      expect(nextHeader.left).toBe(header.left);
      expect(nextHeader.top).toBe(header.top);
    }
    expect(options.store.updateFrame).not.toHaveBeenCalled();
    expect(options.commitHistory).not.toHaveBeenCalled();
    preparation.mockRestore();
  }
);

it('waits for final quality preparation before accepting an unchanged preview frame', async () => {
  const { options } = createPreviewFixture();
  const frame = { ...options.frame, backgroundBlurAmount: 12 };
  await applyEditorFrameSceneSettings({
    ...options,
    frame,
    preview: true,
    prepareBackground: async () => ({ apply: () => true, dispose: () => undefined }),
  });
  const final = deferredBackground();
  const pending = applyEditorFrameSceneSettings({ ...options, frame, ...final });
  expect(final.prepareBackground).toHaveBeenCalledOnce();
  expect(options.store.updateFrame).not.toHaveBeenCalled();
  expect(options.commitHistory).not.toHaveBeenCalled();
  final.complete();
  await pending;
  expect(final.prepared.apply).toHaveBeenCalledOnce();
  expect(options.store.updateFrame).toHaveBeenCalledOnce();
  expect(options.commitHistory).toHaveBeenCalledOnce();
  expect(final.prepared.apply.mock.invocationCallOrder[0]).toBeLessThan(
    options.commitHistory.mock.invocationCallOrder[0]!
  );
});

it('restores final baseline quality without history after a baseline-equal transient preview', async () => {
  const { options } = createPreviewFixture();
  const baseline = { ...options.store.getFrame(), backgroundBlurAmount: 12 };
  options.store.updateFrame(baseline);
  options.store.updateFrame.mockClear();
  const prepareBackground = async () => ({ apply: () => true, dispose: () => undefined });
  await applyEditorFrameSceneSettings({
    ...options,
    preview: true,
    prepareBackground,
    frame: { ...baseline, backgroundBlurAmount: 20 },
  });
  await applyEditorFrameSceneSettings({
    ...options,
    preview: true,
    prepareBackground,
    frame: baseline,
  });
  const final = deferredBackground();
  const pending = applyEditorFrameSceneSettings({
    ...options,
    ...final,
    preview: true,
    quality: 'final',
    frame: baseline,
  });
  expect(final.prepareBackground).toHaveBeenCalledOnce();
  expect(final.prepared.apply).not.toHaveBeenCalled();
  final.complete();
  await pending;
  expect(final.prepared.apply).toHaveBeenCalledOnce();
  expect(options.store.updateFrame).not.toHaveBeenCalled();
  expect(options.commitHistory).not.toHaveBeenCalled();
  expect(options.store.getFrame()).toBe(baseline);
});
