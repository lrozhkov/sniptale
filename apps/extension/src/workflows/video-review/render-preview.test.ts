import { planReviewPresentationSequence } from '../../features/video/review/presentation-sequence';
import { readFileSync } from 'node:fs';
import {
  resolveEffectV1ControlDefault,
  sha256EffectV1Bytes,
} from '@sniptale/runtime-contracts/effect-v1';
import type {
  EffectRuntimeFrameResult,
  EffectRuntimeRenderCommand,
} from '../../contracts/effect-runtime/types';
import { readReviewAnnotationEffectDocument } from '../../features/video/review/annotation-effects/validation';
import { createNewWorkspacePresentationSettings } from '../../features/video/review/advanced/presentation';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { RenderResources } from '../../features/video/composition/canvas/render-resources';
import { createReviewPreviewRenderer } from './render-preview';
import { createQuickEditWebcam } from '../../features/video/review/advanced/webcam';
import { reviewCutTransitionAt } from '../../features/video/review/cuts';
import { DEFAULT_CAMERA_DEPTH as DEFAULT_QUICK_EDIT_DEPTH } from '../../features/video/project/motion/spatial';
import { createQuickEditZoomRegion } from '../../features/video/review/advanced/zoom';
import { createReviewCaptionSettings } from '../../features/video/review/text-document';
import { buildReviewTimeMap } from '../../features/video/review/timeline';
import { createCanvasComment } from '../../features/video/review/comments';

const io = vi.hoisted(() => ({
  order: [] as string[],
  frame: vi.fn(),
  overlays: vi.fn(),
  webcam: vi.fn(),
  keys: vi.fn(),
  blackout: vi.fn(),
  transition: vi.fn(),
  watermark: vi.fn(),
  header: vi.fn(),
  spatial: vi.fn(),
  background: vi.fn(),
}));
vi.mock('./scene-frame', () => ({ drawReviewSceneFrame: io.frame }));
vi.mock('./render-scene-overlays', () => ({ drawReviewSceneOverlays: io.overlays }));
vi.mock('./render-webcam', () => ({ drawReviewWebcam: io.webcam }));
vi.mock('./render-key-animation', () => ({ drawReviewKeys: io.keys }));
vi.mock('./cut-transition-frames', async (original) => ({
  ...(await original<typeof import('./cut-transition-frames')>()),
  paintReviewCutTransition: io.transition,
  paintReviewCutBlackout: io.blackout,
}));
vi.mock('../../features/video/composition/canvas/watermark', () => ({
  createWatermarkRenderer: io.watermark,
  measureWatermark: async (...args: unknown[]) => ({
    cache: null,
    source: null,
    paint: (assets: unknown) => io.watermark(args[0], args[1], assets, args[2], args[3]),
  }),
}));
vi.mock('./window-header', async (original) => ({
  ...(await original<typeof import('./window-header')>()),
  loadReviewWindowHeader: io.header,
  reviewWindowHeaderUrl: () => 'local-header',
}));
vi.mock('../../features/video/composition/canvas/spatial-renderer', () => ({
  createReviewSpatialRenderer: io.spatial,
}));
vi.mock('./scene-background', () => ({ createReviewBackgroundPainter: io.background }));

const size = { width: 1920, height: 1080 };
const dimensions = { canonical: size, backing: { width: 640, height: 360 } };
function scene(): Parameters<ReturnType<typeof createReviewPreviewRenderer>['prepare']>[0] {
  return {
    source: { ...size },
    background: { enabled: false },
    zoomRegions: [],
    comments: [],
    keys: [],
    clicks: [],
  };
}
function frame(): Parameters<ReturnType<typeof createReviewPreviewRenderer>['render']>[1] {
  return {
    generation: 7,
    sourceTime: 1,
    resultTime: 2,
    source: { timestamp: 0.98, backing: dimensions.backing, draw: vi.fn() },
  };
}
function setup() {
  const leases: { release: ReturnType<typeof vi.fn>; context: CanvasRenderingContext2D }[] = [];
  const reservations: ReturnType<typeof vi.fn>[] = [];
  const resources: RenderResources = {
    canvas: vi.fn((_role, bounds) => {
      const context = {
        save: vi.fn(),
        restore: vi.fn(),
        scale: vi.fn(),
        drawImage: vi.fn(),
        fillRect: vi.fn(() => io.order.push('outer-fade')),
        measureText: vi.fn((text: string) => ({ width: text.length * 8 })),
        beginPath: vi.fn(),
        roundRect: vi.fn(),
        fill: vi.fn(),
        fillText: vi.fn(() => io.order.push('captions')),
      } as unknown as CanvasRenderingContext2D;
      const release = vi.fn();
      leases.push({ release, context });
      return { canvas: { ...bounds } as HTMLCanvasElement, context, release };
    }),
    bytes: vi.fn(() => {
      const release = vi.fn();
      reservations.push(release);
      return { release };
    }),
  };
  return { resources, leases, reservations };
}

async function annotationsFixture() {
  const input = scene();
  const source = readFileSync(
    'apps/extension/public/video-effects/effects/annotations/sniptale-title/effect.sniptale-effect.json',
    'utf8'
  );
  const document = readReviewAnnotationEffectDocument(source)!;
  const sha256 = await sha256EffectV1Bytes(new TextEncoder().encode(source));
  input.annotationEffects = {
    lane: {
      enabled: true,
      instances: ['content', 'viewport'].map((attachment, order) => ({
        id: `annotation-${attachment}`,
        snapshotId: `effect:${sha256}`,
        start: 0,
        end: 12,
        enabled: true,
        attachment: attachment === 'content' ? 'content' : 'viewport',
        order,
        transform: { x: 0.2, y: 0.3, width: 0.4, height: 0.15, rotation: 0 },
        controls: Object.fromEntries(
          document.controls.map((control) => [
            control.id,
            resolveEffectV1ControlDefault(control, 'en'),
          ])
        ),
      })),
    },
    snapshots: [
      {
        id: `effect:${sha256}`,
        sha256,
        source,
        documentId: document.id,
        schemaVersion: 'sniptale.effect.v1',
        kind: 'standalone',
        retainedByteLength: new TextEncoder().encode(source).byteLength,
        assets: [],
      },
    ],
    segments: buildReviewTimeMap(12, []),
  };
  const bitmaps: { width: number; height: number; close: ReturnType<typeof vi.fn> }[] = [];
  const success = (request: EffectRuntimeRenderCommand): EffectRuntimeFrameResult => {
    const bitmap = { width: request.renderWidth, height: request.renderHeight, close: vi.fn() };
    bitmaps.push(bitmap);
    return {
      kind: 'frame',
      bitmap,
      width: bitmap.width,
      height: bitmap.height,
      requestId: request.requestId,
      effectInstanceId: request.effectInstanceId,
      snapshotId: request.snapshotId,
      sequenceId: request.sequenceId,
      acknowledged: {
        documentId: request.documentRef.id,
        assetSelectionId: request.assetSelectionRef.id,
      },
    };
  };
  const executor = {
    renderFrame: vi.fn(async (request: EffectRuntimeRenderCommand) => success(request)),
    dispose: vi.fn(),
  };
  return { input, executor, bitmaps, success };
}

it('awaits plans, accounts for unique sources/outputs and releases them after painting', async () => {
  const f = await annotationsFixture();
  const { resources, reservations } = setup();
  const replaceLimits = vi.fn();
  const renderer = createReviewPreviewRenderer({
    resources,
    annotationExecutor: () => f.executor,
    allocation: { describe: allocationInput, replaceLimits },
  });
  const prepared = await renderer.prepare(f.input, dimensions, new AbortController().signal);
  expect(resources.bytes).toHaveBeenCalledWith(
    'annotation-immutable-sources',
    f.input.annotationEffects!.snapshots[0]!.retainedByteLength
  );
  const output = await renderer.render(prepared, frame());
  expect(f.executor.renderFrame.mock.calls.map(([request]) => request.effectInstanceId)).toEqual([
    'annotation-content',
    'annotation-viewport',
  ]);
  expect(
    io.overlays.mock.calls
      .at(-1)![0]
      .annotationFrames.map(
        (entry: { instance: { attachment: string } }) => entry.instance.attachment
      )
  ).toEqual(['content', 'viewport']);
  const bitmapBytes = f.bitmaps.reduce((sum, bitmap) => sum + bitmap.width * bitmap.height * 4, 0);
  const declared = f.input.annotationEffects!.snapshots[0]!.retainedByteLength;
  expect(replaceLimits.mock.calls.at(-1)![0].maximumManagedBytes).toBeGreaterThanOrEqual(
    dimensions.backing.width * dimensions.backing.height * 4 + 1400 + declared + bitmapBytes
  );
  for (const bitmap of f.bitmaps) {
    expect(resources.bytes).toHaveBeenCalledWith(
      'annotation-output-bitmap',
      bitmap.width * bitmap.height * 4
    );
    expect(bitmap.close).toHaveBeenCalledOnce();
  }
  expect(reservations[0]).not.toHaveBeenCalled();
  renderer.dispose();
  expect(reservations[0]).toHaveBeenCalledOnce();
  output.release();
});

it('refuses parent annotation bitmap admission before sandbox execution and releases staging', async () => {
  const f = await annotationsFixture();
  const { resources, leases } = setup();
  const replaceLimits = vi.fn();
  const renderer = createReviewPreviewRenderer({
    resources,
    annotationExecutor: () => f.executor,
    allocation: { describe: allocationInput, replaceLimits },
  });
  const prepared = await renderer.prepare(f.input, dimensions, new AbortController().signal);
  replaceLimits.mockImplementation((limits) => {
    if (limits.maximumManagedBytes > 1_000_000) throw new Error('annotation admission refused');
  });
  await expect(renderer.render(prepared, frame())).rejects.toThrow('admission refused');
  expect(f.executor.renderFrame).not.toHaveBeenCalled();
  expect(leases.at(-1)!.release).toHaveBeenCalledOnce();
  renderer.dispose();
});

it.each(['abort', 'dispose', 'supersede'] as const)(
  'late annotation output after %s cannot publish or retain captured raster resources',
  async (kind) => {
    const f = await annotationsFixture();
    f.input.annotationEffects!.lane.instances.splice(1);
    const { resources, leases } = setup();
    const renderer = createReviewPreviewRenderer({
      resources,
      annotationExecutor: () => f.executor,
    });
    const prepared = await renderer.prepare(f.input, dimensions, new AbortController().signal);
    let finish!: (result: EffectRuntimeFrameResult) => void;
    let begin!: () => void;
    const started = new Promise<void>((resolve) => {
      begin = resolve;
    });
    f.executor.renderFrame.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
          begin();
        })
    );
    const controller = new AbortController();
    const rendering = renderer.render(prepared, frame(), controller.signal);
    const rejected = expect(rendering).rejects.toThrow();
    await started;
    await expect(renderer.render(prepared, frame())).rejects.toThrow('already admitted');
    expect(io.frame).not.toHaveBeenCalled();
    if (kind === 'abort') controller.abort();
    else if (kind === 'dispose') renderer.dispose();
    else await renderer.prepare(scene(), dimensions, new AbortController().signal);
    finish(f.success(f.executor.renderFrame.mock.calls[0]![0]));
    await rejected;
    expect(io.frame).not.toHaveBeenCalled();
    expect(f.bitmaps[0]!.close).toHaveBeenCalledOnce();
    expect(leases[0]!.release).toHaveBeenCalledOnce();
    renderer.dispose();
  }
);
beforeEach(() => {
  io.order.length = 0;
  io.frame.mockImplementation((_context, request) => {
    io.order.push('scene');
    request.drawOverlays?.(null);
  });
  io.overlays.mockImplementation(() => io.order.push('overlays'));
  io.webcam.mockImplementation(() => io.order.push('webcam'));
  io.keys.mockImplementation(() => io.order.push('keys'));
  io.blackout.mockImplementation(() => io.order.push('blackout'));
  io.transition.mockImplementation(() => io.order.push('transition'));
  io.watermark.mockImplementation(async () => ({
    bounds: { x: 1, y: 1, width: 10, height: 10 },
    draw: () => io.order.push('watermark'),
    dispose: vi.fn(),
  }));
  io.background.mockImplementation(() => ({ draw: vi.fn(), dispose: vi.fn() }));
  io.spatial.mockImplementation(() => ({ dispose: vi.fn() }));
  io.header.mockResolvedValue({ width: 640, height: 30, close: vi.fn() });
  vi.stubGlobal('document', {
    fonts: { ready: Promise.resolve(), load: vi.fn(async () => [{ status: 'loaded' }]) },
  });
});

it('paints cached captions before blackout and retains editor comment visibility', async () => {
  const { resources, leases } = setup();
  const renderer = createReviewPreviewRenderer({ resources, readAsset: async () => null });
  const input = scene();
  input.showEditorComments = true;
  input.comments = [
    {
      ...createCanvasComment({ id: 'editor', position: { x: 0.5, y: 0.9 } }),
      renderToVideo: false,
      resolvedText: 'Editor only',
    },
  ];
  input.captions = {
    settings: { ...createReviewCaptionSettings(), enabled: true },
    segments: buildReviewTimeMap(5, []),
    document: {
      version: 1,
      fragments: [
        {
          id: 'caption',
          text: 'Caption',
          originalText: 'Caption',
          start: 0,
          end: 5,
          timeDomain: 'result',
          alignment: 'manual',
          revision: 0,
          timingRevision: 0,
          showInVideo: true,
        },
      ],
    },
  };
  const prepared = await renderer.prepare(input, dimensions, new AbortController().signal);
  expect(prepared.captionConflicts).toEqual([]);
  const measured = leases.reduce(
    (total, lease) => total + vi.mocked(lease.context.measureText).mock.calls.length,
    0
  );
  const output = await renderer.render(prepared, frame());
  expect(io.order).toEqual(['scene', 'overlays', 'keys', 'watermark', 'captions', 'blackout']);
  expect(io.overlays.mock.calls[0]![0].scene.comments[0].renderToVideo).toBe(true);
  expect(input.comments[0]!.renderToVideo).toBe(false);
  expect(
    leases.reduce(
      (total, lease) => total + vi.mocked(lease.context.measureText).mock.calls.length,
      0
    )
  ).toBe(measured);
  output.release();
  prepared.release();
  renderer.dispose();
  expect(leases.every((lease) => lease.release.mock.calls.length === 1)).toBe(true);
});
afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});

it('composes admitted frames in layer order from frozen settings and reports actual source time', async () => {
  const { resources, leases } = setup();
  const renderer = createReviewPreviewRenderer({ resources });
  const input = scene();
  const prepared = await renderer.prepare(input, dimensions, new AbortController().signal);
  input.source.width = 100;
  const output = await renderer.render(prepared, frame());
  expect(output).not.toBeInstanceOf(Promise);
  expect(io.order).toEqual(['scene', 'overlays', 'keys', 'watermark', 'blackout']);
  expect(output).toMatchObject({
    generation: 7,
    sourceTime: 1,
    resultTime: 2,
    representedMediaTime: 0.98,
  });
  expect(io.frame.mock.calls[0]![1]).toMatchObject({
    canvas: dimensions.backing,
    commentSpace: { canvas: dimensions.canonical },
    sourceTime: 1,
    resources,
  });
  expect(leases[0]!.context.scale).toHaveBeenCalledWith(1 / 3, 1 / 3);
  expect(io.keys.mock.calls[0]![3]).toEqual(dimensions.canonical);
  renderer.dispose();
  expect(leases[0]!.release).not.toHaveBeenCalled();
  output.release();
  expect(leases[0]!.release).toHaveBeenCalledOnce();
});

it('passes the same authored layout inputs at both qualities and scales paint values once', async () => {
  const { resources } = setup();
  const renderer = createReviewPreviewRenderer({ resources });
  const input = scene();
  input.source = { width: 1920, height: 1080 };
  input.background = {
    enabled: true,
    type: 'solid',
    color: '#ffffff',
    layout: { padding: 60, cornerRadius: 30, blur: 12 },
  };
  const prepared = await renderer.prepare(input, dimensions, new AbortController().signal);
  (await renderer.render(prepared, frame())).release();
  const args = io.frame.mock.calls[0]![1];
  expect(args.background.layout).toMatchObject({ padding: 60, cornerRadius: 10, blur: 4 });
  expect(args.sceneScale).toBe(1 / 3);
  expect(args.commentSpace.background.layout).toMatchObject({ cornerRadius: 30, blur: 12 });
  expect(args.layout.videoRect.width * 3).toBeCloseTo(args.commentSpace.layout.videoRect.width);
  renderer.dispose();
});

it('cancels a request lease without destroying the reusable background session cache', async () => {
  const { resources, reservations } = setup();
  const bitmap = { width: 2000, height: 1000, close: vi.fn() };
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => bitmap)
  );
  const renderer = createReviewPreviewRenderer({
    resources,
    readAsset: async () => new Blob(['image']),
  });
  const input = scene();
  input.background = {
    enabled: true,
    type: 'image',
    assetId: 'logo',
    imageFit: 'contain',
    layout: { padding: 0, cornerRadius: 0 },
  };
  const controller = new AbortController();
  const prepared = await renderer.prepare(input, dimensions, controller.signal);
  expect(resources.bytes).toHaveBeenCalledWith('preview-background-bitmap', 8_000_000);
  controller.abort();
  expect(bitmap.close).not.toHaveBeenCalled();
  expect(reservations[0]).not.toHaveBeenCalled();
  await expect(renderer.render(prepared, frame())).rejects.toThrow('stale');
  const next = await renderer.prepare(input, dimensions, new AbortController().signal);
  expect(createImageBitmap).toHaveBeenCalledOnce();
  (await renderer.render(next, frame())).release();
  next.release();
  renderer.dispose();
  expect(bitmap.close).toHaveBeenCalledOnce();
  expect(reservations[0]).toHaveBeenCalledOnce();
});

it('rejects superseded preparation and closes its late decoded bitmap', async () => {
  const { resources } = setup();
  let finish!: (bitmap: ImageBitmap) => void;
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(
      () =>
        new Promise<ImageBitmap>((resolve) => {
          finish = resolve;
        })
    )
  );
  const renderer = createReviewPreviewRenderer({
    resources,
    readAsset: async () => new Blob(['image']),
  });
  const input = scene();
  input.background = {
    enabled: true,
    type: 'image',
    assetId: 'logo',
    imageFit: 'contain',
    layout: { padding: 0, cornerRadius: 0 },
  };
  const pending = renderer.prepare(input, dimensions, new AbortController().signal);
  const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  await Promise.resolve();
  const current = await renderer.prepare(scene(), dimensions, new AbortController().signal);
  const bitmap = { width: 10, height: 10, close: vi.fn() };
  finish(bitmap as unknown as ImageBitmap);
  await rejected;
  expect(bitmap.close).toHaveBeenCalledOnce();
  (await renderer.render(current, frame())).release();
  renderer.dispose();
});

it('passes the prepare owner signal to protected asset reads and rejects late bytes before decoding', async () => {
  const { resources, reservations } = setup();
  let finish!: (value: Blob) => void;
  const readAsset = vi.fn(
    (_reference: string, _signal: AbortSignal) =>
      new Promise<Blob>((resolve) => {
        finish = resolve;
      })
  );
  const decode = vi.fn(async () => ({ width: 10, height: 10, close: vi.fn() }));
  vi.stubGlobal('createImageBitmap', decode);
  const renderer = createReviewPreviewRenderer({ resources, readAsset });
  const input = scene();
  input.background = {
    enabled: true,
    type: 'image',
    assetId: 'project-asset:local',
    imageFit: 'contain',
    layout: { padding: 0, cornerRadius: 0 },
  };
  const controller = new AbortController();
  const pending = renderer.prepare(input, dimensions, controller.signal);
  const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  await vi.waitFor(() => expect(readAsset).toHaveBeenCalledOnce());
  const [reference, ownerSignal] = readAsset.mock.calls[0]!;
  expect(reference).toBe('project-asset:local');
  expect(ownerSignal.aborted).toBe(false);
  controller.abort();
  expect(ownerSignal.aborted).toBe(true);
  finish(new Blob(['private image']));
  await rejected;
  expect(decode).not.toHaveBeenCalled();
  expect(reservations).toHaveLength(0);
  const current = await renderer.prepare(scene(), dimensions, new AbortController().signal);
  (await renderer.render(current, frame())).release();
  renderer.dispose();
});

it('releases staging when a layer fails and permits an explicit render retry', async () => {
  const { resources, leases } = setup();
  const renderer = createReviewPreviewRenderer({ resources });
  const prepared = await renderer.prepare(scene(), dimensions, new AbortController().signal);
  io.overlays.mockImplementationOnce(() => {
    throw new Error('draw failed');
  });
  await expect(renderer.render(prepared, frame())).rejects.toThrow('draw failed');
  expect(leases[0]!.release).toHaveBeenCalledOnce();
  (await renderer.render(prepared, frame())).release();
  expect(leases[1]!.release).toHaveBeenCalledOnce();
  renderer.dispose();
});

it('reuses one spatial renderer over admitted frames and releases it when preparation changes', async () => {
  const { resources } = setup();
  const renderer = createReviewPreviewRenderer({ resources });
  const input = scene();
  input.zoomRegions = [
    {
      ...createQuickEditZoomRegion({ id: 'z', at: 0, duration: 3, endMax: 3 }),
      perspective: { enabled: true, rotateX: 10, rotateY: 20, rotateZ: 0, strength: 0.5 },
    },
  ];
  const prepared = await renderer.prepare(input, dimensions, new AbortController().signal);
  (await renderer.render(prepared, frame())).release();
  (await renderer.render(prepared, frame())).release();
  expect(io.spatial).toHaveBeenCalledOnce();
  const spatial = io.spatial.mock.results[0]!.value;
  await renderer.prepare(scene(), dimensions, new AbortController().signal);
  expect(spatial.dispose).toHaveBeenCalledOnce();
  await expect(renderer.render(prepared, frame())).rejects.toThrow('stale');
  renderer.dispose();
});

it('prepares a neutral enabled pose without acquiring a GPU renderer', async () => {
  const { resources } = setup();
  const renderer = createReviewPreviewRenderer({ resources });
  const input = scene();
  input.zoomRegions = [
    {
      ...createQuickEditZoomRegion({ id: 'neutral', at: 0 }),
      perspective: { enabled: true, rotateX: 0, rotateY: 0, rotateZ: 0, strength: 0.9 },
    },
  ];
  const prepared = await renderer.prepare(input, dimensions, new AbortController().signal);
  (await renderer.render(prepared, frame())).release();
  expect(io.spatial).not.toHaveBeenCalled();
  renderer.dispose();
});

it('reuses scene preparation across request leases and rejects a released lease', async () => {
  const { resources } = setup();
  const renderer = createReviewPreviewRenderer({ resources });
  const input = scene();
  const first = await renderer.prepare(input, dimensions, new AbortController().signal);
  (await renderer.render(first, frame())).release();
  first.release();
  await expect(renderer.render(first, frame())).rejects.toThrow('stale');
  const next = await renderer.prepare(
    structuredClone(input),
    structuredClone(dimensions),
    new AbortController().signal
  );
  expect(io.watermark).toHaveBeenCalledOnce();
  expect(io.background).toHaveBeenCalledOnce();
  expect(next.generation).toBe(first.generation);
  (await renderer.render(next, frame())).release();
  next.release();
  renderer.dispose();
});

it('uses admitted transition endpoints and webcam pixels before the final scene blackout', async () => {
  const { resources, leases } = setup();
  const renderer = createReviewPreviewRenderer({ resources });
  const input = scene();
  input.webcam = createQuickEditWebcam('camera', { width: 640, height: 480 }, size);
  const prepared = await renderer.prepare(input, dimensions, new AbortController().signal);
  const admitted = frame();
  const blend = reviewCutTransitionAt(2, [
    {
      id: 'cut',
      type: 'fade-black',
      seam: 2,
      before: 0.5,
      after: 0.5,
      left: { start: 0, end: 1 },
      right: { start: 3, end: 5 },
    },
  ])!;
  const endpoint = { timestamp: 0.99, draw: vi.fn(), close: vi.fn() };
  admitted.transition = { blend, frames: { left: endpoint, right: { ...endpoint, timestamp: 3 } } };
  admitted.camera = {
    representedMediaTime: 0.96,
    generation: 12,
    source: { width: 640, height: 480 },
    placement: input.webcam.placement,
    drawable: { draw: vi.fn() },
  };
  const output = await renderer.render(prepared, admitted);
  expect(io.order).toEqual([
    'transition',
    'scene',
    'overlays',
    'webcam',
    'keys',
    'watermark',
    'blackout',
  ]);
  expect(io.transition.mock.calls[0]!.slice(2)).toEqual([
    blend,
    admitted.transition.frames,
    admitted.source,
  ]);
  expect(io.webcam.mock.calls[0]![5]).toBe(admitted.camera.drawable);
  expect(output).toMatchObject({ cameraMediaTime: 0.96, cameraGeneration: 12 });
  expect(endpoint.close).not.toHaveBeenCalled();
  expect(leases[1]!.release).toHaveBeenCalledOnce();
  output.release();
  prepared.release();
  renderer.dispose();
});

it('closes a decoded background when its retained reservation cannot be admitted', async () => {
  const { resources } = setup();
  vi.mocked(resources.bytes).mockImplementation(() => {
    throw new Error('allocation plan exceeded');
  });
  const bitmap = { width: 2000, height: 1000, close: vi.fn() };
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => bitmap)
  );
  const renderer = createReviewPreviewRenderer({
    resources,
    readAsset: async () => new Blob(['image']),
  });
  const input = scene();
  input.background = {
    enabled: true,
    type: 'image',
    assetId: 'logo',
    imageFit: 'contain',
    layout: { padding: 0, cornerRadius: 0 },
  };
  await expect(renderer.prepare(input, dimensions, new AbortController().signal)).rejects.toThrow(
    'allocation plan exceeded'
  );
  expect(bitmap.close).toHaveBeenCalledOnce();
  renderer.dispose();
  expect(bitmap.close).toHaveBeenCalledOnce();
});

function allocationInput(): NonNullable<
  Parameters<typeof createReviewPreviewRenderer>[0]['allocation']
> extends { describe(): infer T }
  ? T
  : never {
  return {
    publication: { backing: dimensions.backing, previousFront: { width: 10, height: 10 } },
    admission: {
      source: { kind: 'video-frame', allocationBytes: 1000 },
      camera: { retained: null, active: null },
      transition: null,
    },
    assets: {
      backgroundBitmap: null,
      headerBitmap: null,
      watermark: null,
      previousWatermarkCache: null,
    },
    background: null,
    scene: {
      transitionRaster: null,
      windowRaster: null,
      motionPass: null,
      spatial: null,
      spotlight: null,
      border: null,
      denseCommentGradient: null,
      denseBackgroundGradient: null,
    },
  };
}

it('admits bitmap and retained transition bytes before reservation and refreshes cached limits', async () => {
  const { resources } = setup();
  const bitmap = { width: 100, height: 50, close: vi.fn() };
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => bitmap)
  );
  const replaceLimits = vi.fn();
  const input = allocationInput();
  input.admission.transition = [
    { kind: 'video-frame', allocationBytes: 1000 },
    { kind: 'video-frame', allocationBytes: 2000 },
  ];
  const renderer = createReviewPreviewRenderer({
    resources,
    readAsset: async () => new Blob(['image']),
    allocation: { replaceLimits, describe: () => input },
  });
  const snapshot = scene();
  snapshot.background = {
    enabled: true,
    type: 'image',
    assetId: 'asset:background',
    imageFit: 'contain',
    layout: { padding: 0, cornerRadius: 0 },
  };
  const prepared = await renderer.prepare(snapshot, dimensions, new AbortController().signal);
  expect(replaceLimits.mock.calls[0]![0]).toMatchObject({
    maximumManagedBytes: 3400,
    maximumCanvases: 1,
  });
  expect(replaceLimits.mock.calls[1]![0]).toMatchObject({
    maximumManagedBytes: 23400,
    maximumCanvases: 1,
  });
  expect(replaceLimits.mock.invocationCallOrder[1]).toBeLessThan(
    vi.mocked(resources.bytes).mock.invocationCallOrder[0]!
  );
  expect(prepared.allocationAssets.backgroundBitmap).toEqual({ width: 100, height: 50 });
  expect(prepared.watermarkBounds).toEqual({ x: 1, y: 1, width: 10, height: 10 });
  prepared.release();
  const count = replaceLimits.mock.calls.length;
  input.publication.previousFront = { width: 20, height: 20 };
  const next = await renderer.prepare(snapshot, dimensions, new AbortController().signal);
  expect(replaceLimits).toHaveBeenCalledTimes(count + 1);
  expect(createImageBitmap).toHaveBeenCalledOnce();
  next.release();
  renderer.dispose();
});

it('closes discovered bitmap when exact admission is refused without reserving it', async () => {
  const { resources } = setup();
  const bitmap = { width: 100, height: 50, close: vi.fn() };
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => bitmap)
  );
  const renderer = createReviewPreviewRenderer({
    resources,
    readAsset: async () => new Blob(['image']),
    allocation: {
      describe: allocationInput,
      replaceLimits: (limits) => {
        if (limits.maximumManagedBytes > 400) throw new Error('admission refused');
      },
    },
  });
  const snapshot = scene();
  snapshot.background = {
    enabled: true,
    type: 'image',
    assetId: 'asset:background',
    imageFit: 'contain',
    layout: { padding: 0, cornerRadius: 0 },
  };
  await expect(
    renderer.prepare(snapshot, dimensions, new AbortController().signal)
  ).rejects.toThrow('admission refused');
  expect(bitmap.close).toHaveBeenCalledOnce();
  expect(resources.bytes).not.toHaveBeenCalled();
  renderer.dispose();
});

it('evaluates the immutable outer plan at each represented frame after watermark and blackout', async () => {
  const { resources, leases } = setup();
  const renderer = createReviewPreviewRenderer({ resources });
  const settings = createNewWorkspacePresentationSettings();
  settings.color = '#ff0000ff';
  const result = planReviewPresentationSequence({
    settings,
    mainDuration: 4,
    fragmentOffset: 0,
    includeBookends: true,
    rate: { numerator: 60, denominator: 1 },
  });
  if (!result.ok) throw new Error('Expected valid plan');
  const input = { ...scene(), outerFadePlan: result.plan };
  const prepared = await renderer.prepare(input, dimensions, new AbortController().signal);
  const first = await renderer.render(prepared, { ...frame(), resultTime: 0.2 });
  expect(io.order.slice(-3)).toEqual(['watermark', 'blackout', 'outer-fade']);
  expect(leases[0]!.context.fillRect).toHaveBeenCalledExactlyOnceWith(0, 0, 640, 360);
  expect(leases[0]!.context.globalAlpha).toBeCloseTo(0.5);
  expect(leases[0]!.context.fillStyle).toBe('#ff0000ff');
  expect(leases[0]!.context.globalCompositeOperation).toBe('source-over');
  first.release();
  (await renderer.render(prepared, { ...frame(), resultTime: 1 })).release();
  expect(leases[1]!.context.globalAlpha).toBe(0);
  expect(io.watermark).toHaveBeenCalledOnce();
  (await renderer.render(prepared, { ...frame(), resultTime: 4 })).release();
  expect(leases[2]!.context.globalAlpha).toBe(1);
  renderer.dispose();
});

it('dissolves independently composed zoom poses instead of blending their source rasters', async () => {
  const { resources, leases } = setup();
  const renderer = createReviewPreviewRenderer({ resources });
  const input = scene();
  input.zoomRegions = [
    {
      ...createQuickEditZoomRegion({ id: 'left', at: 0, duration: 2 }),
      transform: { scale: 2, centerX: 0.5, centerY: 0.5 },
      enter: { type: 'none', duration: 0 },
      exit: { type: 'none', duration: 0 },
      depthOfField: { ...DEFAULT_QUICK_EDIT_DEPTH, enabled: true, strength: 0.25 },
      perspective: { enabled: true, rotateX: 15, rotateY: 0, rotateZ: 0, strength: 0.5 },
    },
    {
      ...createQuickEditZoomRegion({ id: 'right', at: 2, duration: 2 }),
      transform: { scale: 3, centerX: 0.5, centerY: 0.5 },
      enter: { type: 'none', duration: 0 },
      exit: { type: 'none', duration: 0 },
      depthOfField: { ...DEFAULT_QUICK_EDIT_DEPTH, enabled: true, strength: 0.75 },
      perspective: { enabled: true, rotateX: -10, rotateY: 0, rotateZ: 0, strength: 0.5 },
    },
  ];
  const prepared = await renderer.prepare(input, dimensions, new AbortController().signal);
  const left = { timestamp: 1.9, draw: vi.fn(), close: vi.fn() };
  const right = { timestamp: 4, draw: vi.fn(), close: vi.fn() };
  for (const time of [1.8, 2, 2.2]) {
    io.frame.mockClear();
    io.frame.mockImplementation((context, request) => {
      request.sample.draw(context, 0, 0, 10, 10);
      request.drawOverlays?.(null);
    });
    io.overlays.mockClear();
    const admitted = { ...frame(), resultTime: time, sourceTime: time < 2 ? time : time + 2 };
    admitted.source.timestamp = admitted.sourceTime;
    const blend = reviewCutTransitionAt(time, [
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
    const output = await renderer.render(prepared, {
      ...admitted,
      transition: { blend, frames: { left, right } },
    });
    expect(io.frame).toHaveBeenCalledTimes(2);
    expect(io.frame.mock.calls.map((call) => call[1].cameraScale)).toEqual([2, 3]);
    const poses = io.frame.mock.calls.map((call) => call[1].layout.spatial);
    expect(poses[0].rotation).not.toEqual(poses[1].rotation);
    expect(poses.map((pose) => pose.focus[0].settings.strength)).toEqual([0.25, 0.75]);
    expect(io.overlays.mock.calls.map((call) => call[0].globalResultTime)[0]).toBeLessThan(2);
    expect(
      io.overlays.mock.calls.map((call) => call[0].globalResultTime)[1]
    ).toBeGreaterThanOrEqual(2);
    expect(leases.at(-1)?.release).toHaveBeenCalledOnce();
    output.release();
  }
  expect(left.draw.mock.contexts.every((context) => context === left || context === right)).toBe(
    true
  );
  expect(right.draw.mock.contexts.every((context) => context === right)).toBe(true);
  expect(left.close).not.toHaveBeenCalled();
  expect(right.close).not.toHaveBeenCalled();
  prepared.release();
  renderer.dispose();
});

it('admits the full output dissolve scratch and endpoint overlays before acquiring publication', async () => {
  const { resources } = setup();
  const input = allocationInput();
  input.admission.transition = [
    { kind: 'video-frame', allocationBytes: 100 },
    { kind: 'video-frame', allocationBytes: 200 },
  ];
  input.scene.transitionRaster = { width: 10, height: 10 };
  const replaceLimits = vi.fn();
  const renderer = createReviewPreviewRenderer({
    resources,
    allocation: { describe: () => input, replaceLimits },
  });
  const snapshot = scene();
  snapshot.zoomRegions = [
    {
      ...createQuickEditZoomRegion({ id: 'border', at: 2, duration: 2 }),
      border: (
        await import('../../features/video/project/scene/focus-appearance')
      ).createQuickEditBorder(),
    },
  ];
  const prepared = await renderer.prepare(snapshot, dimensions, new AbortController().signal);
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
  const endpoint = { timestamp: 1.9, draw: vi.fn(), close: vi.fn() };
  const output = await renderer.render(prepared, {
    ...frame(),
    resultTime: 1.8,
    transition: { blend, frames: { left: endpoint, right: { ...endpoint, timestamp: 4 } } },
  });
  const limits = replaceLimits.mock.calls.at(-1)![0];
  expect(limits.maximumManagedBytes).toBeGreaterThanOrEqual(3 * 640 * 360 * 4 + 1300);
  expect(limits.maximumCanvases).toBeGreaterThanOrEqual(4);
  expect(resources.canvas).toHaveBeenCalledWith('preview-transition-source', dimensions.backing);
  output.release();
  prepared.release();
  renderer.dispose();
});
