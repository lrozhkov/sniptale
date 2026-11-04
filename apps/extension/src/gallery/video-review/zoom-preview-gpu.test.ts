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
beforeEach(() => {
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
