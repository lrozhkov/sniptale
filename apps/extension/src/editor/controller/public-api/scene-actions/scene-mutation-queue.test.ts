// @vitest-environment jsdom
import { Rect } from 'fabric';
import { beforeEach, expect, it, vi } from 'vitest';
import {
  DEFAULT_BROWSER_FRAME_STATE,
  DEFAULT_EDITOR_FRAME_SETTINGS,
} from '../../../../features/editor/document/constants';
import type {
  EditorFrameSettings,
  BrowserFrameState,
} from '../../../../features/editor/document/types';
import type { BrowserFrameActionOptions } from '../../public-actions/scene/browser-frame/types';
import type { PreparedBackgroundLayer } from '../../background/sync';
import { createFabricCanvasFixture } from '../../../testing/fabric-canvas.test-support';
import type { EditorBrowserFrameApi, EditorSceneResizeApi } from './contracts';

const mocks = vi.hoisted(() => ({
  prepare: vi.fn(),
  browser: vi.fn(),
  remove: vi.fn(),
  getStore: vi.fn(),
}));
vi.mock('../../background/sync', async (original) => ({
  ...(await original<typeof import('../../background/sync')>()),
  prepareEditorBackgroundLayer: mocks.prepare,
}));
vi.mock('../../public-actions', async (original) => ({
  ...(await original<typeof import('../../public-actions')>()),
  applyEditorBrowserFrameSettings: mocks.browser,
  removeEditorBrowserFrameSettings: mocks.remove,
}));
vi.mock('../../../state/useEditorStore', () => ({ useEditorStore: { getState: mocks.getStore } }));
import { applyEditorControllerFrame } from './resize';
import {
  applyEditorControllerBrowserFrame,
  removeEditorControllerBrowserFrame,
  previewEditorControllerBrowserFrame,
  previewRemoveEditorControllerBrowserFrame,
} from './browser-frame';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((accept, refuse) => {
    resolve = accept;
    reject = refuse;
  });
  return { promise, resolve, reject };
}
function fixture() {
  const image = new Rect({ width: 200, height: 100 });
  image.sniptaleRole = 'source';
  image.sniptaleType = 'source-image';
  const objects = [image];
  const canvas = createFabricCanvasFixture({
    getObjects: () => objects,
    getActiveObjects: () => [],
    requestRenderAll: vi.fn(),
  });
  let frame = DEFAULT_EDITOR_FRAME_SETTINGS;
  let browserFrame: BrowserFrameState = DEFAULT_BROWSER_FRAME_STATE;
  const publications: string[] = [];
  const store = {
    get frame() {
      return frame;
    },
    get browserFrame() {
      return browserFrame;
    },
    updateFrame: vi.fn((next: EditorFrameSettings) => {
      frame = next;
      publications.push('frame');
    }),
    setBrowserFrame: vi.fn((next: BrowserFrameState) => {
      browserFrame = next;
      publications.push('browser');
    }),
  };
  mocks.getStore.mockReturnValue(store);
  let token = 0;
  const controller: EditorSceneResizeApi & EditorBrowserFrameApi = {
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
    canvasDocumentSize: { width: 264, height: 164 },
    zoomLevel: 1,
    viewportDevicePixelRatioBaseline: 1,
    createLayerMutationToken: () => ++token,
    isLayerMutationTokenCurrent: (candidate) => candidate === token,
    prepareObject: vi.fn(),
    rebuildFrameDecorations: vi.fn(async () => undefined),
    relayoutScene: vi.fn(),
    commitHistory: vi.fn(),
    syncRuntimeState: vi.fn(),
    ensureReachableObjects: vi.fn(() => false),
    ensureBrowserFrameOnTop: vi.fn(),
    nextLabelIndex: () => 1,
  };
  const edited = { ...frame, sourceImage: { ...frame.sourceImage!, radius: 18 } };
  return { controller, store, edited, publications, objects, canvas };
}
beforeEach(() => {
  vi.resetAllMocks();
});

it.each(['frame-first', 'browser-first'] as const)(
  'accepts both completed scene edits in call order: %s',
  async (order) => {
    const { controller, store, edited, publications } = fixture();
    const background = deferred<PreparedBackgroundLayer>();
    const header = deferred<void>();
    const backgroundStarted = deferred<void>();
    const headerStarted = deferred<void>();
    mocks.prepare.mockImplementation(async () => {
      backgroundStarted.resolve();
      return background.promise;
    });
    mocks.browser.mockImplementation(
      async (args: BrowserFrameActionOptions & { browserFrame: BrowserFrameState }) => {
        args.store.setBrowserFrame(args.browserFrame);
        headerStarted.resolve();
        await header.promise;
        if (args.isMutationCurrent?.()) args.commitHistory();
      }
    );
    const applyFrame = () => applyEditorControllerFrame(controller, edited);
    const applyHeader = () =>
      applyEditorControllerBrowserFrame(controller, {
        ...DEFAULT_BROWSER_FRAME_STATE,
        title: 'New header',
      });
    let frame: Promise<boolean | void>;
    let browser: Promise<void>;
    if (order === 'frame-first') {
      frame = applyFrame();
      await backgroundStarted.promise;
      browser = applyHeader();
      expect(mocks.browser).not.toHaveBeenCalled();
      background.resolve({ apply: () => true, dispose: vi.fn() });
      expect(await frame).toBe(true);
      await headerStarted.promise;
      header.resolve();
      await browser;
      expect(publications).toEqual(['frame', 'browser']);
    } else {
      browser = applyHeader();
      await headerStarted.promise;
      frame = applyFrame();
      expect(mocks.prepare).not.toHaveBeenCalled();
      header.resolve();
      await browser;
      await backgroundStarted.promise;
      background.resolve({ apply: () => true, dispose: vi.fn() });
      expect(await frame).toBe(true);
      expect(publications).toEqual(['browser', 'frame']);
    }
    expect(store.updateFrame).toHaveBeenCalledOnce();
    expect(controller.commitHistory).toHaveBeenCalledTimes(2);
  }
);

it.each(['abort', 'undo', 'dispose'] as const)(
  'returns false for an invalidated delayed frame: %s',
  async (cause) => {
    const { controller, store, edited, objects, canvas } = fixture();
    const background = deferred<PreparedBackgroundLayer>();
    const started = deferred<void>();
    mocks.prepare.mockImplementation(async () => {
      started.resolve();
      return background.promise;
    });
    const abort = new AbortController();
    const pending = applyEditorControllerFrame(controller, edited, { signal: abort.signal });
    await started.promise;
    if (cause === 'abort') abort.abort();
    else if (cause === 'undo') objects.length = 0;
    else canvas.disposed = true;
    const prepared = { apply: vi.fn(() => true), dispose: vi.fn() };
    background.resolve(prepared);
    expect(await pending).toBe(false);
    expect(prepared.apply).not.toHaveBeenCalled();
    expect(prepared.dispose).toHaveBeenCalledOnce();
    expect(store.updateFrame).not.toHaveBeenCalled();
    expect(controller.commitHistory).not.toHaveBeenCalled();
  }
);

it('keeps queued browser work valid after frame asset failure', async () => {
  const { controller, edited, store } = fixture();
  const background = deferred<PreparedBackgroundLayer>();
  const started = deferred<void>();
  mocks.prepare.mockImplementation(async () => {
    started.resolve();
    return background.promise;
  });
  mocks.remove.mockImplementation(async (args: BrowserFrameActionOptions) => {
    args.commitHistory();
  });
  const frame = applyEditorControllerFrame(controller, edited);
  const failure = expect(frame).rejects.toThrow('Decode failed');
  await started.promise;
  const browser = removeEditorControllerBrowserFrame(controller);
  expect(mocks.remove).not.toHaveBeenCalled();
  background.reject(new Error('Decode failed'));
  await failure;
  await browser;
  expect(store.updateFrame).not.toHaveBeenCalled();
  expect(controller.commitHistory).toHaveBeenCalledOnce();
});

it('skips obsolete queued browser intents without dropping an earlier completed frame', async () => {
  const { controller, edited, store } = fixture();
  const background = deferred<PreparedBackgroundLayer>();
  const started = deferred<void>();
  mocks.prepare.mockImplementation(async () => {
    started.resolve();
    return background.promise;
  });
  mocks.browser.mockImplementation(
    async (args: BrowserFrameActionOptions & { browserFrame: BrowserFrameState }) => {
      args.store.setBrowserFrame(args.browserFrame);
      if (args.isMutationCurrent?.()) args.commitHistory();
    }
  );
  const frame = applyEditorControllerFrame(controller, edited);
  await started.promise;
  const old = applyEditorControllerBrowserFrame(controller, {
    ...DEFAULT_BROWSER_FRAME_STATE,
    title: 'Old header',
  });
  const latest = applyEditorControllerBrowserFrame(controller, {
    ...DEFAULT_BROWSER_FRAME_STATE,
    title: 'Latest header',
  });
  background.resolve({ apply: () => true, dispose: vi.fn() });
  expect(await frame).toBe(true);
  await Promise.all([old, latest]);
  expect(mocks.browser).toHaveBeenCalledOnce();
  expect(store.browserFrame.title).toBe('Latest header');
  expect(store.updateFrame).toHaveBeenCalledOnce();
  expect(controller.commitHistory).toHaveBeenCalledTimes(2);
});

it('cancels an active superseded browser asset without a frame invalidating the latest intent', async () => {
  const { controller, edited, store } = fixture();
  const oldHeader = deferred<void>();
  const started = deferred<void>();
  mocks.prepare.mockResolvedValue({ apply: () => true, dispose: vi.fn() });
  mocks.browser.mockImplementation(
    async (args: BrowserFrameActionOptions & { browserFrame: BrowserFrameState }) => {
      args.store.setBrowserFrame(args.browserFrame);
      if (args.browserFrame.title === 'Old header') {
        started.resolve();
        await oldHeader.promise;
      }
      if (args.isMutationCurrent?.()) args.commitHistory();
    }
  );
  const old = applyEditorControllerBrowserFrame(controller, {
    ...DEFAULT_BROWSER_FRAME_STATE,
    title: 'Old header',
  });
  await started.promise;
  const frame = applyEditorControllerFrame(controller, edited);
  const latest = applyEditorControllerBrowserFrame(controller, {
    ...DEFAULT_BROWSER_FRAME_STATE,
    title: 'Latest header',
  });
  oldHeader.resolve();
  await old;
  expect(await frame).toBe(true);
  await latest;
  expect(store.browserFrame.title).toBe('Latest header');
  expect(store.updateFrame).toHaveBeenCalledOnce();
  expect(controller.commitHistory).toHaveBeenCalledTimes(2);
});

it('keeps the retained browser preview barriers ordered with frame application', async () => {
  const { controller, edited } = fixture();
  const background = deferred<PreparedBackgroundLayer>();
  const started = deferred<void>();
  mocks.prepare.mockImplementation(async () => {
    started.resolve();
    return background.promise;
  });
  const frame = applyEditorControllerFrame(controller, edited);
  await started.promise;
  const after: string[] = [];
  const preview = previewEditorControllerBrowserFrame(controller, DEFAULT_BROWSER_FRAME_STATE).then(
    () => after.push('preview')
  );
  const removal = previewRemoveEditorControllerBrowserFrame(controller).then(() =>
    after.push('removal')
  );
  expect(after).toEqual([]);
  background.resolve({ apply: () => true, dispose: vi.fn() });
  expect(await frame).toBe(true);
  await Promise.all([preview, removal]);
  expect(after).toEqual(['preview', 'removal']);
});

it('reports a queued canceled frame without starting its asset preparation', async () => {
  const { controller, edited } = fixture();
  const background = deferred<PreparedBackgroundLayer>();
  const started = deferred<void>();
  mocks.prepare.mockImplementation(async () => {
    started.resolve();
    return background.promise;
  });
  const first = applyEditorControllerFrame(controller, edited);
  await started.promise;
  const abort = new AbortController();
  const second = applyEditorControllerFrame(controller, edited, { signal: abort.signal });
  abort.abort();
  background.resolve({ apply: () => true, dispose: vi.fn() });
  expect(await first).toBe(true);
  expect(await second).toBe(false);
  expect(mocks.prepare).toHaveBeenCalledOnce();
  expect(controller.commitHistory).toHaveBeenCalledOnce();
});

it.each(['canvas', 'source', 'disposed'] as const)(
  'skips queued browser intent after authoritative %s replacement',
  async (cause) => {
    const { controller, edited, objects, canvas } = fixture();
    const background = deferred<PreparedBackgroundLayer>();
    const started = deferred<void>();
    mocks.prepare.mockImplementation(async () => {
      started.resolve();
      return background.promise;
    });
    const frame = applyEditorControllerFrame(controller, edited);
    await started.promise;
    const browser = applyEditorControllerBrowserFrame(controller, DEFAULT_BROWSER_FRAME_STATE);
    if (cause === 'canvas') controller.canvas = createFabricCanvasFixture({ getObjects: () => [] });
    else if (cause === 'source') objects.length = 0;
    else canvas.disposed = true;
    background.resolve({ apply: () => true, dispose: vi.fn() });
    expect(await frame).toBe(false);
    await browser;
    expect(mocks.browser).not.toHaveBeenCalled();
    expect(controller.commitHistory).not.toHaveBeenCalled();
  }
);

it('returns false without a mounted source scene', async () => {
  const { controller, edited } = fixture();
  controller.canvas = null;
  expect(await applyEditorControllerFrame(controller, edited)).toBe(false);
  expect(mocks.prepare).not.toHaveBeenCalled();
  expect(controller.commitHistory).not.toHaveBeenCalled();
});
