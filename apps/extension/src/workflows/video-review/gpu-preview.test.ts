import { afterEach, expect, it, vi } from 'vitest';
import { createReviewGpuPreview, reviewGpuPreviewConcurrency } from './gpu-preview';
import {
  reviewPresentedGeometry,
  reviewPresentedStageProjection,
  reviewGpuPreviewAllocation,
} from './gpu-preview-geometry';
import {
  GpuPreviewDeviceError,
  type GpuPreviewLayer,
} from '../../features/video/composition/canvas/gpu-preview';
import { projectQuickEditPoint } from '../../features/video/composition/motion/spatial-geometry';
import type { RenderResources } from '../../features/video/composition/canvas/render-resources';
import type { PreviewScene } from './preview-scene';
import * as gpuLayers from './gpu-preview-layers';
import {
  computeQuickEditSpatialRasterLayout,
  computeQuickEditWindowTransform,
} from '../../features/video/review/advanced/scene';
import { DEFAULT_WINDOW_HEADER } from '@sniptale/runtime-contracts/window-header';
import { planReviewPresentationSequence } from '../../features/video/review/presentation-sequence';
import { createNeutralPresentationSettings } from '../../features/video/review/advanced/presentation';
import { createQuickEditWatermark } from '../../features/video/project/scene/watermark';
import { createQuickEditZoomRegion } from '../../features/video/review/advanced/zoom';
import { updateQuickEditBackground } from '../../features/video/review/advanced/background';
import { createQuickEditWebcam } from '../../features/video/review/advanced/webcam';

const io = vi.hoisted(() => ({
  create: vi.fn(),
  render: vi.fn(),
  dispose: vi.fn(),
  createPainter: vi.fn(),
}));
vi.mock('../../features/video/composition/canvas/gpu-preview', async (original) => ({
  ...(await original<typeof import('../../features/video/composition/canvas/gpu-preview')>()),
  createGpuPreviewRenderer: io.create,
}));
vi.mock('./scene-background', async (original) => ({
  ...(await original<typeof import('./scene-background')>()),
  createReviewBackgroundPainter: io.createPainter,
}));
afterEach(() => vi.clearAllMocks());
const scene: PreviewScene = {
  source: { width: 640, height: 360 },
  background: { enabled: false },
  zoomRegions: [],
  comments: [],
  keys: [],
  clicks: [],
};
const dimensions = { canonical: { width: 640, height: 360 }, backing: { width: 320, height: 180 } };

function fixture(maximumInFlight: 1 | 2 = 1) {
  const released = vi.fn();
  const ctx = () => ({
    translate: vi.fn(),
    clearRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    scale: vi.fn(),
    drawImage: vi.fn(),
  });
  const allocate = vi.fn((_role: string, size: { width: number; height: number }) => ({
    canvas: { ...size },
    context: ctx(),
    release: released,
  }));
  const resources = {
    canvas: allocate,
    bytes: vi.fn(() => ({ release: vi.fn() })),
  } as unknown as RenderResources;
  const bitmap = { close: vi.fn() };
  const painter = {
    draw: vi.fn(
      (_context: CanvasRenderingContext2D, _paint: { currentTime?: number | undefined }) => {}
    ),
    dispose: vi.fn(),
    retainedCacheSize: null,
  };
  const painters: (typeof painter)[] = [];
  io.createPainter.mockImplementation(() => {
    const owned = { ...painter, draw: vi.fn(painter.draw), dispose: vi.fn() };
    painters.push(owned);
    return owned;
  });
  io.render.mockResolvedValue(bitmap);
  io.create.mockResolvedValue({ render: io.render, dispose: io.dispose, allocatedBytes: 0 });
  const owner = createReviewGpuPreview({
    resources,
    reserve: resources.bytes.bind(null, 'gpu'),
    maximumInFlight,
  });
  const frame = { close: vi.fn(), copyTo: vi.fn() } as unknown as VideoFrame;
  const context = ctx();
  const input = {
    scene,
    dimensions,
    geometry: reviewPresentedGeometry(scene, dimensions, 2),
    frame,
    sourceTime: 2,
    context: context as unknown as CanvasRenderingContext2D,
    header: null,
    image: null,
    painter,
    captions: null,
    signal: new AbortController().signal,
  };
  return { owner, input, bitmap, frame, context, allocate, released, resources, painters };
}

it.each(['scene', 'dispose', 'device'] as const)(
  'retains shared artwork until both requests retire after %s',
  async (reason) => {
    const f = fixture(2);
    const first = Promise.withResolvers<typeof f.bitmap>();
    const second = Promise.withResolvers<typeof f.bitmap>();
    const entered = Promise.withResolvers<void>();
    io.render
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => {
        entered.resolve();
        return second.promise;
      });
    const a = f.owner.render(f.input);
    const b = f.owner.render({
      ...f.input,
      context: { drawImage: vi.fn() } as unknown as CanvasRenderingContext2D,
    });
    await entered.promise;
    expect(io.create).toHaveBeenCalledWith(expect.objectContaining({ maximumInFlight: 2 }));
    if (reason === 'scene') f.owner.releaseScene();
    if (reason === 'dispose') f.owner.dispose();
    const aProof =
      reason === 'device'
        ? expect(a).resolves.toBe(false)
        : expect(a).rejects.toMatchObject({ name: 'AbortError' });
    if (reason === 'device') first.reject(new GpuPreviewDeviceError('Device lost'));
    else first.resolve(f.bitmap);
    await aProof;
    expect(f.released).not.toHaveBeenCalled();
    for (const painter of f.painters) expect(painter.dispose).not.toHaveBeenCalled();
    const bProof =
      reason === 'device'
        ? expect(b).resolves.toBe(false)
        : expect(b).rejects.toMatchObject({ name: 'AbortError' });
    second.resolve(f.bitmap);
    await bProof;
    expect(f.released).toHaveBeenCalledTimes(6);
    for (const painter of f.painters) expect(painter.dispose).toHaveBeenCalledTimes(1);
    expect(f.context.drawImage).not.toHaveBeenCalled();
    f.owner.dispose();
  }
);

it('admits authored camera, watermark and edge fades while excluding independent producers and joins', () => {
  const planned = planReviewPresentationSequence({
    settings: createNeutralPresentationSettings(),
    mainDuration: 4,
    fragmentOffset: 0,
    includeBookends: true,
    rate: { numerator: 30, denominator: 1 },
  });
  if (!planned.ok) throw new Error('Expected identity plan');
  const outerFadePlan = planned.plan;
  expect(reviewGpuPreviewConcurrency({ ...scene, outerFadePlan })).toBe(2);
  expect(
    reviewGpuPreviewConcurrency({
      ...scene,
      outerFadePlan: {
        ...outerFadePlan,
        visualEnvelope: { ...outerFadePlan.visualEnvelope, fadeIn: 0.2 },
      },
    })
  ).toBe(2);
  expect(
    reviewGpuPreviewConcurrency({
      ...scene,
      outerFadePlan: {
        ...outerFadePlan,
        segments: outerFadePlan.segments.map((segment) => ({
          ...segment,
          name: 'intro',
          content: { kind: 'image', assetId: 'asset' },
        })),
      },
    })
  ).toBe(1);
  expect(
    reviewGpuPreviewConcurrency({
      ...scene,
      outerFadePlan: {
        ...outerFadePlan,
        joins: [
          {
            type: 'dissolve',
            color: '#000000ff',
            seamUs: 1000000,
            beforeUs: 100000,
            afterUs: 100000,
            outgoingTick: 29,
            incomingTick: 30,
          },
        ],
      },
    })
  ).toBe(1);
  expect(
    reviewGpuPreviewConcurrency({
      ...scene,
      zoomRegions: [createQuickEditZoomRegion({ id: 'zoom', at: 0, duration: 4 })],
    })
  ).toBe(2);
  const watermark = createQuickEditWatermark('text');
  expect(reviewGpuPreviewConcurrency({ ...scene, watermark: { ...watermark, mode: 'none' } })).toBe(
    2
  );
  expect(reviewGpuPreviewConcurrency({ ...scene, watermark: { ...watermark, mode: 'text' } })).toBe(
    2
  );
  const captions = {
    document: undefined,
    segments: [],
    settings: {
      enabled: true,
      style: {
        position: 'bottom' as const,
        fontSize: 0.04,
        color: '#ffffffff',
        background: '#000000ff',
      },
    },
  };
  expect(reviewGpuPreviewConcurrency({ ...scene, captions })).toBe(1);
  expect(
    reviewGpuPreviewConcurrency({
      ...scene,
      captions: { ...captions, settings: { ...captions.settings, enabled: false } },
    })
  ).toBe(2);
  const annotationEffects: NonNullable<PreviewScene['annotationEffects']> = {
    lane: {
      enabled: true,
      instances: [
        {
          id: 'effect',
          snapshotId: 'snapshot',
          enabled: true,
          start: 0,
          end: 4,
          attachment: 'viewport',
          transform: { x: 0.1, y: 0.1, width: 0.2, height: 0.2, rotation: 0 },
          controls: {},
          order: 0,
        },
      ],
    },
    snapshots: [],
    segments: [],
  };
  expect(reviewGpuPreviewConcurrency({ ...scene, annotationEffects })).toBe(1);
  expect(
    reviewGpuPreviewConcurrency({
      ...scene,
      annotationEffects: {
        ...annotationEffects,
        lane: { ...annotationEffects.lane, enabled: false },
      },
    })
  ).toBe(2);
  const webcam = createQuickEditWebcam('camera', scene.source, scene.source);
  expect(reviewGpuPreviewConcurrency({ ...scene, webcam })).toBe(1);
  expect(reviewGpuPreviewConcurrency({ ...scene, webcam: { ...webcam, enabled: false } })).toBe(2);
});

it.each([1, 2] as const)(
  'enforces capacity %s and keeps each completed bitmap with its own output',
  async (maximumInFlight) => {
    const f = fixture(maximumInFlight),
      first = Promise.withResolvers<typeof f.bitmap>(),
      entered = Promise.withResolvers<void>();
    io.render.mockImplementationOnce(() => {
      entered.resolve();
      return first.promise;
    });
    const a = f.owner.render(f.input);
    await entered.promise;
    const secondContext = { drawImage: vi.fn() };
    let b: Promise<boolean> | undefined;
    if (maximumInFlight === 2)
      b = f.owner.render({
        ...f.input,
        context: secondContext as unknown as CanvasRenderingContext2D,
      });
    const refused = f.owner.render(f.input);
    await expect(refused).rejects.toThrow('overlap');
    first.resolve(f.bitmap);
    expect(await a).toBe(true);
    if (b) {
      expect(await b).toBe(true);
      expect(secondContext.drawImage).toHaveBeenCalledWith(f.bitmap, 0, 0);
    }
    f.owner.dispose();
    expect(f.released).toHaveBeenCalledTimes(maximumInFlight * 3);
  }
);

it('binds immutable scene inputs and keeps unsafe requests out of live artwork', async () => {
  expect(reviewGpuPreviewConcurrency(scene)).toBe(2);
  expect(
    reviewGpuPreviewConcurrency({
      ...scene,
      background: updateQuickEditBackground(scene.background, { enabled: true }),
    })
  ).toBe(2);
  expect(reviewGpuPreviewConcurrency({ ...scene, windowHeader: DEFAULT_WINDOW_HEADER })).toBe(2);
  const f = fixture(2),
    completion = Promise.withResolvers<typeof f.bitmap>(),
    entered = Promise.withResolvers<void>();
  io.render.mockImplementationOnce(() => {
    entered.resolve();
    return completion.promise;
  });
  const pending = f.owner.render(f.input);
  await entered.promise;
  await expect(f.owner.render({ ...f.input, scene: { ...scene } })).rejects.toThrow('overlap');
  await expect(f.owner.render({ ...f.input, dimensions: { ...dimensions } })).rejects.toThrow(
    'overlap'
  );
  await expect(
    f.owner.render({ ...f.input, cameraOverride: { scale: 1, centerX: 0.5, centerY: 0.5 } })
  ).rejects.toThrow('overlap');
  for (const field of ['header', 'image'] as const) {
    await expect(
      f.owner.render({ ...f.input, [field]: { width: 20, height: 10 } as ImageBitmap })
    ).rejects.toThrow('overlap');
  }
  expect(f.allocate).toHaveBeenCalledTimes(3);
  completion.resolve(f.bitmap);
  await pending;
  f.owner.dispose();
});

it('keeps pending authored drift and zoom frames in distinct artwork destinations', async () => {
  const f = fixture(2);
  const background = updateQuickEditBackground(scene.background, {
    enabled: true,
    type: 'image',
    assetId: 'background',
    motion: { mode: 'drift', speed: 100, intensity: 100 },
  });
  const authored = {
    ...scene,
    background,
    zoomRegions: [createQuickEditZoomRegion({ id: 'zoom', at: 0, duration: 4 })],
  };
  const image = { width: 320, height: 180 } as ImageBitmap;
  const header = { width: 640, height: 40 } as ImageBitmap;
  const watermark = {
    bounds: { x: 0, y: 0, width: 10, height: 10 },
    draw: vi.fn(),
    dispose: vi.fn(),
  };
  const input = {
    ...f.input,
    scene: authored,
    image,
    header,
    watermark,
    geometry: reviewPresentedGeometry(authored, dimensions, 1),
  };
  const first = Promise.withResolvers<typeof f.bitmap>();
  const second = Promise.withResolvers<typeof f.bitmap>();
  const entered = Promise.withResolvers<void>();
  io.render
    .mockImplementationOnce(() => first.promise)
    .mockImplementationOnce(() => {
      entered.resolve();
      return second.promise;
    });
  const a = f.owner.render(input);
  await expect(f.owner.render({ ...input, watermark: { ...watermark } })).rejects.toThrow(
    'overlap'
  );
  await expect(f.owner.render({ ...input, image: { ...image } })).rejects.toThrow('overlap');
  const b = f.owner.render({
    ...input,
    geometry: reviewPresentedGeometry(authored, dimensions, 2),
    sourceTime: 3,
  });
  await entered.promise;
  const destinations = f.input.painter.draw.mock.calls.map(([context]) => context);
  expect(destinations).toHaveLength(2);
  expect(destinations[0]).not.toBe(destinations[1]);
  await expect(f.owner.render(input)).rejects.toThrow('overlap');
  first.resolve(f.bitmap);
  await a;
  expect(f.painters.every((painter) => painter.dispose.mock.calls.length === 0)).toBe(true);
  second.resolve(f.bitmap);
  await b;
  await f.owner.render(input);
  expect(
    f.allocate.mock.calls.filter(([role]) =>
      ['preview-gpu-background', 'preview-gpu-decoration', 'preview-gpu-captions'].includes(role)
    )
  ).toHaveLength(6);
  expect(f.painters).toHaveLength(2);
  f.owner.dispose();
  for (const painter of f.painters) expect(painter.dispose).toHaveBeenCalledTimes(1);
  expect(f.input.painter.dispose).not.toHaveBeenCalled();
});

it('borrows the unmodified frame through GPU completion and closes only the completed bitmap', async () => {
  const f = fixture();
  expect(await f.owner.render(f.input)).toBe(true);
  const sources: unknown[] = [];
  const visit = (layers: readonly { source: unknown }[]) => {
    for (const layer of layers) {
      sources.push(layer.source);
      if (
        typeof layer.source === 'object' &&
        layer.source !== null &&
        'layers' in layer.source &&
        Array.isArray(layer.source.layers)
      )
        visit(layer.source.layers);
    }
  };
  visit(io.render.mock.calls[0]![0].layers);
  expect(sources).toContain(f.frame);
  expect(f.frame.copyTo).not.toHaveBeenCalled();
  expect(f.frame.close).not.toHaveBeenCalled();
  expect(f.context.drawImage).toHaveBeenCalledWith(f.bitmap, 0, 0);
  expect(f.bitmap.close).toHaveBeenCalledOnce();
  expect(f.allocate).toHaveBeenCalledTimes(3);
  await f.owner.render({ ...f.input, geometry: reviewPresentedGeometry(scene, dimensions, 3) });
  expect(f.allocate).toHaveBeenCalledTimes(3);
  expect(f.input.painter.draw).toHaveBeenCalledOnce();
  f.owner.dispose();
  expect(f.released).toHaveBeenCalledTimes(3);
});

it('retains the Canvas path when no adapter is available without allocating GPU artwork', async () => {
  const f = fixture();
  io.create.mockResolvedValue(null);
  expect(await f.owner.render(f.input)).toBe(false);
  expect(f.allocate).not.toHaveBeenCalled();
  expect(f.frame.close).not.toHaveBeenCalled();
  f.owner.releaseScene();
  expect(await f.owner.render(f.input)).toBe(false);
  expect(io.create).toHaveBeenCalledOnce();
  f.owner.dispose();
});

it('refreshes pooled scene artwork without reusing a previous texture revision', async () => {
  const f = fixture();
  await f.owner.render(f.input);
  const firstLayers = io.render.mock.calls[0]![0].layers as GpuPreviewLayer[];
  const revisions = (layers: GpuPreviewLayer[]): (object | string | number)[] =>
    layers.flatMap((layer) => [
      ...(layer.cache ? [layer.cache.revision] : []),
      ...('layers' in layer.source ? revisions([...layer.source.layers]) : []),
    ]);
  const previousRevisions = revisions(firstLayers).filter((value) => typeof value === 'number');
  const pooled = f.allocate.mock.results.map((result) => result.value);
  let next = 0;
  f.allocate.mockImplementation(() => pooled[next++ % pooled.length]!);
  f.owner.releaseScene();
  expect(f.released).toHaveBeenCalledTimes(3);
  expect(io.dispose).not.toHaveBeenCalled();
  const image = { width: 320, height: 180 } as ImageBitmap;
  await f.owner.render({ ...f.input, image });
  expect(io.create).toHaveBeenCalledOnce();
  expect(f.input.painter.draw).toHaveBeenCalledTimes(2);
  expect(f.input.painter.draw.mock.calls[1]![1]).toEqual(expect.objectContaining({ image }));
  const nextRevisions = revisions(io.render.mock.calls[1]![0].layers).filter(
    (value) => typeof value === 'number'
  );
  expect(previousRevisions).toHaveLength(2);
  expect(nextRevisions).toHaveLength(2);
  expect(nextRevisions.every((value) => !previousRevisions.includes(value))).toBe(true);
  f.owner.dispose();
  expect(f.released).toHaveBeenCalledTimes(6);
});

it('retains released scene artwork until the active GPU render settles', async () => {
  const f = fixture();
  const completion = Promise.withResolvers<typeof f.bitmap>();
  const entered = Promise.withResolvers<void>();
  io.render.mockImplementationOnce(() => {
    entered.resolve();
    return completion.promise;
  });
  const controller = new AbortController();
  const pending = f.owner.render({ ...f.input, signal: controller.signal });
  await entered.promise;
  f.owner.releaseScene();
  expect(f.released).not.toHaveBeenCalled();
  expect(io.dispose).not.toHaveBeenCalled();
  completion.resolve(f.bitmap);
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  expect(f.released).toHaveBeenCalledTimes(3);
  expect(f.context.drawImage).not.toHaveBeenCalled();
  expect(f.bitmap.close).toHaveBeenCalledOnce();
  expect(await f.owner.render(f.input)).toBe(true);
  expect(io.create).toHaveBeenCalledOnce();
  f.owner.dispose();
});

it('reuses initialization after the requesting scene is cancelled', async () => {
  const f = fixture();
  const renderer = { render: io.render, dispose: io.dispose, allocatedBytes: 0 };
  const initialization = Promise.withResolvers<typeof renderer>();
  io.create.mockReturnValueOnce(initialization.promise);
  const controller = new AbortController();
  const pending = f.owner.render({ ...f.input, signal: controller.signal });
  expect(io.create).toHaveBeenCalledOnce();
  controller.abort();
  f.owner.releaseScene();
  initialization.resolve(renderer);
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  expect(io.dispose).not.toHaveBeenCalled();
  expect(f.context.drawImage).not.toHaveBeenCalled();
  expect(await f.owner.render(f.input)).toBe(true);
  expect(io.create).toHaveBeenCalledOnce();
  f.owner.dispose();
});

it('does not publish a late GPU result after an abort and releases its bitmap', async () => {
  const f = fixture();
  let finish!: (value: typeof f.bitmap) => void;
  io.render.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    })
  );
  const controller = new AbortController();
  const pending = f.owner.render({ ...f.input, signal: controller.signal });
  await Promise.resolve();
  await Promise.resolve();
  controller.abort();
  finish(f.bitmap);
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  expect(f.context.drawImage).not.toHaveBeenCalled();
  expect(f.bitmap.close).toHaveBeenCalledOnce();
  expect(f.frame.close).not.toHaveBeenCalled();
  f.owner.dispose();
});

it('falls back after GPU failure and releases artwork while preserving the borrowed source', async () => {
  const f = fixture();
  io.render.mockRejectedValue(new GpuPreviewDeviceError('Device lost'));
  expect(await f.owner.render(f.input)).toBe(false);
  expect(f.released).toHaveBeenCalledTimes(3);
  expect(f.frame.close).not.toHaveBeenCalled();
  f.owner.releaseScene();
  expect(await f.owner.render(f.input)).toBe(false);
  expect(io.render).toHaveBeenCalledOnce();
  f.owner.dispose();
});

it('uses the same canonical inverse for rendering and pointer round trips at zoom and 3D', () => {
  const geometry = reviewPresentedGeometry(scene, dimensions, 2, {
    scale: 1.4,
    centerX: 0.6,
    centerY: 0.4,
    spatial: {
      rotation: [0, Math.sin(0.15), 0, Math.cos(0.15)],
      perspective: 0.7,
      windowMotion: 1,
      lockBackground: true,
      focus: [],
    },
  });
  const point = { x: 210, y: 120 };
  const output = projectQuickEditPoint(geometry.projection, point)!;
  const restored = projectQuickEditPoint(geometry.inverse, output)!;
  expect(restored.x).toBeCloseTo(point.x, 9);
  expect(restored.y).toBeCloseTo(point.y, 9);
  expect(geometry.logical).toEqual(dimensions.canonical);
  const zoomed = geometry.layout.videoTransform;
  const base = geometry.layout.videoRect;
  const stagePoint = {
    x: (zoomed.x + ((point.x - base.x) * zoomed.width) / base.width) / 2,
    y: (zoomed.y + ((point.y - base.y) * zoomed.height) / base.height) / 2,
  };
  const stageOutput = projectQuickEditPoint(
    reviewPresentedStageProjection(geometry, dimensions.backing),
    stagePoint
  )!;
  expect(stageOutput.x).toBeCloseTo(output.x / 2, 9);
  expect(stageOutput.y).toBeCloseTo(output.y / 2, 9);
  const allocation = reviewGpuPreviewAllocation(scene, dimensions);
  expect(allocation.maximumManagedBytes).toBeGreaterThan(640 * 360 * 4 * 2);
  expect(allocation.maximumCanvases).toBeGreaterThanOrEqual(3);
});

it('propagates scene or resource planning failures without silently switching backends', async () => {
  const f = fixture();
  io.render.mockRejectedValueOnce(new Error('Invalid layer contract'));
  await expect(f.owner.render(f.input)).rejects.toThrow('Invalid layer contract');
  expect(f.frame.close).not.toHaveBeenCalled();
  expect(await f.owner.render(f.input)).toBe(true);
  f.owner.dispose();
});

it('surfaces initialization validation failures but falls back on typed device failures', async () => {
  const f = fixture();
  io.create.mockRejectedValueOnce(new Error('Shader validation failed'));
  await expect(f.owner.render(f.input)).rejects.toThrow('Shader validation failed');
  f.owner.dispose();
  const next = fixture();
  io.create.mockRejectedValueOnce(new GpuPreviewDeviceError('Adapter unavailable'));
  expect(await next.owner.render(next.input)).toBe(false);
  expect(next.allocate).not.toHaveBeenCalled();
  next.owner.dispose();
});

it('weights complete source-over windows when accumulating camera exposure', async () => {
  const f = fixture();
  const { createQuickEditZoomRegion } = await import('../../features/video/review/advanced/zoom');
  const region = createQuickEditZoomRegion({ id: 'blur', at: 0, duration: 4 });
  region.transform.scale = 2;
  region.enter.duration = 2;
  region.motionBlur = { enter: { enabled: true, strength: 1 } };
  const moving = { ...scene, zoomRegions: [region] };
  await f.owner.render({
    ...f.input,
    scene: moving,
    geometry: reviewPresentedGeometry(moving, dimensions, 1),
  });
  const weighted: { source: unknown; opacity?: number; blend?: string }[] = [];
  const visit = (layers: readonly { source: unknown; opacity?: number; blend?: string }[]) => {
    for (const layer of layers) {
      if (layer.blend === 'add') weighted.push(layer);
      if (
        typeof layer.source === 'object' &&
        layer.source !== null &&
        'layers' in layer.source &&
        Array.isArray(layer.source.layers)
      )
        visit(layer.source.layers);
    }
  };
  visit(io.render.mock.calls[0]![0].layers);
  expect(weighted.length).toBeGreaterThan(1);
  expect(
    weighted.every(
      (layer) =>
        typeof layer.source === 'object' &&
        layer.source !== null &&
        'kind' in layer.source &&
        layer.source.kind === 'group'
    )
  ).toBe(true);
  expect(weighted.reduce((sum, layer) => sum + (layer.opacity ?? 1), 0)).toBeCloseTo(1, 8);
  f.owner.dispose();
});

it('preserves exposure quantization while removing the extra composed-scene identity group', async () => {
  const f = fixture();
  const camera = {
    scale: 1.5,
    centerX: 0.5,
    centerY: 0.5,
    spatial: {
      rotation: [0, Math.sin(0.15), 0, Math.cos(0.15)] as const,
      perspective: 0.7,
      windowMotion: 1,
      lockBackground: true,
      focus: [
        {
          weight: 1,
          settings: {
            enabled: true,
            mode: 'depth' as const,
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
  await f.owner.render({
    ...f.input,
    cameraOverride: camera,
    geometry: reviewPresentedGeometry(scene, dimensions, 2, camera),
  });
  const composed = io.render.mock.calls[0]![0].layers[0].source;
  expect(composed.layers).toHaveLength(2);
  expect(composed.layers[1].source.output).toEqual(dimensions.backing);
  const depth = composed.layers[1].source.layers[0];
  expect(depth.depth.frame).toBe(camera.spatial);
  expect(depth.blend ?? 'over').toBe('over');
  expect(depth.source.output).toEqual(dimensions.canonical);
  expect(depth.source.layers).toHaveLength(2);
  expect(depth.source.layers[1].source).toBe(f.frame);
  f.owner.dispose();
});

it.each([0, 0.5, 1])(
  'preserves the raster-local source zoom with window motion %s',
  async (windowMotion) => {
    const f = fixture();
    const camera = {
      scale: 2,
      centerX: 0.6,
      centerY: 0.4,
      spatial: {
        rotation: [0, 0, 0, 1] as const,
        perspective: 0.5,
        windowMotion,
        lockBackground: true,
        focus: [],
      },
    };
    const geometry = reviewPresentedGeometry(scene, dimensions, 2, camera);
    await f.owner.render({ ...f.input, geometry, cameraOverride: camera });
    const expected = computeQuickEditSpatialRasterLayout(
      geometry.layout,
      scene.background
    ).videoTransform;
    const sources: { source: unknown; rect: unknown }[] = [];
    const visit = (layers: readonly GpuPreviewLayer[]) => {
      for (const layer of layers) {
        sources.push(layer);
        if ('kind' in layer.source && layer.source.kind === 'group') visit(layer.source.layers);
      }
    };
    visit(io.render.mock.calls[0]![0].layers);
    expect(sources.find((layer) => layer.source === f.frame)?.rect).toEqual(expected);
    f.owner.dispose();
  }
);

it.each(['content', 'window', 'fixed'] as const)(
  'zooms the header and cropped source together with %s framing',
  async (zoomBehavior) => {
    const f = fixture();
    const canvas = { width: 640, height: 360, crop: { x: 0.2, y: 0.1, width: 0.6, height: 0.8 } };
    const currentScene: PreviewScene = {
      ...scene,
      canvas,
      windowHeader: { ...DEFAULT_WINDOW_HEADER, kind: 'browser' },
      background: {
        enabled: true,
        type: 'solid',
        color: '#000000',
        zoomBehavior,
        layout: { padding: 12, cornerRadius: 0, shadow: { intensity: 0, color: '#000000' } },
      },
    };
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
    const header = { width: 640, height: 20 } as ImageBitmap;
    const geometry = reviewPresentedGeometry(currentScene, dimensions, 2, camera);
    await f.owner.render({
      ...f.input,
      scene: currentScene,
      header,
      geometry,
      cameraOverride: camera,
    });
    const raster = computeQuickEditSpatialRasterLayout(geometry.layout, currentScene.background);
    const window = computeQuickEditWindowTransform(raster);
    const layers: GpuPreviewLayer[] = [];
    const visit = (values: readonly GpuPreviewLayer[]) => {
      for (const layer of values) {
        layers.push(layer);
        if ('kind' in layer.source && layer.source.kind === 'group') visit(layer.source.layers);
      }
    };
    visit(io.render.mock.calls[0]![0].layers);
    const videoLayer = layers.find((layer) => layer.source === f.frame)!;
    const headerLayer = layers.find((layer) => layer.source === header)!;
    expect(videoLayer.rect).toEqual(raster.videoTransform);
    const expectedHeader = {
      x: window.x,
      y: window.y,
      width: window.width,
      height:
        (((raster.visibleVideoRect ?? raster.videoRect).y - raster.windowRect.y) * window.width) /
        raster.windowRect.width,
    };
    // Equivalent affine operations can differ by floating point rounding, far below one pixel.
    for (const key of ['x', 'y', 'width', 'height'] as const) {
      expect(headerLayer.rect[key]).toBeCloseTo(expectedHeader[key], 9);
      expect(videoLayer.clip!.rect[key]).toBeCloseTo(geometry.layout.windowRect[key], 9);
    }
    expect(headerLayer.clip?.rect).toEqual(videoLayer.clip?.rect);
    f.owner.dispose();
  }
);

it('moves the cached shadow with a non-3D following window', async () => {
  const f = fixture();
  const currentScene: PreviewScene = {
    ...scene,
    background: {
      enabled: true,
      type: 'solid',
      color: '#000000',
      zoomBehavior: 'window',
      layout: { padding: 12, cornerRadius: 0, shadow: { intensity: 0, color: '#000000' } },
    },
  };
  const camera = { scale: 2, centerX: 0.6, centerY: 0.4 };
  const geometry = reviewPresentedGeometry(currentScene, dimensions, 2, camera);
  await f.owner.render({ ...f.input, scene: currentScene, geometry, cameraOverride: camera });
  const index = f.allocate.mock.calls.findIndex(([role]) => role === 'preview-gpu-decoration');
  const decoration = f.allocate.mock.results[index]!.value.canvas;
  const originalRect = f.allocate.mock.calls[index]![1];
  const layers: GpuPreviewLayer[] = [];
  const visit = (values: readonly GpuPreviewLayer[]) => {
    for (const layer of values) {
      layers.push(layer);
      if ('kind' in layer.source && layer.source.kind === 'group') visit(layer.source.layers);
    }
  };
  visit(io.render.mock.calls[0]![0].layers);
  const shadow = layers.find((layer) => layer.source === decoration)!;
  expect(shadow.rect.width).toBeCloseTo(originalRect.width * camera.scale, 9);
  expect(shadow.rect.height).toBeCloseTo(originalRect.height * camera.scale, 9);
  f.owner.dispose();
});

it('retains a composed spotlight snapshot instead of inlining its scene input', async () => {
  const f = fixture();
  const snapshot = vi
    .spyOn(gpuLayers, 'reviewGpuSpotlightLayers')
    .mockImplementationOnce((args) => ({
      kind: 'group',
      output: dimensions.backing,
      logical: dimensions.canonical,
      layers: [
        {
          source: args.source,
          rect: { x: 0, y: 0, ...dimensions.canonical },
          inverse: [1, 0, 0, 0, 1, 0, 0, 0, 1],
          lens: {
            bounds: { x: 100, y: 100, width: 200, height: 100 },
            scale: 2,
            optics: 'flat',
            edgeWidth: 8,
            corner: 0,
          },
        },
      ],
    }));
  try {
    await f.owner.render(f.input);
    const composed = io.render.mock.calls[0]![0].layers[0].source;
    expect(composed.layers).toHaveLength(1);
    const isolated = composed.layers[0].source;
    expect(isolated).toBe(snapshot.mock.results[0]!.value);
    expect(isolated.layers[0].lens.scale).toBe(2);
  } finally {
    snapshot.mockRestore();
    f.owner.dispose();
  }
});

it('keeps dissolve endpoint clocks, orientation and owned clone lifetime through GPU completion', async () => {
  const f = fixture();
  Object.assign(f.frame, { timestamp: 1_800_000 });
  const animated: PreviewScene = {
    ...scene,
    background: {
      enabled: true,
      type: 'image',
      assetId: 'bg',
      imageFit: 'cover',
      motion: { mode: 'drift', speed: 50, intensity: 50 },
      layout: { padding: 0, cornerRadius: 0 },
    },
  };
  const { reviewCutTransitionAt } = await import('../../features/video/review/cuts');
  const blend = reviewCutTransitionAt(1.8, [
    {
      id: 'cut',
      type: 'dissolve',
      seam: 2,
      before: 0.5,
      after: 0.5,
      left: { start: 0, end: 2 },
      right: { start: 4, end: 6 },
    },
  ])!;
  const clone = { timestamp: 4_000_000, close: vi.fn() } as unknown as VideoFrame;
  const retained = {
    timestamp: 4,
    rotation: 90 as const,
    flip: true,
    draw: vi.fn(),
    close: vi.fn(),
    toVideoFrame: () => clone,
  };
  const sceneAt = vi.fn(async (_resultTime: number, _sourceTime: number) => animated);
  let finish!: (value: typeof f.bitmap) => void;
  io.render.mockImplementationOnce(async () => {
    expect(clone.close).not.toHaveBeenCalled();
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  const pending = f.owner.render({
    ...f.input,
    scene: animated,
    sourceTime: 1.8,
    geometry: reviewPresentedGeometry(animated, dimensions, 1.8),
    sceneAt,
    transition: { blend, frames: { left: { ...retained, timestamp: 1.9 }, right: retained } },
  });
  await vi.waitFor(() => expect(io.render).toHaveBeenCalledOnce());
  expect(sceneAt.mock.calls.map((call) => call.slice(0, 2))).toEqual([
    [1.8, 1.8],
    [2, 4],
  ]);
  expect(f.input.painter.draw.mock.calls.map((call) => call[1].currentTime)).toEqual([1.8, 2]);
  const orientations: unknown[] = [];
  const visit = (layers: readonly { source: unknown; orientation?: unknown }[]) => {
    for (const layer of layers) {
      if (layer.orientation) orientations.push(layer.orientation);
      if (
        typeof layer.source === 'object' &&
        layer.source !== null &&
        'layers' in layer.source &&
        Array.isArray(layer.source.layers)
      )
        visit(layer.source.layers);
    }
  };
  visit(io.render.mock.calls[0]![0].layers);
  expect(orientations).toContainEqual({ rotation: 90, flip: true });
  finish(f.bitmap);
  expect(await pending).toBe(true);
  expect(clone.close).toHaveBeenCalledOnce();
  expect(retained.close).not.toHaveBeenCalled();
  f.owner.dispose();
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function borrowedAnnotations() {
  let active = false;
  const bitmaps: Array<{ width: number; height: number; close: ReturnType<typeof vi.fn> }> = [];
  const render = vi.fn(async (_time: number) => {
    if (active) throw new Error('Annotation bitmap batch is already admitted.');
    active = true;
    let requested = false,
      borrowers = 0;
    const bitmap = { width: 100, height: 80, close: vi.fn() };
    bitmaps.push(bitmap);
    const finish = () => {
      if (requested && borrowers === 0 && active) {
        bitmap.close();
        active = false;
      }
    };
    return {
      entries: [
        {
          instance: {
            attachment: 'viewport',
            transform: { x: 0.2, y: 0.3, width: 0.3, height: 0.2, rotation: 0.3 },
          },
          bitmap,
          bitmapBounds: { x: 0, y: 0, width: 1, height: 1 },
        },
      ],
      release() {
        requested = true;
        finish();
      },
      retain() {
        borrowers += 1;
        let released = false;
        return {
          release() {
            if (released) return;
            released = true;
            borrowers -= 1;
            finish();
          },
        };
      },
    };
  });
  const annotations = { describe: () => [], render } as unknown as NonNullable<
    Parameters<ReturnType<typeof createReviewGpuPreview>['render']>[0]['annotations']
  >;
  return { annotations, bitmaps, render };
}
async function dissolveInput(f: ReturnType<typeof fixture>) {
  const { reviewCutTransitionAt } = await import('../../features/video/review/cuts');
  Object.assign(f.frame, { timestamp: 1_800_000 });
  const blend = reviewCutTransitionAt(1.8, [
    {
      id: 'cut',
      type: 'dissolve',
      seam: 2,
      before: 0.5,
      after: 0.5,
      left: { start: 0, end: 2 },
      right: { start: 4, end: 6 },
    },
  ])!;
  const clone = { timestamp: 4_000_000, close: vi.fn() } as unknown as VideoFrame;
  const retained = { timestamp: 4, draw: vi.fn(), close: vi.fn(), toVideoFrame: () => clone };
  return {
    ...f.input,
    sourceTime: 1.8,
    geometry: reviewPresentedGeometry(scene, dimensions, 1.8),
    transition: { blend, frames: { left: { ...retained, timestamp: 1.9 }, right: retained } },
  };
}
it('keeps raw annotation outputs through a controlled fence and disposes without a late publication', async () => {
  const f = fixture();
  const annotation = borrowedAnnotations();
  const fence = deferred<typeof f.bitmap>();
  const entered = deferred<void>();
  io.render.mockImplementationOnce(() => {
    entered.resolve();
    return fence.promise;
  });
  const pending = f.owner.render({ ...f.input, annotations: annotation.annotations });
  const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  await entered.promise;
  expect(annotation.bitmaps[0]!.close).not.toHaveBeenCalled();
  f.owner.dispose();
  expect(annotation.bitmaps[0]!.close).not.toHaveBeenCalled();
  expect(f.released).not.toHaveBeenCalled();
  fence.resolve(f.bitmap);
  await rejected;
  expect(annotation.bitmaps[0]!.close).toHaveBeenCalledOnce();
  expect(f.bitmap.close).toHaveBeenCalledOnce();
  expect(f.context.drawImage).not.toHaveBeenCalled();
});
it('holds annotated dissolve outputs through the final fence and admits endpoint batches sequentially', async () => {
  const f = fixture();
  const annotation = borrowedAnnotations();
  const gates = [deferred<ImageBitmap>(), deferred<ImageBitmap>(), deferred<ImageBitmap>()];
  const submitted = [deferred<void>(), deferred<void>(), deferred<void>()];
  const outputs = Array.from({ length: 3 }, () => ({ width: 320, height: 180, close: vi.fn() }));
  io.render.mockImplementation(() => {
    const index = io.render.mock.calls.length - 1;
    submitted[index]!.resolve();
    return gates[index]!.promise;
  });
  const input = await dissolveInput(f);
  const pending = f.owner.render({ ...input, annotations: annotation.annotations });
  await submitted[0]!.promise;
  expect(annotation.render).toHaveBeenCalledOnce();
  expect(annotation.bitmaps[0]!.close).not.toHaveBeenCalled();
  gates[0]!.resolve(outputs[0]!);
  await submitted[1]!.promise;
  expect(annotation.render.mock.calls.map(([time]) => time)).toEqual([1.8, 2]);
  expect(annotation.bitmaps[0]!.close).toHaveBeenCalledOnce();
  expect(annotation.bitmaps[1]!.close).not.toHaveBeenCalled();
  expect(outputs[0]!.close).not.toHaveBeenCalled();
  gates[1]!.resolve(outputs[1]!);
  await submitted[2]!.promise;
  expect(annotation.bitmaps[1]!.close).toHaveBeenCalledOnce();
  expect(outputs[0]!.close).not.toHaveBeenCalled();
  expect(outputs[1]!.close).not.toHaveBeenCalled();
  expect(
    vi
      .mocked(f.resources.bytes)
      .mock.results.every(
        (result) =>
          result.type === 'return' && vi.mocked(result.value.release).mock.calls.length === 0
      )
  ).toBe(true);
  const final = io.render.mock.calls[2]![0].layers[0].source.layers;
  expect(final[0].source).toBe(outputs[0]);
  expect(final[1].source).toBe(outputs[1]);
  expect(final[1].opacity).toBe(input.transition.blend.incoming);
  gates[2]!.resolve(outputs[2]!);
  expect(await pending).toBe(true);
  expect(outputs.every((bitmap) => bitmap.close.mock.calls.length === 1)).toBe(true);
  expect(
    vi
      .mocked(f.resources.bytes)
      .mock.calls.filter(([role]) => role === 'preview-gpu-annotation-endpoint')
  ).toEqual([
    ['preview-gpu-annotation-endpoint', 320 * 180 * 4],
    ['preview-gpu-annotation-endpoint', 320 * 180 * 4],
  ]);
  for (const result of vi.mocked(f.resources.bytes).mock.results)
    if (result.type === 'return') expect(result.value.release).toHaveBeenCalledOnce();
  expect(f.context.drawImage).toHaveBeenCalledWith(outputs[2], 0, 0);
  f.owner.dispose();
});
it.each([0, 1, 2])(
  'drains and releases annotated endpoint resources when submission %s fails',
  async (failed) => {
    const f = fixture();
    const annotation = borrowedAnnotations();
    const outputs: Array<{ close: ReturnType<typeof vi.fn> }> = [];
    const error = new Error('Annotation GPU contract failure');
    io.render.mockImplementation(async () => {
      if (io.render.mock.calls.length - 1 === failed) throw error;
      const output = { width: 320, height: 180, close: vi.fn() };
      outputs.push(output);
      return output;
    });
    const input = await dissolveInput(f);
    await expect(f.owner.render({ ...input, annotations: annotation.annotations })).rejects.toBe(
      error
    );
    expect(outputs.every((bitmap) => bitmap.close.mock.calls.length === 1)).toBe(true);
    expect(annotation.bitmaps.every((bitmap) => bitmap.close.mock.calls.length === 1)).toBe(true);
    expect(f.context.drawImage).not.toHaveBeenCalled();
    f.owner.dispose();
  }
);
it('does not admit a later annotation endpoint after an external abort during the first fence', async () => {
  const f = fixture();
  const annotation = borrowedAnnotations();
  const gate = deferred<ImageBitmap>();
  const submitted = deferred<void>();
  const bitmap = { width: 320, height: 180, close: vi.fn() };
  io.render.mockImplementationOnce(() => {
    submitted.resolve();
    return gate.promise;
  });
  const controller = new AbortController();
  const input = await dissolveInput(f);
  const pending = f.owner.render({
    ...input,
    annotations: annotation.annotations,
    signal: controller.signal,
  });
  const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  await submitted.promise;
  controller.abort();
  expect(annotation.bitmaps[0]!.close).not.toHaveBeenCalled();
  gate.resolve(bitmap);
  await rejected;
  expect(annotation.render).toHaveBeenCalledOnce();
  expect(annotation.bitmaps[0]!.close).toHaveBeenCalledOnce();
  expect(bitmap.close).toHaveBeenCalledOnce();
  expect(f.context.drawImage).not.toHaveBeenCalled();
  f.owner.dispose();
});
it('refuses endpoint bitmap allocation before GPU submission and releases the acquired annotation batch', async () => {
  const f = fixture();
  const annotation = borrowedAnnotations();
  vi.mocked(f.resources.bytes).mockImplementation((role) => {
    if (role === 'preview-gpu-annotation-endpoint') throw new Error('Endpoint admission refused');
    return { release() {} };
  });
  const input = await dissolveInput(f);
  await expect(f.owner.render({ ...input, annotations: annotation.annotations })).rejects.toThrow(
    'Endpoint admission refused'
  );
  expect(io.render).not.toHaveBeenCalled();
  expect(annotation.render).toHaveBeenCalledOnce();
  expect(annotation.bitmaps[0]!.close).toHaveBeenCalledOnce();
  f.owner.dispose();
});
it('releases annotation outputs after endpoint device failure before fallback', async () => {
  const f = fixture();
  const annotation = borrowedAnnotations();
  io.render.mockRejectedValueOnce(new GpuPreviewDeviceError('Device lost'));
  expect(
    await f.owner.render({ ...(await dissolveInput(f)), annotations: annotation.annotations })
  ).toBe(false);
  expect(annotation.bitmaps[0]!.close).toHaveBeenCalledOnce();
  expect(annotation.render).toHaveBeenCalledOnce();
  expect(f.context.drawImage).not.toHaveBeenCalled();
  f.owner.dispose();
});

it('releases the completed endpoint when acquisition of the next annotation batch fails', async () => {
  const f = fixture();
  const annotation = borrowedAnnotations();
  const initial = annotation.render.getMockImplementation()!;
  annotation.render
    .mockImplementationOnce(initial)
    .mockRejectedValueOnce(new Error('Annotation decode failed'));
  const input = await dissolveInput(f);
  await expect(f.owner.render({ ...input, annotations: annotation.annotations })).rejects.toThrow(
    'Annotation decode failed'
  );
  expect(io.render).toHaveBeenCalledOnce();
  expect(f.bitmap.close).toHaveBeenCalledOnce();
  expect(annotation.bitmaps[0]!.close).toHaveBeenCalledOnce();
  expect(f.context.drawImage).not.toHaveBeenCalled();
  f.owner.dispose();
});

it('repaints a reused slot when the borrowed image identity changes', async () => {
  const f = fixture();
  const image = { width: 320, height: 180 } as ImageBitmap;
  const replacement = { width: 320, height: 180 } as ImageBitmap;
  await f.owner.render({ ...f.input, image });
  await f.owner.render({ ...f.input, image: replacement });
  expect(f.input.painter.draw.mock.calls.map(([, paint]) => paint)).toEqual([
    expect.objectContaining({ image }),
    expect.objectContaining({ image: replacement }),
  ]);
  expect(f.painters).toHaveLength(1);
  f.owner.dispose();
});
