import { ReviewPreviewRendererContext } from './use-preview-preferences';
import { VideoSample } from 'mediabunny';
import type { PreviewSourceLease } from '../../workflows/video/preview-source';
import type { VideoCompositionFrameSource } from '../../features/video/composition/draw/media-source';
// @vitest-environment jsdom
import { createZoomPreviewPaintOwner } from './zoom-preview-paint-owner';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import * as React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { ReviewZoomPreview } from './zoom-preview';
import { ZoomPreviewCanvas } from './zoom-preview-canvas';
import { createQuickEditZoomRegion } from '../../features/video/review/advanced/zoom';
import {
  createZoomPreviewGpuRenderer,
  zoomPreviewGpuProjection,
  type ZoomPreviewGpuInput,
} from './zoom-preview-gpu';
import {
  computeQuickEditSpatialWindow,
  computeQuickEditSceneLayout,
  computeQuickEditSpatialRasterLayout,
} from '../../features/video/review/advanced/scene';
import {
  quickEditPlaneProjection,
  projectQuickEditPoint,
} from '../../features/video/composition/motion/spatial-geometry';
import {
  GpuPreviewDeviceError,
  type GpuPreviewLayer,
} from '../../features/video/composition/canvas/gpu-preview';
const sources = vi.hoisted(() => ({
  create: vi.fn(),
  acquire: vi.fn(),
  retain: vi.fn(),
  dispose: vi.fn(),
}));
vi.mock('../../workflows/video/preview-source', () => ({
  createPreviewSourceProvider: sources.create,
}));
const io = vi.hoisted(() => ({ create: vi.fn(), render: vi.fn(), dispose: vi.fn() }));
vi.mock('../../features/video/composition/canvas/gpu-preview', async (original) => ({
  ...(await original<typeof import('../../features/video/composition/canvas/gpu-preview')>()),
  createGpuPreviewRenderer: io.create,
}));
vi.mock('../../platform/i18n', async (original) => ({
  ...(await original<typeof import('../../platform/i18n')>()),
  translate: (key: string) => key,
}));
const output = { width: 480, height: 270 };
const owners: { dispose(): void }[] = [];
const compatible = vi.hoisted(() => ({
  create: vi.fn(),
  acquire: vi.fn(),
  retain: vi.fn(),
  dispose: vi.fn(),
}));
vi.mock('../../workflows/video/preview-html-source', () => ({
  createPreviewHtmlSourceProvider: compatible.create,
}));
beforeEach(() => {
  compatible.acquire.mockReset();
  compatible.create.mockReturnValue({
    acquire: compatible.acquire,
    retainSources: compatible.retain,
    dispose: compatible.dispose,
  });
  vi.stubGlobal(
    'VideoFrame',
    class {
      close() {}
    }
  );
  sources.acquire.mockReset().mockResolvedValue(null);
  sources.create.mockReturnValue({
    acquire: sources.acquire,
    retainSources: sources.retain,
    dispose: sources.dispose,
  });
  vi.stubGlobal('navigator', { gpu: {}, userAgent: 'jsdom', language: 'en-US' });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
    this: HTMLCanvasElement
  ) {
    return {
      canvas: this,
      drawImage: vi.fn(),
      translate: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      beginPath: vi.fn(),
      roundRect: vi.fn(),
      clip: vi.fn(),
      fill: vi.fn(),
    } as unknown as CanvasRenderingContext2D;
  });
  vi.stubGlobal(
    'Path2D',
    class {
      moveTo() {}
      lineTo() {}
      closePath() {}
    }
  );
});
afterEach(() => {
  for (const owner of owners.splice(0)) owner.dispose();
  vi.restoreAllMocks();
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});
function input(overrides: Partial<ZoomPreviewGpuInput> = {}): ZoomPreviewGpuInput {
  const camera = { scale: 2, centerX: 0.5, centerY: 0.5 };
  return {
    output,
    background: { enabled: false },
    imageUrl: null,
    frame: { image: document.createElement('canvas'), width: 1904, height: 984 },
    camera,
    layout: computeQuickEditSceneLayout({
      source: { width: 1904, height: 984 },
      output,
      background: { enabled: false },
      camera,
    }),
    view: 'result',
    cornerRadius: 0,
    ...overrides,
  };
}
function bitmap() {
  return { width: output.width, height: output.height, close: vi.fn() } as unknown as ImageBitmap;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { resolve, promise };
}

it('samples a live original VideoFrame directly and retains it until GPU completion', async () => {
  const frames: { close: ReturnType<typeof vi.fn>; copyTo: ReturnType<typeof vi.fn> }[] = [];
  vi.stubGlobal(
    'VideoFrame',
    class {
      timestamp = 1_000_000;
      close = vi.fn();
      copyTo = vi.fn();
      constructor() {
        frames.push(this);
      }
    }
  );
  const held = deferred<ImageBitmap>();
  const completed = bitmap();
  io.render.mockReturnValue(held.promise);
  io.create.mockResolvedValue({ render: io.render, dispose: io.dispose, allocatedBytes: 0 });
  const owner = createZoomPreviewGpuRenderer();
  owners.push(owner);
  const video = document.createElement('video');
  Object.defineProperty(video, 'readyState', { configurable: true, value: 2 });
  const request = input({ frame: { image: video, width: 1904, height: 984 }, live: true });
  const pending = owner.render(request, new AbortController().signal);
  await vi.waitFor(() => expect(io.render).toHaveBeenCalledOnce());
  expect(frames).toHaveLength(1);
  expect(frames[0]!.copyTo).not.toHaveBeenCalled();
  expect(frames[0]!.close).not.toHaveBeenCalled();
  held.resolve(completed);
  expect(await pending).toBe(completed);
  expect(frames[0]!.close).toHaveBeenCalledOnce();
  expect(completed.close).not.toHaveBeenCalled();
  completed.close();
});

it('uses native-density GPU groups for depth and optical lenses without a flattened source canvas', async () => {
  vi.stubGlobal('VideoFrame', class {});
  const completed = bitmap();
  io.render.mockResolvedValue(completed);
  io.create.mockResolvedValue({ render: io.render, dispose: io.dispose, allocatedBytes: 0 });
  const owner = createZoomPreviewGpuRenderer();
  owners.push(owner);
  const camera = {
    scale: 1.5,
    centerX: 0.5,
    centerY: 0.5,
    spatial: {
      rotation: [0, 0.1, 0, Math.sqrt(0.99)] as const,
      perspective: 0.7,
      windowMotion: 1,
      lockBackground: true,
      focus: [
        {
          weight: 1,
          settings: {
            enabled: true,
            mode: 'area' as const,
            x: 0.5,
            y: 0.5,
            width: 0.2,
            softness: 0.3,
            strength: 0.5,
          },
        },
      ],
    },
  };
  const request = input({
    camera,
    spotlightFrames: [
      {
        opening: { x: 100, y: 80, width: 80, height: 80 },
        radius: 8,
        dim: 0,
        blur: 0,
        lens: { scale: 2, optics: 'optical', edgeWidth: 8 },
      },
    ],
  });
  await owner.render(request, new AbortController().signal);
  const layers: GpuPreviewLayer[] = [];
  const visit = (values: readonly GpuPreviewLayer[]) => {
    for (const layer of values) {
      layers.push(layer);
      if ('kind' in layer.source && layer.source.kind === 'group') visit(layer.source.layers);
    }
  };
  visit(io.render.mock.calls[0]![0].layers);
  expect(layers.some((layer) => layer.depth?.frame === camera.spatial)).toBe(true);
  expect(layers.some((layer) => layer.lens?.optics === 'optical')).toBe(true);
  expect(layers.some((layer) => layer.source === request.frame!.image)).toBe(true);
  expect(
    layers.some(
      (layer) =>
        'kind' in layer.source &&
        layer.source.kind === 'group' &&
        layer.source.output.width >= request.frame!.width
    )
  ).toBe(true);
  completed.close();
});

it('allows only device failures to choose the existing backend', async () => {
  vi.stubGlobal('VideoFrame', class {});
  io.create.mockResolvedValue({ render: io.render, dispose: io.dispose, allocatedBytes: 0 });
  io.render.mockRejectedValue(new GpuPreviewDeviceError('Lost'));
  const owner = createZoomPreviewGpuRenderer();
  owners.push(owner);
  expect(await owner.render(input(), new AbortController().signal)).toBeNull();
  const next = createZoomPreviewGpuRenderer();
  owners.push(next);
  io.render.mockRejectedValue(new Error('Invalid scene'));
  await expect(next.render(input(), new AbortController().signal)).rejects.toThrow('Invalid scene');
});

it.each(['source', 'view', 'output'] as const)(
  'discards an incompatible completed frame after %s replacement',
  async (replacement) => {
    const first = deferred<ImageBitmap>();
    const old = bitmap(),
      latest = bitmap();
    const render = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue(latest);
    const publish = vi.fn(),
      receipt = vi.fn(),
      fallback = vi.fn();
    const owner = createZoomPreviewPaintOwner({
      renderer: { render, dispose: vi.fn() },
      publish,
      fallback,
      onBackend: vi.fn(),
      onError: vi.fn(),
      onPresented: receipt,
    });
    owners.push(owner);
    const initial = input();
    owner.update(initial);
    const next = {
      ...initial,
      authoringRevision: 'replacement-first',
      ...(replacement === 'source'
        ? { frame: { ...initial.frame!, image: document.createElement('canvas') } }
        : replacement === 'view'
          ? { view: 'area' as const }
          : { output: { width: 320, height: 180 } }),
      camera: { ...initial.camera, centerX: 0.6 },
    };
    owner.update(next);
    owner.update({
      ...next,
      authoringRevision: 'replacement-latest',
      camera: { ...next.camera, centerX: 0.7 },
    });
    expect(render).toHaveBeenCalledOnce();
    expect(render.mock.calls[0]![1].aborted).toBe(true);
    first.resolve(old);
    await vi.waitFor(() => expect(render).toHaveBeenCalledTimes(2));
    expect(render.mock.calls[1]![0].camera.centerX).toBe(0.7);
    expect(old.close).toHaveBeenCalledOnce();
    expect(publish).toHaveBeenCalledOnce();
    expect(receipt.mock.lastCall![0]).toBe(render.mock.calls[1]![0]);
    expect(fallback).not.toHaveBeenCalled();
  }
);

it('publishes completed authoring poses during a drag while coalescing the latest pose', async () => {
  const first = deferred<ImageBitmap>();
  const second = deferred<ImageBitmap>();
  const shown = bitmap(),
    latest = bitmap();
  const render = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  const publish = vi.fn(),
    receipt = vi.fn();
  const owner = createZoomPreviewPaintOwner({
    renderer: { render, dispose: vi.fn() },
    publish,
    fallback: vi.fn(),
    onBackend: vi.fn(),
    onError: vi.fn(),
    onPresented: receipt,
  });
  owners.push(owner);
  const initial = input({ authoringRevision: 'drag-0' });
  owner.update(initial);
  for (let step = 1; step <= 20; step++)
    owner.update({
      ...initial,
      authoringRevision: `drag-${step}`,
      camera: { ...initial.camera, centerX: 0.5 + step / 100 },
    });
  expect(render).toHaveBeenCalledOnce();
  expect(render.mock.calls[0]![1].aborted).toBe(false);
  first.resolve(shown);
  await vi.waitFor(() => expect(render).toHaveBeenCalledTimes(2));
  expect(publish.mock.calls[0]).toEqual([shown, initial]);
  expect(receipt.mock.calls[0]).toEqual([initial]);
  expect(render.mock.calls[1]![0].authoringRevision).toBe('drag-20');
  second.resolve(latest);
  await vi.waitFor(() => expect(publish).toHaveBeenCalledTimes(2));
  expect(receipt.mock.lastCall![0]).toBe(render.mock.calls[1]![0]);
  expect(shown.close).toHaveBeenCalledOnce();
  expect(latest.close).toHaveBeenCalledOnce();
});

it('does not starve live publications when a later clock arrives, and cancels its tick on dispose', async () => {
  const first = deferred<ImageBitmap>();
  const shown = bitmap();
  const render = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue(bitmap());
  const publish = vi.fn(),
    tick = vi.fn(() => 7),
    cancel = vi.fn();
  const owner = createZoomPreviewPaintOwner({
    renderer: { render, dispose: vi.fn() },
    publish,
    fallback: vi.fn(),
    onBackend: vi.fn(),
    onError: vi.fn(),
    requestTick: tick,
    cancelTick: cancel,
  });
  const initial = input({ live: true, authoringRevision: 'same-model' });
  owner.update(initial);
  owner.update({ ...initial, currentTime: 2, camera: { ...initial.camera, centerX: 0.7 } });
  expect(render.mock.calls[0]![1].aborted).toBe(false);
  first.resolve(shown);
  await vi.waitFor(() => expect(publish).toHaveBeenCalledTimes(2));
  expect(tick).toHaveBeenCalledOnce();
  owner.dispose();
  expect(cancel).toHaveBeenCalledWith(7);
});

it('uses the exact result projection for round-trip camera hit testing', () => {
  const request = input();
  const geometry = zoomPreviewGpuProjection(request);
  const point = { x: 180, y: 90 };
  const displayed = projectQuickEditPoint(geometry.projection, point)!;
  const restored = projectQuickEditPoint(geometry.inverse, displayed)!;
  expect(restored.x).toBeCloseTo(point.x, 10);
  expect(restored.y).toBeCloseTo(point.y, 10);
  expect(zoomPreviewGpuProjection({ ...request, view: 'area' }).projection).toEqual([
    1, 0, 0, 0, 1, 0, 0, 0, 1,
  ]);
});

it('does not turn a completed-frame UI acknowledgement into another live render', async () => {
  const render = vi.fn(async () => bitmap());
  const tick = vi.fn(() => 3);
  const acknowledge = vi.fn((value: ZoomPreviewGpuInput) => {
    if (acknowledge.mock.calls.length < 3) owner.update({ ...value });
  });
  const owner = createZoomPreviewPaintOwner({
    renderer: { render, dispose: vi.fn() },
    publish: vi.fn(),
    fallback: vi.fn(),
    onBackend: vi.fn(),
    onError: vi.fn(),
    onPresented: acknowledge,
    requestTick: tick,
    cancelTick: vi.fn(),
  });
  owners.push(owner);
  owner.update(input({ live: true }));
  await vi.waitFor(() => expect(acknowledge).toHaveBeenCalled());
  expect(render).toHaveBeenCalledOnce();
  expect(acknowledge).toHaveBeenCalledOnce();
  expect(tick).toHaveBeenCalledOnce();
});

it('admits inspector gestures only after the first completed frame for the selected view', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('VideoFrame', class {});
  const first = deferred<ImageBitmap>(),
    second = deferred<ImageBitmap>();
  io.render
    .mockReturnValueOnce(first.promise)
    .mockReturnValueOnce(second.promise)
    .mockResolvedValue(bitmap());
  io.create.mockResolvedValue({ render: io.render, dispose: io.dispose, allocatedBytes: 0 });
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const source = document.createElement('canvas');
  source.width = 640;
  source.height = 360;
  try {
    await act(async () =>
      root.render(
        React.createElement(ReviewZoomPreview, {
          region: createQuickEditZoomRegion({ id: 'ready-proof', at: 0, duration: 4 }),
          background: { enabled: false },
          source: { width: 640, height: 360 },
          sourceTime: 2,
          loadFrame: async () => ({ image: source, width: 640, height: 360 }),
          onChange() {},
        })
      )
    );
    await vi.waitFor(() => expect(io.render).toHaveBeenCalledOnce());
    const section = () =>
      host.querySelector<HTMLElement>('[data-ui="gallery.videoReview.zoomPreview"]')!;
    expect(section().dataset['status']).toBe('loading');
    await act(async () => first.resolve(bitmap()));
    expect(section().dataset['status']).toBe('ready');
    const result =
      host.querySelector<HTMLButtonElement>(
        'button[title="gallery.videoReview.zoomPreviewResult"]'
      ) ??
      [...host.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
        button.title.toLowerCase().includes('result')
      )!;
    await act(async () => result.click());
    expect(section().dataset['status']).toBe('loading');
    await act(async () => second.resolve(bitmap()));
    expect(section().dataset['status']).toBe('ready');
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

it('uses each exposure spatial window policy rather than the previous layout pose', () => {
  const camera = {
    scale: 1.5,
    centerX: 0.7,
    centerY: 0.4,
    spatial: {
      rotation: [0, 0, 0, 1] as const,
      perspective: 0.7,
      windowMotion: 1,
      lockBackground: true,
      focus: [],
    },
  };
  const request = input({ camera });
  const layout = computeQuickEditSceneLayout({
    source: { width: request.frame!.width, height: request.frame!.height },
    output,
    background: request.background,
    camera,
  });
  const expected = quickEditPlaneProjection(
    layout.windowRect,
    computeQuickEditSpatialWindow(layout, request.background),
    camera.spatial
  );
  expect(zoomPreviewGpuProjection(request).windowProjection).toEqual(expected);
});

it('preserves each exposure inner zoom inside the projected window', async () => {
  vi.stubGlobal('VideoFrame', class {});
  io.render.mockResolvedValue(bitmap());
  io.create.mockResolvedValue({ render: io.render, dispose: io.dispose, allocatedBytes: 0 });
  const camera = {
    scale: 2,
    centerX: 0.6,
    centerY: 0.4,
    spatial: {
      rotation: [0, 0, 0, 1] as const,
      perspective: 0.5,
      windowMotion: 0.5,
      lockBackground: true,
      focus: [],
    },
  };
  const second = { ...camera, scale: 1.5 };
  const request = input({
    camera,
    exposures: [
      { camera, alpha: 0.5 },
      { camera: second, alpha: 0.5 },
    ],
  });
  const owner = createZoomPreviewGpuRenderer();
  owners.push(owner);
  await owner.render(request, new AbortController().signal);
  const actual: GpuPreviewLayer[] = [];
  const visit = (layers: readonly GpuPreviewLayer[]) => {
    for (const layer of layers) {
      if (layer.source === request.frame!.image) actual.push(layer);
      if ('kind' in layer.source && layer.source.kind === 'group') visit(layer.source.layers);
    }
  };
  visit(io.render.mock.calls[0]![0].layers);
  expect(actual).toHaveLength(2);
  expect(actual.map((layer) => layer.rect)).toEqual(
    [camera, second].map((pose) => {
      const layout = computeQuickEditSceneLayout({
        source: { width: request.frame!.width, height: request.frame!.height },
        output: request.output,
        background: request.background,
        camera: pose,
      });
      return computeQuickEditSpatialRasterLayout(layout, request.background).videoTransform;
    })
  );
});

it('waits for native video readiness without choosing a fallback or failing the inspector', async () => {
  const video = document.createElement('video');
  const closed = vi.fn();
  vi.stubGlobal(
    'VideoFrame',
    class {
      timestamp = 0;
      close = closed;
    }
  );
  const ready = bitmap();
  io.render.mockResolvedValue(ready);
  io.create.mockResolvedValue({ render: io.render, dispose: io.dispose, allocatedBytes: 0 });
  const tick = vi.fn((_callback: () => void) => 1),
    failure = vi.fn(),
    fallback = vi.fn(),
    publish = vi.fn();
  const owner = createZoomPreviewPaintOwner({
    fallback,
    publish,
    onBackend: vi.fn(),
    onError: failure,
    requestTick: tick,
    cancelTick: vi.fn(),
  });
  owners.push(owner);
  owner.update(input({ frame: { image: video, width: 1904, height: 984 }, live: true }));
  await vi.waitFor(() => expect(tick).toHaveBeenCalledOnce());
  expect(failure).not.toHaveBeenCalled();
  expect(fallback).not.toHaveBeenCalled();
  expect(io.create).not.toHaveBeenCalled();
  Object.defineProperty(video, 'readyState', { configurable: true, value: 2 });
  tick.mock.calls[0]![0]();
  await vi.waitFor(() => expect(publish).toHaveBeenCalledOnce());
  expect(closed).toHaveBeenCalledOnce();
});

it('preserves successive keyboard edits while the next GPU frame is pending', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('VideoFrame', class {});
  const held = deferred<ImageBitmap>();
  io.render
    .mockImplementation(async () => bitmap())
    .mockResolvedValueOnce(bitmap())
    .mockReturnValueOnce(held.promise);
  io.create.mockResolvedValue({ render: io.render, dispose: io.dispose, allocatedBytes: 0 });
  const initial = input();
  const changed = vi.fn();
  function Harness() {
    const [camera, setCamera] = React.useState(initial.camera);
    return React.createElement(ZoomPreviewCanvas, {
      ...initial,
      camera,
      onCenter(value: { centerX: number; centerY: number; scale?: number }) {
        changed(value);
        setCamera((current) => ({ ...current, ...value }));
      },
    });
  }
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(React.createElement(Harness)));
    const canvas = host.querySelector('canvas')!;
    await act(async () =>
      canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    );
    await act(async () =>
      canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    );
    expect(changed.mock.calls.map(([value]) => value.centerX)).toEqual([0.51, 0.52]);
  } finally {
    await act(async () => {
      held.resolve(bitmap());
    });
    await act(async () => root.unmount());
    host.remove();
  }
});

it('uses Standard painting without acquiring a GPU inspector renderer', async () => {
  const fallback = vi.fn();
  const publish = vi.fn();
  const onBackend = vi.fn();
  const owner = createZoomPreviewPaintOwner({
    backend: 'legacy',
    fallback,
    publish,
    onBackend,
    onError: vi.fn(),
  });
  owners.push(owner);
  owner.update(input());
  await vi.waitFor(() => expect(onBackend).toHaveBeenCalledWith(false));
  expect(fallback).toHaveBeenCalledOnce();
  expect(publish).not.toHaveBeenCalled();
  expect(io.create).not.toHaveBeenCalled();
});

it('holds a canonical live lease with the frozen source and pose through GPU completion', async () => {
  vi.stubGlobal('VideoDecoder', class {});
  vi.stubGlobal('VideoFrame', class {});
  const acquire = Promise.withResolvers<{
    bindings: Map<
      string,
      {
        source: {
          sourceWidth: number;
          sourceHeight: number;
          toVideoFrame: ReturnType<typeof vi.fn>;
          draw: ReturnType<typeof vi.fn>;
        };
        target: number;
        timestamp: number;
        nextTimestamp: number;
        url: string;
      }
    >;
    release: ReturnType<typeof vi.fn>;
  }>();
  const source = { sourceWidth: 1904, sourceHeight: 984, toVideoFrame: vi.fn(), draw: vi.fn() };
  const release = vi.fn();
  const lease = {
    bindings: new Map([
      [
        'zoom-preview',
        { source, target: 0.5, timestamp: 0.3, nextTimestamp: 0.7, url: 'blob:source' },
      ],
    ]),
    release,
  };
  sources.acquire.mockReturnValueOnce(acquire.promise);
  const fence = Promise.withResolvers<ImageBitmap>();
  const render = vi.fn(() => fence.promise);
  const publish = vi.fn(),
    receipt = vi.fn();
  const owner = createZoomPreviewPaintOwner({
    renderer: { render, dispose: vi.fn() },
    publish,
    fallback: vi.fn(),
    onBackend: vi.fn(),
    onPresented: receipt,
    onError: vi.fn(),
    requestTick: () => 1,
    cancelTick: vi.fn(),
  });
  owners.push(owner);
  const video = document.createElement('video');
  video.currentTime = 99;
  const initial = {
    ...input({ live: true, currentTime: 2, frame: { image: video, width: 1904, height: 984 } }),
    liveSource: { url: 'blob:source', time: 0.5, seekRevision: 0 },
  };
  try {
    owner.update(initial);
    await Promise.resolve();
    expect(sources.acquire).toHaveBeenCalledOnce();
    expect(render).not.toHaveBeenCalled();
    acquire.resolve(lease);
    await vi.waitFor(() => expect(render).toHaveBeenCalledOnce());
    expect(render.mock.calls[0]).toEqual([initial, expect.any(AbortSignal), source]);
    expect(release).not.toHaveBeenCalled();
    const completed = bitmap();
    fence.resolve(completed);
    await vi.waitFor(() => expect(receipt).toHaveBeenCalledOnce());
    expect(receipt.mock.lastCall![0]).toMatchObject({
      currentTime: 2,
      camera: initial.camera,
      sourceSelection: { target: 0.5, timestamp: 0.3, nextTimestamp: 0.7 },
    });
    expect(receipt.mock.lastCall![0]).not.toHaveProperty('source');
    expect(release).toHaveBeenCalledOnce();
  } finally {
    acquire.resolve(lease);
    fence.resolve(bitmap());
    owner.dispose();
  }
});

function canonicalLive() {
  vi.stubGlobal('VideoDecoder', class {});
  const frames: {
    close: ReturnType<typeof vi.fn>;
    copyTo: ReturnType<typeof vi.fn>;
    timestamp: number;
  }[] = [];
  class Frame {
    format = 'RGBA';
    codedWidth = 984;
    codedHeight = 1904;
    displayWidth = 984;
    displayHeight = 1904;
    duration = 400000;
    visibleRect = { x: 0, y: 0, width: 984, height: 1904 };
    colorSpace = { matrix: 'bt709', primaries: 'bt709', transfer: 'bt709', fullRange: false };
    close = vi.fn();
    copyTo = vi.fn();
    constructor(readonly timestamp = 300000) {
      frames.push(this);
    }
  }
  vi.stubGlobal('VideoFrame', Frame);
  const video = document.createElement('video');
  video.currentTime = 99;
  const request = input({
    live: true,
    currentTime: 2,
    frame: { image: video, width: 1904, height: 984 },
    liveSource: { url: 'blob:source', time: 0.5, seekRevision: 0, segmentStart: 0 },
    authoringRevision: 'same-model',
  });
  const release = vi.fn();
  const source: VideoCompositionFrameSource = {
    sourceWidth: 1904,
    sourceHeight: 984,
    orientation: { rotation: 90, flip: true },
    toVideoFrame: vi.fn(() => new Frame() as unknown as VideoFrame),
    draw: vi.fn(),
  };
  const lease: PreviewSourceLease = {
    bindings: new Map([
      [
        'zoom-preview',
        { source, target: 0.5, timestamp: 0.3, nextTimestamp: 0.7, url: 'blob:source' },
      ],
    ]),
    release,
  };
  sources.acquire.mockResolvedValue(lease);
  return { source, lease, release, frames, video, request };
}

function compatibleLive(c: ReturnType<typeof canonicalLive>) {
  sources.acquire.mockResolvedValue(null);
  const lease = {
    bindings: new Map([
      [
        'zoom-preview',
        {
          membership: 'packet-floor' as const,
          source: c.source,
          target: 0.5,
          timestamp: 0.3,
          url: 'blob:source',
        },
      ],
    ]),
    release: c.release,
  };
  compatible.acquire.mockResolvedValue(lease);
  return lease;
}

it('keeps the native GPU clone and artwork alive until a disposed render settles', async () => {
  const c = canonicalLive();
  const fence = Promise.withResolvers<ImageBitmap>();
  io.render.mockReturnValueOnce(fence.promise);
  io.create.mockResolvedValue({ render: io.render, dispose: io.dispose, allocatedBytes: 0 });
  const renderer = createZoomPreviewGpuRenderer();
  owners.push(renderer);
  const rendering = renderer.render(c.request, new AbortController().signal, c.source);
  await vi.waitFor(() => expect(io.render).toHaveBeenCalledOnce());
  const native: GpuPreviewLayer[] = [];
  const visit = (layers: readonly GpuPreviewLayer[]) => {
    for (const layer of layers) {
      if (layer.source === c.frames[0]) native.push(layer);
      if ('kind' in layer.source && layer.source.kind === 'group') visit(layer.source.layers);
    }
  };
  visit(io.render.mock.calls[0]![0].layers);
  expect(native).toHaveLength(1);
  expect(native[0]).toMatchObject({ orientation: { rotation: 90, flip: true } });
  expect(c.frames[0]!.timestamp).toBe(300000);
  expect(c.frames[0]!.copyTo).not.toHaveBeenCalled();
  renderer.dispose();
  expect(io.dispose).not.toHaveBeenCalled();
  expect(c.frames[0]!.close).not.toHaveBeenCalled();
  const completed = bitmap();
  fence.resolve(completed);
  expect(await rendering).toBe(completed);
  expect(c.frames[0]!.close).toHaveBeenCalledOnce();
  expect(io.dispose).toHaveBeenCalledOnce();
  completed.close();
});

it.each(
  (['dispose', 'source', 'seek', 'cut', 'paused'] as const).flatMap((mode) =>
    (['canonical', 'compatible'] as const).map((route) => ({ mode, route }))
  )
)('retires a $route lease after an obsolete $mode GPU job settles', async ({ mode, route }) => {
  const c = canonicalLive();
  if (route === 'compatible') compatibleLive(c);
  const fence = Promise.withResolvers<ImageBitmap>();
  const render = vi.fn().mockReturnValueOnce(fence.promise).mockResolvedValue(bitmap());
  const rendererDispose = vi.fn(),
    publish = vi.fn(),
    receipt = vi.fn();
  const owner = createZoomPreviewPaintOwner({
    renderer: { render, dispose: rendererDispose },
    publish,
    fallback: vi.fn(),
    onBackend: vi.fn(),
    onPresented: receipt,
    onError: vi.fn(),
    requestTick: () => 1,
    cancelTick: vi.fn(),
  });
  owners.push(owner);
  owner.update(c.request);
  await vi.waitFor(() => expect(render).toHaveBeenCalledOnce());
  if (mode === 'dispose') owner.dispose();
  else {
    sources.acquire.mockReturnValue(new Promise(() => {}));
    owner.update(
      mode === 'paused'
        ? input()
        : {
            ...c.request,
            liveSource: {
              ...c.request.liveSource!,
              ...(mode === 'source'
                ? { url: 'blob:new' }
                : mode === 'seek'
                  ? { seekRevision: 1 }
                  : { segmentStart: 5, time: 5.1 }),
            },
          }
    );
  }
  expect(render.mock.calls[0]![1].aborted).toBe(true);
  expect(c.release).not.toHaveBeenCalled();
  expect(rendererDispose).not.toHaveBeenCalled();
  const old = bitmap();
  fence.resolve(old);
  await vi.waitFor(() => expect(c.release).toHaveBeenCalledOnce());
  expect(old.close).toHaveBeenCalledOnce();
  if (mode !== 'paused') expect(publish).not.toHaveBeenCalled();
  if (mode === 'dispose') expect(rendererDispose).toHaveBeenCalledOnce();
});

it('keeps ordinary advances sequential and restarts on explicit seeks or cut segments', async () => {
  const c = canonicalLive();
  const receipt = vi.fn();
  const owner = createZoomPreviewPaintOwner({
    renderer: { render: vi.fn(async () => bitmap()), dispose: vi.fn() },
    publish: vi.fn(),
    fallback: vi.fn(),
    onBackend: vi.fn(),
    onPresented: receipt,
    onError: vi.fn(),
    requestTick: () => 1,
    cancelTick: vi.fn(),
  });
  owners.push(owner);
  for (const [index, source] of [
    c.request.liveSource!,
    { ...c.request.liveSource!, time: 0.6 },
    { ...c.request.liveSource!, time: 5.1, segmentStart: 5 },
    { ...c.request.liveSource!, time: 0.5, seekRevision: 1 },
  ].entries()) {
    sources.acquire.mockResolvedValueOnce({
      ...c.lease,
      bindings: new Map([
        [
          'zoom-preview',
          {
            source: c.source,
            target: source.time,
            timestamp: source.time - 0.1,
            nextTimestamp: source.time + 0.1,
            url: source.url,
          },
        ],
      ]),
    });
    owner.update({ ...c.request, currentTime: index + 2, liveSource: source });
    await vi.waitFor(() => expect(receipt).toHaveBeenCalledTimes(index + 1));
    expect(sources.acquire.mock.calls[index]![2]).toEqual({ discontinuity: index !== 1 });
    expect(receipt.mock.lastCall![0].liveSource.time).toBe(source.time);
    expect(receipt.mock.lastCall![0].currentTime).toBe(index + 2);
  }
});

it('keeps a valid temporal pose while acquiring only the latest pending source request', async () => {
  const c = canonicalLive();
  const fence = Promise.withResolvers<ImageBitmap>();
  const render = vi.fn().mockReturnValueOnce(fence.promise).mockResolvedValue(bitmap());
  const receipt = vi.fn();
  const owner = createZoomPreviewPaintOwner({
    renderer: { render, dispose: vi.fn() },
    publish: vi.fn(),
    fallback: vi.fn(),
    onBackend: vi.fn(),
    onPresented: receipt,
    onError: vi.fn(),
    requestTick: () => 1,
    cancelTick: vi.fn(),
  });
  owners.push(owner);
  owner.update(c.request);
  await vi.waitFor(() => expect(render).toHaveBeenCalledOnce());
  owner.update({
    ...c.request,
    currentTime: 2.1,
    liveSource: { ...c.request.liveSource!, time: 0.6 },
    camera: { ...c.request.camera, centerX: 0.6 },
  });
  owner.update({
    ...c.request,
    currentTime: 2.2,
    liveSource: { ...c.request.liveSource!, time: 0.65 },
    camera: { ...c.request.camera, centerX: 0.7 },
  });
  expect(render.mock.calls[0]![1].aborted).toBe(false);
  expect(sources.acquire).toHaveBeenCalledOnce();
  sources.acquire.mockResolvedValueOnce({
    ...c.lease,
    bindings: new Map([
      [
        'zoom-preview',
        { source: c.source, target: 0.65, timestamp: 0.3, nextTimestamp: 0.7, url: 'blob:source' },
      ],
    ]),
  });
  fence.resolve(bitmap());
  await vi.waitFor(() => expect(receipt).toHaveBeenCalledTimes(2));
  expect(receipt.mock.calls[0]![0]).toMatchObject({
    currentTime: 2,
    camera: c.request.camera,
    sourceSelection: { target: 0.5 },
  });
  expect(receipt.mock.calls[1]![0]).toMatchObject({
    currentTime: 2.2,
    camera: { centerX: 0.7 },
    sourceSelection: { target: 0.65 },
  });
  expect(sources.acquire).toHaveBeenCalledTimes(2);
});

it.each(
  (['fallback', 'legacy', 'draw-failure'] as const).flatMap((mode) =>
    (['canonical', 'compatible'] as const).map((route) => ({ mode, route }))
  )
)('publishes independent RGB and frozen pose after $route $mode', async ({ mode, route }) => {
  const c = canonicalLive();
  if (route === 'compatible') compatibleLive(c);
  const draw = vi.spyOn(VideoSample.prototype, 'draw').mockImplementation(function (
    this: VideoSample,
    context,
    x,
    y,
    width,
    height
  ) {
    expect(this.timestamp).toBe(0.3);
    expect(this.rotation).toBe(90);
    expect(this.flip).toBe(true);
    context.fillRect(x, y, width, height);
  });
  const fence = Promise.withResolvers<void>();
  const fallback = vi.fn(async (accepted: ZoomPreviewGpuInput) => {
    expect(accepted.frame?.image).toBeInstanceOf(HTMLCanvasElement);
    expect(accepted.camera).toBe(c.request.camera);
    expect(accepted.liveSource).toBe(c.request.liveSource);
    await fence.promise;
    if (mode === 'draw-failure') throw new Error('draw failed');
  });
  const receipt = vi.fn(),
    onError = vi.fn();
  const owner = createZoomPreviewPaintOwner({
    ...(mode === 'legacy'
      ? { backend: 'legacy' as const }
      : { renderer: { render: vi.fn(async () => null), dispose: vi.fn() } }),
    publish: vi.fn(),
    fallback,
    onBackend: vi.fn(),
    onPresented: receipt,
    onError,
    requestTick: () => 1,
    cancelTick: vi.fn(),
  });
  owners.push(owner);
  owner.update(c.request);
  await vi.waitFor(() => expect(fallback).toHaveBeenCalledOnce());
  expect(c.release).not.toHaveBeenCalled();
  expect(c.frames[0]!.close).not.toHaveBeenCalled();
  fence.resolve();
  await vi.waitFor(() => expect(c.release).toHaveBeenCalledOnce());
  expect(c.frames[0]!.close).toHaveBeenCalledOnce();
  expect(draw).toHaveBeenCalledOnce();
  if (mode === 'draw-failure') {
    expect(receipt).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledOnce();
  } else {
    const accepted = receipt.mock.lastCall![0];
    expect(accepted.frame).toMatchObject({
      width: 1904,
      height: 984,
      selection: {
        target: 0.5,
        timestamp: 0.3,
        ...(route === 'canonical' ? { nextTimestamp: 0.7 } : { membership: 'packet-floor' }),
      },
    });
    expect(accepted).not.toHaveProperty('source');
    owner.dispose();
    expect(accepted.frame.image.width).toBe(1904);
    expect(accepted.frame.image.height).toBe(984);
  }
});

it.each(['unsupported', 'decode-error', 'missing-binding', 'missing-accessor'] as const)(
  'admits HTML compatibility only for actual unsupported selection: %s',
  async (mode) => {
    const c = canonicalLive();
    if (mode === 'unsupported') {
      Object.defineProperty(c.video, 'readyState', { value: 2 });
      c.video.currentTime = 0.5;
      compatibleLive(c);
    } else if (mode === 'decode-error')
      sources.acquire.mockRejectedValueOnce(new Error('decode failed'));
    else
      sources.acquire.mockResolvedValueOnce({
        bindings:
          mode === 'missing-binding'
            ? new Map()
            : new Map([
                [
                  'zoom-preview',
                  {
                    source: { sourceWidth: 1904, sourceHeight: 984, draw: vi.fn() },
                    target: 0.5,
                    timestamp: 0.3,
                    nextTimestamp: 0.7,
                    url: 'blob:source',
                  },
                ],
              ]),
        release: c.release,
      });
    const render = vi.fn(async () => bitmap()),
      onError = vi.fn(),
      receipt = vi.fn();
    const owner = createZoomPreviewPaintOwner({
      renderer: { render, dispose: vi.fn() },
      publish: vi.fn(),
      fallback: vi.fn(),
      onBackend: vi.fn(),
      onPresented: receipt,
      onError,
      requestTick: () => 1,
      cancelTick: vi.fn(),
    });
    owners.push(owner);
    owner.update(c.request);
    await vi.waitFor(() =>
      expect(mode === 'unsupported' ? receipt : onError).toHaveBeenCalledOnce()
    );
    if (mode === 'unsupported') {
      expect(render.mock.calls[0]![2]).toBe(c.source);
      expect(receipt.mock.lastCall![0].sourceSelection).toMatchObject({
        membership: 'packet-floor',
        target: 0.5,
        timestamp: 0.3,
      });
      expect(receipt.mock.lastCall![0].sourceSelection).not.toHaveProperty('nextTimestamp');
    } else {
      expect(render).not.toHaveBeenCalled();
      expect(receipt).not.toHaveBeenCalled();
      expect(compatible.acquire).not.toHaveBeenCalled();
    }
  }
);

it('rejects admitted dimensions that disagree with the frozen source geometry', async () => {
  const c = canonicalLive();
  sources.acquire.mockResolvedValueOnce({
    bindings: new Map([
      [
        'zoom-preview',
        {
          source: { ...c.source, sourceWidth: 984, sourceHeight: 1904 },
          target: 0.5,
          timestamp: 0.3,
          nextTimestamp: 0.7,
          url: 'blob:source',
        },
      ],
    ]),
    release: c.release,
  });
  const render = vi.fn(async () => bitmap()),
    fallback = vi.fn(),
    onError = vi.fn(),
    publish = vi.fn();
  const owner = createZoomPreviewPaintOwner({
    renderer: { render, dispose: vi.fn() },
    fallback,
    onError,
    publish,
    onBackend: vi.fn(),
    requestTick: () => 1,
    cancelTick: vi.fn(),
  });
  owners.push(owner);
  owner.update(c.request);
  await vi.waitFor(() => expect(c.release).toHaveBeenCalledOnce());
  expect(render).not.toHaveBeenCalled();
  expect(fallback).not.toHaveBeenCalled();
  expect(publish).not.toHaveBeenCalled();
  expect(onError).toHaveBeenCalledWith(
    expect.objectContaining({
      message: 'Inspector source dimensions do not match the prepared scene.',
    })
  );
});

it('releases a canonical acquisition arriving after job disposal without starting GPU work', async () => {
  const c = canonicalLive();
  const gate = Promise.withResolvers<PreviewSourceLease>();
  sources.acquire.mockReturnValueOnce(gate.promise);
  const render = vi.fn(),
    onError = vi.fn(),
    publish = vi.fn();
  const owner = createZoomPreviewPaintOwner({
    renderer: { render, dispose: vi.fn() },
    publish,
    fallback: vi.fn(),
    onBackend: vi.fn(),
    onError,
    requestTick: () => 1,
    cancelTick: vi.fn(),
  });
  owners.push(owner);
  owner.update(c.request);
  expect(sources.acquire).toHaveBeenCalledOnce();
  owner.dispose();
  expect(c.release).not.toHaveBeenCalled();
  gate.resolve(c.lease);
  await vi.waitFor(() => expect(c.release).toHaveBeenCalledOnce());
  expect(render).not.toHaveBeenCalled();
  expect(publish).not.toHaveBeenCalled();
  expect(onError).not.toHaveBeenCalled();
});

it('normalizes the admitted image after a typed GPU device failure', async () => {
  const c = canonicalLive();
  io.create.mockResolvedValue({ render: io.render, dispose: io.dispose, allocatedBytes: 0 });
  io.render.mockRejectedValueOnce(new GpuPreviewDeviceError('lost'));
  vi.spyOn(VideoSample.prototype, 'draw').mockImplementation((context, x, y, width, height) =>
    context.fillRect(x, y, width, height)
  );
  const receipt = vi.fn(),
    fallback = vi.fn(),
    onError = vi.fn();
  const owner = createZoomPreviewPaintOwner({
    publish: vi.fn(),
    fallback,
    onPresented: receipt,
    onBackend: vi.fn(),
    onError,
    requestTick: () => 1,
    cancelTick: vi.fn(),
  });
  owners.push(owner);
  owner.update(c.request);
  await vi.waitFor(() => expect(receipt).toHaveBeenCalledOnce());
  expect(fallback.mock.lastCall![0].frame.image).toBeInstanceOf(HTMLCanvasElement);
  expect(receipt.mock.lastCall![0]).toMatchObject({
    currentTime: 2,
    sourceSelection: { target: 0.5, timestamp: 0.3, nextTimestamp: 0.7 },
  });
  expect(c.frames).toHaveLength(2);
  expect(c.frames.every((frame) => frame.close.mock.calls.length === 1)).toBe(true);
  expect(c.release).toHaveBeenCalledOnce();
  expect(onError).not.toHaveBeenCalled();
});

it('admits fallback readiness by source generation instead of the HTML image object', async () => {
  const c = canonicalLive();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn(() => 1)
  );
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.spyOn(VideoSample.prototype, 'draw').mockImplementation((context, x, y, width, height) =>
    context.fillRect(x, y, width, height)
  );
  const host = document.createElement('div'),
    root = createRoot(host);
  const ready = vi.fn(),
    receipt = vi.fn();
  const show = (request: ZoomPreviewGpuInput) =>
    act(async () =>
      root.render(
        React.createElement(
          ReviewPreviewRendererContext.Provider,
          { value: 'legacy' },
          React.createElement(ZoomPreviewCanvas, {
            ...request,
            disabled: true,
            onCenter: vi.fn(),
            onPaintReady: ready,
            onPresented: receipt,
          })
        )
      )
    );
  try {
    await show(c.request);
    expect(ready).toHaveBeenLastCalledWith(true);
    expect(receipt.mock.lastCall![0].frame.image).not.toBe(c.video);
    const held = Promise.withResolvers<PreviewSourceLease>();
    sources.acquire.mockReturnValueOnce(held.promise);
    const next = { ...c.request, liveSource: { ...c.request.liveSource!, seekRevision: 1 } };
    await show(next);
    expect(ready).toHaveBeenLastCalledWith(false);
    await act(async () => held.resolve(c.lease));
    expect(ready).toHaveBeenLastCalledWith(true);
    expect(receipt.mock.lastCall![0].liveSource.seekRevision).toBe(1);
  } finally {
    await act(async () => root.unmount());
  }
});

it('returns the existing Canvas fallback for live HTML when VideoFrame is absent', async () => {
  vi.stubGlobal('VideoFrame', undefined);
  const video = document.createElement('video');
  Object.defineProperty(video, 'readyState', { value: 2 });
  io.create.mockResolvedValue({ render: io.render, dispose: io.dispose, allocatedBytes: 0 });
  const renderer = createZoomPreviewGpuRenderer();
  owners.push(renderer);
  await expect(
    renderer.render(
      input({ frame: { image: video, width: 1904, height: 984 }, live: true }),
      new AbortController().signal
    )
  ).resolves.toBeNull();
  expect(io.render).not.toHaveBeenCalled();
});

it('falls back for paused RGB when the native frame API is absent', async () => {
  vi.stubGlobal('VideoFrame', undefined);
  const completed = bitmap();
  io.render.mockResolvedValue(completed);
  io.create.mockResolvedValue({ render: io.render, dispose: io.dispose, allocatedBytes: 0 });
  const renderer = createZoomPreviewGpuRenderer();
  owners.push(renderer);
  await expect(renderer.render(input(), new AbortController().signal)).resolves.toBeNull();
  expect(io.create).not.toHaveBeenCalled();
  expect(io.render).not.toHaveBeenCalled();
  completed.close();
});

it.each(['declined', 'decoder-absent'] as const)(
  'uses verified live focus pixels and packet-floor provenance when %s',
  async (mode) => {
    const c = canonicalLive();
    sources.acquire.mockResolvedValue(null);
    if (mode === 'decoder-absent') vi.stubGlobal('VideoDecoder', undefined);
    compatible.acquire.mockResolvedValue({
      bindings: new Map([
        [
          'zoom-preview',
          {
            membership: 'packet-floor',
            source: c.source,
            target: 0.5,
            timestamp: 0.3,
            url: 'blob:source',
          },
        ],
      ]),
      release: c.release,
    });
    const render = vi.fn(
        async (
          _input: ZoomPreviewGpuInput,
          _signal: AbortSignal,
          _source?: VideoCompositionFrameSource
        ) => bitmap()
      ),
      receipt = vi.fn();
    const owner = createZoomPreviewPaintOwner({
      renderer: { render, dispose: vi.fn() },
      publish: vi.fn(),
      fallback: vi.fn(),
      onBackend: vi.fn(),
      onPresented: receipt,
      onError: vi.fn(),
      requestTick: () => 1,
      cancelTick: vi.fn(),
    });
    owners.push(owner);
    owner.update(c.request);
    await vi.waitFor(() => expect(compatible.acquire).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(receipt).toHaveBeenCalledOnce());
    expect(render.mock.calls[0]![2]).toBe(c.source);
    expect(receipt.mock.lastCall![0].sourceSelection).toEqual({
      membership: 'packet-floor',
      url: 'blob:source',
      target: 0.5,
      timestamp: 0.3,
    });
    expect(receipt.mock.lastCall![0].sourceSelection).not.toHaveProperty('nextTimestamp');
    expect(c.video.currentTime).toBe(99);
    expect(c.release).toHaveBeenCalledOnce();
  }
);
