// @vitest-environment jsdom
import { act, type ContextType } from 'react';
import { WorkspacePreviewContext } from '../../../../runtime/controller/composition/contexts';
import { DEFAULT_VIDEO_EDITOR_PREVIEW_PREFERENCES } from '../../../../../composition/persistence/video-editor-preview-preferences';
import type { GpuPreviewRenderer } from '../../../../../features/video/composition/canvas/gpu-preview';
import type { VideoPreviewRenderer } from '../../../../../features/video/preview/preferences';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createVideoProjectAsset } from '../../../../../features/video/project/factories/creation';
import {
  createBookendImagePresentation,
  createBookendVideoPresentation,
} from '../../../../../features/video/project/scene/bookend-media';
import { loadVideoEditorAssetBlob } from '../../../../runtime/session/asset-urls';
import { SceneBookendPreview } from './scene-bookend-preview';
import * as previewQueue from './scene-bookend-preview-render';

const gpu = vi.hoisted(() => ({
  create:
    vi.fn<
      typeof import('../../../../../features/video/composition/canvas/gpu-preview').createGpuPreviewRenderer
    >(),
}));
vi.mock('../../../../../features/video/composition/canvas/gpu-preview', async (original) => ({
  ...(await original<
    typeof import('../../../../../features/video/composition/canvas/gpu-preview')
  >()),
  createGpuPreviewRenderer: gpu.create,
}));
vi.mock('../../../../runtime/session/asset-urls', async (original) => ({
  ...(await original<typeof import('../../../../runtime/session/asset-urls')>()),
  loadVideoEditorAssetBlob: vi.fn(),
}));
vi.mock('../../../../../platform/i18n', async (original) => ({
  ...(await original<typeof import('../../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
const createUrl = vi.fn(() => 'blob:source-preview');
const revokeUrl = vi.fn();
function asset(id: string, type: 'IMAGE' | 'VIDEO' | 'RECORDING' = 'IMAGE') {
  return createVideoProjectAsset(
    id,
    type,
    { kind: 'project-asset', projectAssetId: `${id}-bytes` },
    {
      width: 641,
      height: 359,
      duration: type !== 'IMAGE' ? 6 : null,
      hasAudio: true,
      mimeType: type !== 'IMAGE' ? 'video/webm' : 'image/png',
      size: 100,
      audioPeaks: null,
    }
  );
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  observers.length = 0;
  captures.length = 0;
  bounds = { width: 160, height: 90 };
  vi.stubGlobal('ResizeObserver', TestResizeObserver);
  vi.clearAllMocks();
  createUrl.mockImplementation(() => 'blob:source-preview');
  gpu.create.mockReset().mockResolvedValue(null);
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL = createUrl;
      static revokeObjectURL = revokeUrl;
    }
  );
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('does not adopt a delayed source after replacement or unmount and revokes the current URL', async () => {
  const first = asset('first');
  const second = asset('second');
  let resolveFirst: (value: Blob) => void = () => {
    throw new Error('Missing request');
  };
  vi.mocked(loadVideoEditorAssetBlob)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        })
    )
    .mockResolvedValue(new Blob(['second']));
  const settings = createBookendImagePresentation();
  await act(async () =>
    root.render(
      <SceneBookendPreview asset={first} settings={settings} output={{ width: 321, height: 181 }} />
    )
  );
  await act(async () =>
    root.render(
      <SceneBookendPreview
        asset={second}
        settings={settings}
        output={{ width: 321, height: 181 }}
      />
    )
  );
  expect(host.querySelector('img')?.alt).toBe('second');
  await act(async () => resolveFirst(new Blob(['first'])));
  expect(createUrl).toHaveBeenCalledTimes(1);
  expect(host.querySelector('img')?.alt).toBe('second');
  await act(async () => root.render(null));
  expect(revokeUrl).toHaveBeenCalledExactlyOnceWith('blob:source-preview');
});

it('keeps authoring on read failure and provides an explicit retry with clean URL ownership', async () => {
  const source = asset('image');
  const settings = { ...createBookendImagePresentation(), fillColor: '#123456ff' };
  const before = structuredClone(settings);
  vi.mocked(loadVideoEditorAssetBlob)
    .mockRejectedValueOnce(new Error('Private source path'))
    .mockResolvedValueOnce(new Blob(['bytes']));
  await act(async () =>
    root.render(
      <SceneBookendPreview
        asset={source}
        settings={settings}
        output={{ width: 321, height: 181 }}
      />
    )
  );
  expect(host.querySelector('[role="alert"]')?.textContent).toBe(
    'videoEditor.sidebar.bookendPreviewFailed'
  );
  expect(host.textContent).not.toContain('Private source path');
  await act(async () => host.querySelector<HTMLButtonElement>('button')!.click());
  expect(host.querySelector('img')).not.toBeNull();
  expect(host.querySelector('[role="alert"]')).toBeNull();
  expect(settings).toEqual(before);
});

it('seeks only the disposable video to the authored trim and retains fractional framing', async () => {
  const source = asset('movie', 'VIDEO');
  const settings = { ...createBookendVideoPresentation(6), trim: { start: 1.137, end: 4.5 } };
  vi.mocked(loadVideoEditorAssetBlob).mockResolvedValue(new Blob(['video']));
  const main = document.createElement('video');
  main.currentTime = 4.2;
  document.body.append(main);
  try {
    await act(async () =>
      root.render(
        <SceneBookendPreview
          asset={source}
          settings={settings}
          output={{ width: 321, height: 181 }}
        />
      )
    );
    const preview = host.querySelector('video')!;
    act(() => preview.dispatchEvent(new Event('loadedmetadata')));
    expect(preview.currentTime).toBe(1.137);
    expect(main.currentTime).toBe(4.2);
    expect(preview.style.height).not.toBe('100%');
    expect(preview.muted).toBe(true);
    expect(loadVideoEditorAssetBlob).toHaveBeenCalledExactlyOnceWith(source);
  } finally {
    main.remove();
  }
});

it('retains source bytes across equivalent asset clones and recipe framing edits', async () => {
  const original = asset('stable');
  vi.mocked(loadVideoEditorAssetBlob).mockResolvedValue(new Blob(['image']));
  const settings = createBookendImagePresentation();
  await act(async () =>
    root.render(
      <SceneBookendPreview
        asset={original}
        settings={settings}
        output={{ width: 321, height: 181 }}
      />
    )
  );
  const url = host.querySelector('img')?.getAttribute('src');
  const equivalent = {
    ...original,
    source: { ...original.source },
    metadata: { ...original.metadata },
  };
  await act(async () =>
    root.render(
      <SceneBookendPreview
        asset={equivalent}
        settings={{ ...settings, fit: 'cover', crop: { panX: 0.25, panY: 0 } }}
        output={{ width: 321, height: 181 }}
      />
    )
  );
  expect(loadVideoEditorAssetBlob).toHaveBeenCalledOnce();
  expect(host.querySelector('img')?.getAttribute('src')).toBe(url);
  expect(revokeUrl).not.toHaveBeenCalled();
});

class CapturedImage implements ImageBitmap {
  readonly close = vi.fn();
  readonly width: number;
  readonly height: number;
  readonly time: number | null;
  constructor(readonly image: HTMLImageElement | HTMLVideoElement) {
    this.width = image instanceof HTMLVideoElement ? image.videoWidth : image.naturalWidth;
    this.height = image instanceof HTMLVideoElement ? image.videoHeight : image.naturalHeight;
    this.time = image instanceof HTMLVideoElement ? image.currentTime : null;
  }
}
const captures: CapturedImage[] = [];
const observers: TestResizeObserver[] = [];
let bounds = { width: 160, height: 90 };
class TestResizeObserver implements ResizeObserver {
  constructor(private callback: ResizeObserverCallback) {
    observers.push(this);
  }
  observe() {}
  unobserve() {}
  disconnect() {}
  emit() {
    this.callback([], this);
  }
}
function gpuFixture() {
  let nextUrl = 0;
  createUrl.mockImplementation(() => `blob:mounted-bookend-${++nextUrl}`);
  vi.mocked(loadVideoEditorAssetBlob).mockResolvedValue(new Blob(['media']));
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    () => new DOMRect(0, 0, bounds.width, bounds.height)
  );
  const createBitmap = vi.fn<typeof createImageBitmap>(async (image) => {
    if (!(image instanceof HTMLImageElement) && !(image instanceof HTMLVideoElement)) {
      throw new Error('Expected ready preview media');
    }
    const bitmap = new CapturedImage(image);
    captures.push(bitmap);
    return bitmap;
  });
  vi.stubGlobal('createImageBitmap', createBitmap);
  const constructVideoFrame = vi.fn(function () {
    throw new Error('Native preview must retain an RGB bitmap');
  });
  vi.stubGlobal('VideoFrame', constructVideoFrame);
  const present = vi.fn<(input: Parameters<GpuPreviewRenderer['render']>[0]) => Promise<void>>(
    async () => {}
  );
  const releaseImage = vi.fn(),
    disposeSurface = vi.fn();
  const backend = {
    allocatedBytes: 0,
    render: vi.fn<GpuPreviewRenderer['render']>(),
    dispose: vi.fn(),
    createSurface: vi.fn<NonNullable<GpuPreviewRenderer['createSurface']>>((canvas) => ({
      canvas,
      present,
      releaseImage,
      dispose: disposeSurface,
    })),
  } satisfies GpuPreviewRenderer;
  gpu.create.mockResolvedValue(backend);
  return { backend, present, releaseImage, disposeSurface, createBitmap, constructVideoFrame };
}
function context(
  renderer: VideoPreviewRenderer
): NonNullable<ContextType<typeof WorkspacePreviewContext>> {
  return {
    paneHeight: null,
    workspaceSplitRef: { current: null },
    sourceViewerActive: false,
    setSourceViewerActive: () => {},
    resetPaneHeight: () => {},
    handleStartVerticalResize: () => {},
    handleVerticalResizeKeyDown: () => {},
    preferences: {
      preferences: { ...DEFAULT_VIDEO_EDITOR_PREVIEW_PREFERENCES, renderer },
      saveFailed: false,
      retrySave: () => {},
      updatePreferences: () => {},
    },
  };
}
async function renderMounted(
  props: Parameters<typeof SceneBookendPreview>[0],
  renderer: VideoPreviewRenderer = 'gpu'
) {
  await act(async () =>
    root.render(
      <WorkspacePreviewContext.Provider value={context(renderer)}>
        <SceneBookendPreview {...props} />
      </WorkspacePreviewContext.Provider>
    )
  );
}
async function readyImage() {
  const image = host.querySelector('img');
  if (!image) throw new Error('Expected image source');
  Object.defineProperties(image, {
    complete: { configurable: true, value: true },
    naturalWidth: { configurable: true, value: 641 },
    naturalHeight: { configurable: true, value: 359 },
  });
  await act(async () => image.dispatchEvent(new Event('load')));
  return image;
}
function fallback() {
  const node = host.querySelector<HTMLElement>(
    '[data-ui="video-editor.scene-bookends.preview.fallback"]'
  );
  if (!node) throw new Error('Expected DOM fallback');
  return node;
}
function front() {
  return host.querySelector<HTMLCanvasElement>('canvas[data-preview-inspector-canvas]');
}

it('publishes ready GPU pixels and reuses capture across fit, pan and output changes', async () => {
  const f = gpuFixture(),
    source = asset('gpu-image'),
    settings = createBookendImagePresentation();
  let props = { asset: source, settings, output: { width: 321, height: 181 } };
  await renderMounted(props);
  expect(f.createBitmap).not.toHaveBeenCalled();
  const image = await readyImage();
  expect(front()).not.toBeNull();
  expect(fallback().style.opacity).toBe('0');
  expect(
    host.querySelector('[data-ui="video-editor.scene-bookends.preview"]')?.getAttribute('aria-busy')
  ).toBe('false');
  expect(f.createBitmap).toHaveBeenCalledExactlyOnceWith(image);
  expect(f.present.mock.calls[0]![0].layers[1]!.source).toBe(captures[0]);
  const original = structuredClone(settings);
  props = { ...props, settings: { ...settings, fit: 'cover', crop: { panX: 0.25, panY: -0.5 } } };
  await renderMounted(props);
  props = { ...props, output: { width: 400, height: 225 } };
  await renderMounted(props);
  bounds = { width: 200, height: 112 };
  await act(async () => observers.forEach((observer) => observer.emit()));
  expect(f.present.mock.calls.at(-1)![0].output).toEqual(bounds);
  expect(f.present.mock.calls.at(-1)![0].logical).toEqual(props.output);
  expect(f.createBitmap).toHaveBeenCalledOnce();
  expect(loadVideoEditorAssetBlob).toHaveBeenCalledOnce();
  expect(captures[0]!.close).not.toHaveBeenCalled();
  expect(settings).toEqual(original);
  await act(async () => root.render(null));
  expect(captures[0]!.close).toHaveBeenCalledOnce();
  expect(f.backend.dispose).toHaveBeenCalledOnce();
  expect(revokeUrl).toHaveBeenCalledOnce();
});

it.each(['legacy', 'unavailable'] as const)(
  'keeps admitted DOM media visible for %s without false GPU publication',
  async (mode) => {
    const f = gpuFixture();
    if (mode === 'unavailable') gpu.create.mockResolvedValue(null);
    const props = {
      asset: asset('fallback'),
      settings: createBookendImagePresentation(),
      output: { width: 321, height: 181 },
    };
    await renderMounted(props, mode === 'legacy' ? 'legacy' : 'gpu');
    await readyImage();
    expect(front()).toBeNull();
    expect(fallback().style.opacity).toBe('1');
    expect(
      host
        .querySelector('[data-ui="video-editor.scene-bookends.preview"]')
        ?.getAttribute('aria-busy')
    ).toBe('false');
    expect(f.present).not.toHaveBeenCalled();
    if (mode === 'legacy') {
      expect(gpu.create).not.toHaveBeenCalled();
      expect(f.createBitmap).not.toHaveBeenCalled();
    } else {
      expect(gpu.create).toHaveBeenCalledOnce();
      expect(captures[0]!.close).toHaveBeenCalledOnce();
    }
  }
);

it('keeps API-absent capture at the authored trim and refuses stale frames', async () => {
  vi.stubGlobal('VideoFrame', undefined);
  const f = gpuFixture(),
    source = asset('trimmed', 'VIDEO');
  vi.stubGlobal('VideoFrame', undefined);
  let props = {
    asset: source,
    settings: { ...createBookendVideoPresentation(6), trim: { start: 1.137, end: 4.5 } },
    output: { width: 321, height: 181 },
  };
  await renderMounted(props);
  const video = host.querySelector('video');
  if (!video) throw new Error('Expected preview video');
  const state = { ready: 1, seeking: true };
  Object.defineProperties(video, {
    readyState: { get: () => state.ready },
    seeking: { get: () => state.seeking },
    videoWidth: { value: 641 },
    videoHeight: { value: 359 },
  });
  await act(async () => video.dispatchEvent(new Event('loadedmetadata')));
  expect(video.currentTime).toBe(1.137);
  await act(async () => video.dispatchEvent(new Event('loadeddata')));
  expect(captures).toHaveLength(0);
  state.ready = 2;
  await act(async () => video.dispatchEvent(new Event('seeked')));
  expect(captures).toHaveLength(0);
  state.seeking = false;
  video.currentTime = 1.1;
  await act(async () => video.dispatchEvent(new Event('seeked')));
  expect(captures).toHaveLength(0);
  video.currentTime = 1.137;
  await act(async () => video.dispatchEvent(new Event('seeked')));
  expect(f.createBitmap).toHaveBeenCalledExactlyOnceWith(video);
  expect(captures).toHaveLength(1);
  expect(f.constructVideoFrame).not.toHaveBeenCalled();
  expect(captures[0]!.time).toBe(1.137);
  expect(front()).not.toBeNull();
  props = {
    ...props,
    settings: { ...props.settings, fit: 'cover', crop: { panX: 0.25, panY: -0.5 } },
  };
  await renderMounted(props);
  expect(f.createBitmap).toHaveBeenCalledOnce();
  expect(captures[0]!.close).not.toHaveBeenCalled();
  expect(f.present.mock.calls.at(-1)![0].layers[1]!.source).toBe(captures[0]);
  state.seeking = true;
  props = { ...props, settings: { ...props.settings, trim: { start: 2.375, end: 4.5 } } };
  await renderMounted(props);
  expect(video.currentTime).toBe(2.375);
  expect(captures).toHaveLength(1);
  await act(async () => video.dispatchEvent(new Event('seeked')));
  expect(captures).toHaveLength(1);
  state.seeking = false;
  await act(async () => video.dispatchEvent(new Event('seeked')));
  expect(captures).toHaveLength(2);
  expect(captures[1]!.time).toBe(2.375);
  expect(f.createBitmap).toHaveBeenCalledTimes(2);
  expect(f.constructVideoFrame).not.toHaveBeenCalled();
  expect(captures[0]!.close).toHaveBeenCalledOnce();
  expect(f.present.mock.calls.at(-1)![0].layers[1]!.source).toBe(captures[1]);
  await act(async () => root.render(null));
  expect(captures[1]!.close).toHaveBeenCalledOnce();
});

it('holds replaced image pixels through their GPU fence and publishes only the replacement', async () => {
  const f = gpuFixture(),
    completion = Promise.withResolvers<void>();
  f.present.mockReturnValueOnce(completion.promise);
  const settings = createBookendImagePresentation();
  await renderMounted({ asset: asset('old'), settings, output: { width: 321, height: 181 } });
  await readyImage();
  expect(f.present).toHaveBeenCalledOnce();
  expect(front()).toBeNull();
  await renderMounted({ asset: asset('new'), settings, output: { width: 321, height: 181 } });
  const replacement = await readyImage();
  expect(f.present).toHaveBeenCalledOnce();
  expect(captures[0]!.close).not.toHaveBeenCalled();
  await act(async () => completion.resolve());
  expect(f.present).toHaveBeenCalledTimes(2);
  expect(front()).not.toBeNull();
  expect(captures[0]!.close).toHaveBeenCalledOnce();
  expect(captures[1]!.image).toBe(replacement);
  expect(f.present.mock.calls[1]![0].layers[1]!.source).toBe(captures[1]);
  expect(f.releaseImage).toHaveBeenCalledOnce();
  await act(async () => root.render(null));
  expect(captures[1]!.close).toHaveBeenCalledOnce();
  expect(f.backend.dispose).toHaveBeenCalledOnce();
});

it('shows fixed retry UI for an ordinary GPU error and preserves authored framing', async () => {
  const f = gpuFixture(),
    source = asset('retry-image'),
    settings = createBookendImagePresentation(),
    before = structuredClone(settings);
  f.present.mockRejectedValueOnce(new Error('Private GPU driver detail'));
  await renderMounted({ asset: source, settings, output: { width: 321, height: 181 } });
  await readyImage();
  expect(host.querySelector('[role="alert"]')?.textContent).toBe(
    'videoEditor.sidebar.bookendPreviewFailed'
  );
  expect(host.textContent).not.toContain('Private GPU driver detail');
  expect(settings).toEqual(before);
  await act(async () => host.querySelector<HTMLButtonElement>('button')!.click());
  await readyImage();
  expect(front()).not.toBeNull();
  expect(host.querySelector('[role="alert"]')).toBeNull();
  expect(captures[0]!.close).toHaveBeenCalledOnce();
  expect(gpu.create).toHaveBeenCalledTimes(2);
});

it.each(['VIDEO', 'RECORDING'] as const)(
  'admits managed %s without private DOM readiness or errors',
  async (kind) => {
    vi.stubGlobal('VideoFrame', class {});
    vi.mocked(loadVideoEditorAssetBlob).mockResolvedValue(new Blob(['source']));
    const owner = { request: vi.fn(), cancel: vi.fn(), reset: vi.fn(), dispose: vi.fn() };
    let options: Parameters<typeof previewQueue.createBookendPreviewFrameQueue>[0] | undefined;
    vi.spyOn(previewQueue, 'createBookendPreviewFrameQueue').mockImplementation((value) => {
      options = value;
      return owner;
    });
    const settings = { ...createBookendVideoPresentation(6), trim: { start: 1.02, end: 4.5 } };
    await renderMounted(
      { asset: asset('managed', kind), settings, output: { width: 321, height: 181 } },
      'legacy'
    );
    const input = options!.read();
    expect(input.source).toMatchObject({ kind: 'video', ready: true, time: 1.02, rangeEnd: 4.5 });
    expect(owner.request).toHaveBeenCalled();
    expect(options!.fallbackCanvas?.()).toBe(
      host.querySelector('[data-ui="video-editor.scene-bookends.preview.fallback"] canvas')
    );
    const video = host.querySelector('video')!;
    expect(video.readyState).toBe(0);
    expect(video.style.opacity).toBe('0');
    await act(async () => video.dispatchEvent(new Event('error')));
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(options!.read().source.ready).toBe(true);
    await act(async () => video.dispatchEvent(new Event('loadedmetadata')));
    expect(video.currentTime).toBe(1.02);
  }
);
