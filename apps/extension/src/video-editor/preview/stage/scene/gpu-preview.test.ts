// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import {
  createProject,
  createVideoClip,
} from '../../../../features/video/project/timeline/project-meta.test.helpers';
import { resolveVideoCompositionRenderPasses } from '../../../../features/video/composition/timeline/render';
import {
  GpuPreviewDeviceError,
  type GpuPreviewRenderer,
} from '../../../../features/video/composition/canvas/gpu-preview';
import { createNativeGpuPreviewRenderer } from './gpu-preview';
import { projectQuickEditPoint } from '../../../../features/video/composition/motion/spatial-geometry';
import type { renderPreviewScene } from './render-preview';
import { createSceneGradientBackground } from '../../../../features/video/project/scene/background-gradient';
import { DEFAULT_WINDOW_HEADER } from '@sniptale/runtime-contracts/window-header';
import { windowHeaderImageKey } from '../../../../features/video/composition/draw/window-header';

vi.mock('../../../../features/video/composition/draw/video', async (original) => ({
  ...(await original<typeof import('../../../../features/video/composition/draw/video')>()),
  drawVideoLayer: vi.fn(),
}));
const owners: ReturnType<typeof createNativeGpuPreviewRenderer>[] = [];
afterEach(() => {
  for (const owner of owners.splice(0)) owner.dispose();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function fixture() {
  const clip = createVideoClip({
    transform: { x: 0, y: 0, width: 8, height: 4, rotation: 0, opacity: 1 },
  });
  const project = createProject([clip]);
  project.width = 8;
  project.height = 4;
  const canvas = document.createElement('canvas');
  Object.defineProperties(canvas, { clientWidth: { value: 8 }, clientHeight: { value: 4 } });
  canvas.width = 8;
  canvas.height = 4;
  const video = document.createElement('video');
  Object.defineProperties(video, {
    videoWidth: { value: 8 },
    videoHeight: { value: 4 },
    readyState: { value: 4 },
  });
  const captured: { close: ReturnType<typeof vi.fn>; copyTo: ReturnType<typeof vi.fn> }[] = [];
  vi.stubGlobal(
    'VideoFrame',
    class {
      displayWidth = 8;
      displayHeight = 4;
      close = vi.fn();
      copyTo = vi.fn();
      constructor() {
        captured.push(this);
      }
    }
  );
  const bitmap = Object.assign(document.createElement('canvas'), { close: vi.fn() });
  bitmap.width = 8;
  bitmap.height = 4;
  bitmap.getContext('2d')!.fillStyle = '#0000ff';
  bitmap.getContext('2d')!.fillRect(0, 0, 8, 4);
  const render = vi.fn<GpuPreviewRenderer['render']>(async () => bitmap);
  const dispose = vi.fn();
  const create = vi.fn(async () => ({ render, dispose, allocatedBytes: 0 }));
  const owner = createNativeGpuPreviewRenderer(create);
  owners.push(owner);
  const input: Parameters<typeof renderPreviewScene>[0] = {
    project,
    canvas,
    stage: null,
    imageBank: {},
    currentTime: 1,
    videoRefs: { current: { [clip.id]: video } },
    signal: new AbortController().signal,
  };
  const finish = vi.fn();
  const passes = resolveVideoCompositionRenderPasses(project, 1);
  return { owner, input, passes, finish, render, dispose, create, bitmap, captured };
}

it('retains a source-density header at the exact direct-video boundary and releases its pixels', async () => {
  const f = fixture();
  const layer = f.passes.overlayFrame.visualLayers[0];
  if (layer?.kind !== 'video') throw new Error('Expected video');
  layer.clip.windowHeader = DEFAULT_WINDOW_HEADER;
  const image = document.createElement('img');
  Object.defineProperties(image, {
    naturalWidth: { value: 931 },
    naturalHeight: { value: 50 },
    complete: { value: true },
  });
  f.input.imageBank[windowHeaderImageKey(layer.clipId, DEFAULT_WINDOW_HEADER)] = image;
  vi.spyOn(Object.getPrototypeOf(f.input.canvas.getContext('2d')), 'drawImage').mockImplementation(
    () => {}
  );
  await f.owner.render(f.input, f.passes, f.finish, () => false);
  await f.owner.render(f.input, f.passes, f.finish, () => false);
  const first = f.render.mock.calls[0]![0].layers;
  const second = f.render.mock.calls[1]![0].layers;
  const header = first.find((node) => node.clampSourceEdges?.includes('bottom'));
  const video = first.find((node) => node.source instanceof VideoFrame);
  expect(header).toBeDefined();
  expect(video).toBeDefined();
  expect(header!.rect.y + header!.rect.height).toBeCloseTo(video!.rect.y, 12);
  expect(header!.inverse).toEqual(video!.inverse);
  expect(header!.clip).toEqual(video!.clip);
  expect(header!.source).toBe(second.find((node) => node.clampSourceEdges)?.source);
  expect(header!.cache).toEqual(second.find((node) => node.clampSourceEdges)?.cache);
  if (!(header!.source instanceof HTMLCanvasElement)) throw new Error('Expected header raster');
  expect([header!.source.width, header!.source.height]).toEqual([931, 50]);
  f.owner.dispose();
  expect(header!.source.width).toBe(0);
  expect(header!.source.height).toBe(0);
});

it('composes raw frames and publishes only after GPU completion and final overlays', async () => {
  const f = fixture();
  const completed = Promise.withResolvers<ImageBitmap>();
  f.render.mockReturnValueOnce(completed.promise);
  const published = vi.fn();
  f.input.canvas.addEventListener('sniptale-preview-frame', published);
  const drawing = f.owner.render(f.input, f.passes, f.finish, () => false);
  await vi.waitFor(() => expect(f.render).toHaveBeenCalledOnce());
  expect(f.finish).toHaveBeenCalledOnce();
  expect(published).not.toHaveBeenCalled();
  expect(f.captured[0]!.close).not.toHaveBeenCalled();
  completed.resolve(f.bitmap);
  expect(await drawing).toBe(true);
  expect(f.finish).toHaveBeenCalledOnce();
  expect(published).toHaveBeenCalledOnce();
  expect(f.captured[0]!.copyTo).not.toHaveBeenCalled();
  expect(f.captured[0]!.close).toHaveBeenCalledOnce();
  expect(f.bitmap.close).toHaveBeenCalledOnce();
  expect(f.render.mock.calls[0]![0].layers[2]!.source).toBe(f.captured[0]);
});

it('omits the final raster when the scene owner proves its producers have no output', async () => {
  const f = fixture();
  const published = vi.fn();
  f.input.canvas.addEventListener('sniptale-preview-frame', published);
  expect(await f.owner.render(f.input, f.passes, f.finish, () => false, undefined, false)).toBe(
    true
  );
  expect(f.finish).not.toHaveBeenCalled();
  expect(f.render.mock.calls[0]![0].layers).toHaveLength(3);
  expect(published).toHaveBeenCalledOnce();
  expect(f.captured[0]!.close).toHaveBeenCalledOnce();
});

it.each(['abort', 'seek'] as const)(
  'does not publish a completed obsolete GPU frame after %s',
  async (reason) => {
    const f = fixture();
    const controller = new AbortController();
    f.input.signal = controller.signal;
    let invalidated = false;
    const completed = Promise.withResolvers<ImageBitmap>();
    f.render.mockReturnValueOnce(completed.promise);
    const published = vi.fn();
    f.input.canvas.addEventListener('sniptale-preview-frame', published);
    const drawing = f.owner.render(f.input, f.passes, f.finish, () => invalidated);
    await vi.waitFor(() => expect(f.render).toHaveBeenCalledOnce());
    if (reason === 'abort') controller.abort();
    else invalidated = true;
    completed.resolve(f.bitmap);
    expect(await drawing).toBe(false);
    expect(f.finish).toHaveBeenCalledOnce();
    expect(published).not.toHaveBeenCalled();
    expect(f.captured[0]!.close).toHaveBeenCalledOnce();
    expect(f.bitmap.close).toHaveBeenCalledOnce();
  }
);

it('falls back as a complete frame when the adapter is absent or fails without retaining frames', async () => {
  const f = fixture();
  f.render.mockRejectedValueOnce(new GpuPreviewDeviceError('Device lost'));
  expect(await f.owner.render(f.input, f.passes, f.finish, () => false)).toBeUndefined();
  expect(f.finish).toHaveBeenCalledOnce();
  expect(f.captured[0]!.close).toHaveBeenCalledOnce();
  expect(f.dispose).toHaveBeenCalledOnce();
  expect(await f.owner.render(f.input, f.passes, f.finish, () => false)).toBeUndefined();
  expect(f.render).toHaveBeenCalledOnce();
  const absent = createNativeGpuPreviewRenderer(async () => null);
  owners.push(absent);
  expect(await absent.render(f.input, f.passes, f.finish, () => false)).toBeUndefined();
});

it('reuses immutable raster texture revisions and applies authored rotation to video and decoration', async () => {
  const f = fixture();
  f.passes.overlayFrame.visualLayers[0]!.rotation = 25;
  await f.owner.render(f.input, f.passes, f.finish, () => false);
  await f.owner.render(f.input, f.passes, f.finish, () => false);
  const first = f.render.mock.calls[0]![0].layers;
  const second = f.render.mock.calls[1]![0].layers;
  expect(first[0]!.cache).toEqual(second[0]!.cache);
  expect(first[1]!.cache).toEqual(second[1]!.cache);
  expect(first[1]!.inverse).toEqual(first[2]!.inverse);
  expect(first[2]!.inverse).not.toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1]);
});

it.each(['motion', 'gradient'] as const)(
  'reuses a disabled background with remembered %s animation and invalidates when enabled',
  async (kind) => {
    const f = fixture();
    f.input.project.sceneBackground =
      kind === 'motion'
        ? {
            kind: 'solid',
            color: '#123456',
            enabled: false,
            motion: { mode: 'drift', intensity: 100, speed: 100 },
          }
        : {
            ...createSceneGradientBackground(),
            enabled: false,
            animation: { mode: 'breathe', intensity: 100, speed: 100 },
          };
    const original = structuredClone(f.input.project);
    await f.owner.render(f.input, f.passes, f.finish, () => false);
    f.input.currentTime = 1.5;
    await f.owner.render(f.input, f.passes, f.finish, () => false);
    const background = (index: number) => f.render.mock.calls[index]![0].layers[0]!;
    expect(background(1).source).toBe(background(0).source);
    expect(background(1).cache).toEqual(background(0).cache);
    delete f.input.project.sceneBackground.enabled;
    await f.owner.render(f.input, f.passes, f.finish, () => false);
    expect(background(2).cache).not.toEqual(background(1).cache);
    f.input.currentTime = 2;
    await f.owner.render(f.input, f.passes, f.finish, () => false);
    expect(background(3).cache).not.toEqual(background(2).cache);
    f.input.project.sceneBackground.enabled = false;
    await f.owner.render(f.input, f.passes, f.finish, () => false);
    expect(background(4).cache).not.toEqual(background(3).cache);
    f.input.currentTime = 2.5;
    await f.owner.render(f.input, f.passes, f.finish, () => false);
    expect(background(5).cache).toEqual(background(4).cache);
    expect(f.input.project).toEqual(original);
  }
);

it('keeps identity decoded frames on the direct texture route and reuses static raster revisions', async () => {
  const f = fixture();
  const clipId = f.passes.overlayFrame.visualLayers[0]!.clipId;
  const draw = vi.fn();
  const toVideoFrame = vi.fn(() => new VideoFrame(f.bitmap, { timestamp: 1_000_000 }));
  f.input.decodedVideoFrames = new Map([
    [
      clipId,
      {
        sourceWidth: 8,
        sourceHeight: 4,
        orientation: { rotation: 0, flip: false },
        draw,
        toVideoFrame,
      },
    ],
  ]);
  await f.owner.render(f.input, f.passes, f.finish, () => false);
  await f.owner.render(f.input, f.passes, f.finish, () => false);
  const first = f.render.mock.calls[0]![0].layers;
  const second = f.render.mock.calls[1]![0].layers;
  expect(first.some((layer) => 'kind' in layer.source && layer.source.kind === 'group')).toBe(
    false
  );
  expect(first[2]!.source).toBe(f.captured[0]);
  expect(second[2]!.source).toBe(f.captured[1]);
  expect(first[0]!.source).toBe(second[0]!.source);
  expect(first[1]!.source).toBe(second[1]!.source);
  expect(first[0]!.cache).toEqual(second[0]!.cache);
  expect(first[1]!.cache).toEqual(second[1]!.cache);
  expect(draw).not.toHaveBeenCalled();
  expect(toVideoFrame).toHaveBeenCalledTimes(2);
  for (const frame of f.captured) {
    expect(frame.copyTo).not.toHaveBeenCalled();
    expect(frame.close).toHaveBeenCalledOnce();
  }
});

it('preserves oriented decoded sources in the general GPU graph', async () => {
  const f = fixture();
  const clipId = f.passes.overlayFrame.visualLayers[0]!.clipId;
  const draw = vi.fn();
  f.input.decodedVideoFrames = new Map([
    [
      clipId,
      {
        sourceWidth: 4,
        sourceHeight: 8,
        orientation: { rotation: 90, flip: true },
        draw,
        toVideoFrame: () => new VideoFrame(f.bitmap, { timestamp: 1_000_000 }),
      },
    ],
  ]);
  expect(await f.owner.render(f.input, f.passes, f.finish, () => false)).toBe(true);
  const find = (
    layers: readonly import('../../../../features/video/composition/canvas/gpu-preview').GpuPreviewLayer[]
  ): boolean =>
    layers.some(
      (layer) =>
        (layer.orientation?.rotation === 90 && layer.orientation.flip) ||
        ('kind' in layer.source && layer.source.kind === 'group' && find(layer.source.layers))
    );
  expect(find(f.render.mock.calls[0]![0].layers)).toBe(true);
  expect(draw).not.toHaveBeenCalled();
});

it('retains exact-density DOF source masks and caches static artwork without a redundant identity target', async () => {
  const f = fixture();
  const camera = {
    ...f.passes.overlayFrame.camera,
    spatial: {
      rotation: [0, 0, 0, 1] as const,
      perspective: 1,
      windowMotion: 1,
      lockBackground: true,
      reference: { x: 0, y: 0, width: 8, height: 4 },
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
  f.passes.overlayFrame.camera = camera;
  f.passes.visualPasses[0]!.frame.camera = camera;
  const clipId = f.passes.overlayFrame.visualLayers[0]!.clipId;
  f.input.decodedVideoFrames = new Map([
    [
      clipId,
      {
        sourceWidth: 8,
        sourceHeight: 4,
        draw: vi.fn(),
        toVideoFrame: () => new VideoFrame(f.bitmap, { timestamp: 1_000_000 }),
      },
    ],
  ]);
  const walk = (
    nodes: readonly import('../../../../features/video/composition/canvas/gpu-preview').GpuPreviewLayer[]
  ): import('../../../../features/video/composition/canvas/gpu-preview').GpuPreviewLayer[] =>
    nodes.flatMap((node) => [
      node,
      ...('kind' in node.source && node.source.kind === 'group' ? walk(node.source.layers) : []),
    ]);
  await f.owner.render(f.input, f.passes, f.finish, () => false);
  await f.owner.render(f.input, f.passes, f.finish, () => false);
  const first = walk(f.render.mock.calls[0]![0].layers),
    second = walk(f.render.mock.calls[1]![0].layers);
  expect(
    first.filter((node) => 'kind' in node.source && node.source.kind === 'group')
  ).toHaveLength(1);
  const depth = first.find((node) => node.depth)!;
  expect(depth.depth?.frame.focus).toEqual(camera.spatial.focus);
  expect(depth.rect).toEqual({ x: -128, y: -128, width: 264, height: 260 });
  if (!('kind' in depth.source) || depth.source.kind !== 'group')
    throw new Error('Expected DOF source');
  expect(depth.source.output).toEqual({ width: 264, height: 260 });
  expect(depth.source.logical).toEqual({ width: 264, height: 260 });
  const staticArtwork = (nodes: typeof first) => [
    ...nodes
      .filter((node) => node.source instanceof HTMLCanvasElement && node.cache)
      .map((node) => ({ source: node.source, cache: node.cache })),
    ...nodes.flatMap((node) => (node.alphaMask ? [node.alphaMask] : [])),
  ];
  const firstStatic = staticArtwork(first);
  const secondStatic = staticArtwork(second);
  expect(firstStatic).toHaveLength(2);
  const alphaMask = first.find((node) => node.alphaMask)!.alphaMask!;
  expect(alphaMask.rect).toEqual({ x: -128, y: -128, width: 264, height: 260 });
  expect(alphaMask.source.width).toBe(264);
  expect(alphaMask.source.height).toBe(260);
  expect(alphaMask.cache).toBeDefined();
  for (const [index, node] of firstStatic.entries()) {
    expect(node.source).toBe(secondStatic[index]!.source);
    expect(node.cache).toEqual(secondStatic[index]!.cache);
  }
  expect(
    first.filter((node) => node.source instanceof HTMLCanvasElement && !node.cache)
  ).toHaveLength(1);
  expect(first.map((node) => node.source)).toContain(f.captured[0]);
  expect(second.map((node) => node.source)).toContain(f.captured[1]);
  const adjusted = {
    ...camera,
    spatial: {
      ...camera.spatial,
      focus: [
        {
          ...camera.spatial.focus[0]!,
          settings: { ...camera.spatial.focus[0]!.settings, strength: 0.75 },
        },
      ],
    },
  };
  f.passes.overlayFrame.camera = adjusted;
  f.passes.visualPasses[0]!.frame.camera = adjusted;
  await f.owner.render(f.input, f.passes, f.finish, () => false);
  const third = walk(f.render.mock.calls[2]![0].layers);
  expect(third.find((node) => node.depth)!.depth!.frame.focus[0]!.settings.strength).toBe(0.75);
  expect(depth.depth!.frame.focus[0]!.settings.strength).toBe(0.5);
  expect(staticArtwork(third).map((node) => node.cache)).toEqual(
    firstStatic.map((node) => node.cache)
  );
});

it('keeps the isolated GPU mask when an inner source transform uses a different coordinate plane', async () => {
  const f = fixture();
  const camera = {
    ...f.passes.overlayFrame.camera,
    spatial: {
      rotation: [0, 0, 0, 1] as const,
      perspective: 1,
      windowMotion: 1,
      lockBackground: true,
      reference: { x: 0, y: 0, width: 8, height: 4 },
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
  f.passes.overlayFrame.camera = camera;
  f.passes.visualPasses[0]!.frame.camera = camera;
  const layer = f.passes.overlayFrame.visualLayers[0]!;
  if (layer.kind !== 'video') throw new Error('Expected video');
  layer.sourceContentTransform = [1.2, 0, -2, 0, 1.2, -1, 0, 0, 1];
  expect(await f.owner.render(f.input, f.passes, f.finish, () => false)).toBe(true);
  const walk = (
    nodes: readonly import('../../../../features/video/composition/canvas/gpu-preview').GpuPreviewLayer[]
  ): import('../../../../features/video/composition/canvas/gpu-preview').GpuPreviewLayer[] =>
    nodes.flatMap((node) => [
      node,
      ...('kind' in node.source && node.source.kind === 'group' ? walk(node.source.layers) : []),
    ]);
  const nodes = walk(f.render.mock.calls[0]![0].layers);
  expect(
    nodes.filter((node) => 'kind' in node.source && node.source.kind === 'group')
  ).toHaveLength(1);
  expect(nodes.some((node) => node.alphaMask)).toBe(false);
});

it('uses a GPU source group for inner source effects instead of the legacy renderer', async () => {
  const f = fixture();
  const layer = f.passes.overlayFrame.visualLayers[0]!;
  if (layer.kind !== 'video') throw new Error('Expected video fixture');
  layer.sourceContentTransform = [2, 0, 0, 0, 2, 0, 0, 0, 1];
  expect(await f.owner.render(f.input, f.passes, f.finish, () => false)).toBe(true);
  expect(f.create).toHaveBeenCalledOnce();
  expect(f.render).toHaveBeenCalledOnce();
  expect(
    f.render.mock.calls[0]![0].layers.some(
      (item) => 'kind' in item.source && item.source.kind === 'group'
    )
  ).toBe(true);
});

it('propagates graph failures rather than silently switching a valid GPU to the old renderer', async () => {
  const f = fixture();
  f.render.mockRejectedValueOnce(new Error('Malformed graph'));
  await expect(f.owner.render(f.input, f.passes, f.finish, () => false)).rejects.toThrow(
    'Malformed graph'
  );
  expect(f.dispose).not.toHaveBeenCalled();
  expect(f.captured[0]!.close).toHaveBeenCalledOnce();
});

it.each(['clip', 'video-group', 'transition', 'chain'] as const)(
  'prepares %s EffectV1 inputs through the Native GPU entry without Canvas media materialization',
  async (kind) => {
    const f = fixture();
    const timeline = await import('../../../../features/video/composition/timeline/render');
    const { renderPreviewScene } = await import('./render-preview');
    f.render.mockImplementation(async () => {
      const bitmap = Object.assign(document.createElement('canvas'), { close: vi.fn() });
      bitmap.width = 8;
      bitmap.height = 4;
      return bitmap;
    });
    const spatial = await import('../../../../features/video/composition/draw/spatial');
    vi.spyOn(spatial, 'drawSpatialCompositionGroup').mockImplementation(() => {
      throw new Error('Legacy spatial input forbidden');
    });
    const effectDraw = await import('../../../../features/video/composition/draw/effect-runtime');
    vi.spyOn(effectDraw, 'drawEffectRuntimeVisualLayer').mockImplementation(() => {
      throw new Error('Canvas effect bitmap composition forbidden');
    });
    const sourceLayer = f.passes.overlayFrame.visualLayers[0]!;
    const other = { ...sourceLayer, clipId: 'other' };
    const base: import('../../../../features/video/composition/effect-runtime/runtime/types').EffectRuntimeFramePlan =
      {
        assets: [],
        controls: {},
        dimensions: { width: 8, height: 4 },
        renderDimensions: { width: 8, height: 4 },
        documentSha256: 'a'.repeat(64),
        documentSource: '{}',
        duration: 2,
        effectInstanceId: 'fx',
        fps: 30,
        frameIndex: 30,
        kind: 'targetEffect',
        progress: 0.5,
        snapshotId: 'snapshot',
        time: 1,
        target: {
          kind: 'clip',
          clipId: sourceLayer.clipId,
          chainIndex: 0,
          placement: { x: 0, y: 0, width: 8, height: 4, opacity: 1, rotation: 0 },
        },
      };
    if (kind === 'video-group')
      base.target = { kind: 'video-group', clipIds: [sourceLayer.clipId] };
    if (kind === 'transition') {
      base.kind = 'transition';
      base.target = {
        kind: 'transition',
        leadingClipId: sourceLayer.clipId,
        trailingClipId: 'other',
        transitionId: 'join',
      };
    }
    const frame = {
      ...f.passes.overlayFrame,
      effectInputLayers: [sourceLayer, other],
      effectRuntimePlans: [
        base,
        ...(kind === 'chain'
          ? [
              {
                ...base,
                effectInstanceId: 'fx2',
                target: {
                  kind: 'clip' as const,
                  clipId: sourceLayer.clipId,
                  chainIndex: 1,
                  placement: { x: 0, y: 0, width: 8, height: 4, opacity: 1, rotation: 0 },
                },
              },
            ]
          : []),
      ],
    };
    vi.spyOn(timeline, 'resolveVideoCompositionRenderPasses').mockReturnValue({
      ...f.passes,
      overlayFrame: frame,
      visualPasses: [{ ...f.passes.visualPasses[0]!, frame }],
    });
    const draw = vi.fn(() => {
      throw new Error('Raw video Canvas draw forbidden');
    });
    const decoded = {
      sourceWidth: 8,
      sourceHeight: 4,
      draw,
      toVideoFrame: () => new VideoFrame(f.input.canvas, { timestamp: 1_000_000 }),
    };
    f.input.videoRefs = { current: {} };
    f.input.decodedVideoFrames = new Map([
      [sourceLayer.clipId, decoded],
      ['other', decoded],
    ]);
    const outputs: ImageBitmap[] = [];
    f.input.effectRuntimeExecutor = {
      dispose: vi.fn(),
      renderFrame: vi.fn<
        import('../../../../contracts/effect-runtime/types').EffectRuntimeSandboxExecutor['renderFrame']
      >(async (request) => {
        expect(f.render).toHaveBeenCalled();
        for (const input of Object.values(request.inputFrames)) input.bitmap.close();
        const bitmap = Object.assign(document.createElement('canvas'), { close: vi.fn() });
        bitmap.width = 8;
        bitmap.height = 4;
        outputs.push(bitmap);
        return {
          kind: 'frame',
          bitmap,
          width: 8,
          height: 4,
          requestId: request.requestId,
          sequenceId: request.sequenceId,
          effectInstanceId: request.effectInstanceId,
          snapshotId: request.snapshotId,
          acknowledged: {
            assetSelectionId: request.assetSelectionRef.id,
            documentId: request.documentRef.id,
          },
        };
      }),
    };
    await expect(renderPreviewScene({ ...f.input, gpuPreview: f.owner })).resolves.not.toBe(false);
    expect(draw).not.toHaveBeenCalled();
    expect(f.render.mock.calls.length).toBe(kind === 'transition' ? 3 : 2);
    const inputs = f.render.mock.calls.slice(0, -1);
    expect(
      inputs.every(([request]) => request.output.width === 8 && request.output.height === 4)
    ).toBe(true);
    for (const captured of f.captured) {
      expect(captured.copyTo).not.toHaveBeenCalled();
      expect(captured.close).toHaveBeenCalledOnce();
    }
    for (const bitmap of outputs) expect(bitmap.close).toHaveBeenCalledOnce();
  }
);

it('remembers typed input device failure even when an effect driver wraps the error', async () => {
  const f = fixture();
  f.render.mockRejectedValueOnce(new GpuPreviewDeviceError('Input queue lost'));
  const prepare = vi.fn(
    async (
      compose: import('../../../../features/video/composition/effect-runtime/frame/inputs').EffectRuntimeInputComposer
    ) => {
      try {
        await compose({
          dimensions: { width: 8, height: 4 },
          renderDimensions: { width: 8, height: 4 },
          layers: f.passes.overlayFrame.visualLayers,
          frames: new Map(),
          applyCamera: false,
        });
      } catch {
        throw new Error('EFFECT_RUNTIME_INPUT_MATERIALIZATION_FAILED');
      }
      return undefined;
    }
  );
  expect(await f.owner.render(f.input, f.passes, f.finish, () => false, prepare)).toBeUndefined();
  expect(prepare).toHaveBeenCalledOnce();
  expect(f.dispose).toHaveBeenCalledOnce();
  for (const source of f.captured) expect(source.close).toHaveBeenCalledOnce();
});

it('keeps raw source alive through an aborted effect input fence and closes the late bitmap', async () => {
  const f = fixture();
  const fence = Promise.withResolvers<ImageBitmap>();
  f.render.mockReturnValueOnce(fence.promise);
  const abort = new AbortController();
  f.input.signal = abort.signal;
  const drawing = f.owner.render(
    f.input,
    f.passes,
    f.finish,
    () => false,
    async (compose) => {
      try {
        await compose({
          dimensions: { width: 8, height: 4 },
          renderDimensions: { width: 8, height: 4 },
          layers: f.passes.overlayFrame.visualLayers,
          frames: new Map(),
          applyCamera: false,
        });
      } catch {
        throw new Error('EFFECT_RUNTIME_INPUT_MATERIALIZATION_FAILED');
      }
      return undefined;
    }
  );
  await vi.waitFor(() => expect(f.render).toHaveBeenCalledOnce());
  expect(f.captured[0]!.close).not.toHaveBeenCalled();
  abort.abort();
  fence.resolve(f.bitmap);
  expect(await drawing).toBe(false);
  expect(f.bitmap.close).toHaveBeenCalledOnce();
  expect(f.captured[0]!.close).toHaveBeenCalledOnce();
  expect(f.finish).not.toHaveBeenCalled();
});

it('reuses only immutable mask pixels through the production general renderer', async () => {
  const f = fixture();
  const layer = f.passes.overlayFrame.visualLayers[0]!;
  if (layer.kind !== 'video') throw new Error('Expected video');
  layer.sourceContentTransform = [1, 0, 1, 0, 1, 0, 0, 0, 1];
  const findMask = (
    layers: readonly import('../../../../features/video/composition/canvas/gpu-preview').GpuPreviewLayer[]
  ):
    | import('../../../../features/video/composition/canvas/gpu-preview').GpuPreviewLayer
    | undefined => {
    for (const node of layers) {
      if (node.cache?.key === 'native-source-mask') return node;
      if ('kind' in node.source && node.source.kind === 'group') {
        const match = findMask(node.source.layers);
        if (match) return match;
      }
    }
    return undefined;
  };
  expect(await f.owner.render(f.input, f.passes, f.finish, () => false)).toBe(true);
  expect(
    await f.owner.render({ ...f.input, currentTime: 1.1 }, f.passes, f.finish, () => false)
  ).toBe(true);
  const first = findMask(f.render.mock.calls[0]![0].layers);
  const second = findMask(f.render.mock.calls[1]![0].layers);
  expect(first).toBeDefined();
  expect(second?.source).toBe(first?.source);
  expect(second?.cache).toEqual(first?.cache);
  expect(f.captured).toHaveLength(2);
  expect(f.captured.every((frame) => frame.close.mock.calls.length === 1)).toBe(true);
  if (!(first?.source instanceof HTMLCanvasElement)) throw new Error('Expected retained mask');
  expect(first.source.width).toBeGreaterThan(0);
  f.owner.dispose();
  expect([first.source.width, first.source.height]).toEqual([0, 0]);
});

function directFixture() {
  const f = fixture();
  const present = vi
    .fn<(request: Parameters<GpuPreviewRenderer['render']>[0]) => Promise<void>>()
    .mockResolvedValue(undefined);
  const backend = {
    render: f.render,
    dispose: f.dispose,
    allocatedBytes: 0,
    createSurface: vi.fn(),
  };
  f.create.mockResolvedValue(backend);
  const releaseOutput = vi.fn();
  const targets: HTMLCanvasElement[] = [];
  f.input.acquireGpuOutput = vi.fn((size, provider) => {
    expect(provider).toBe(backend);
    const canvas = Object.assign(document.createElement('canvas'), size);
    targets.push(canvas);
    return { canvas, surface: { canvas, present, dispose: vi.fn() }, release: releaseOutput };
  });
  return { ...f, present, backend, targets, releaseOutput };
}

it('presents the full Native graph and letterbox on a leased GPU target without a 2D publication', async () => {
  const f = directFixture();
  const root = document.createElement('canvas');
  Object.defineProperties(root, { clientWidth: { value: 12 }, clientHeight: { value: 8 } });
  f.input.canvas = root;
  const getContext = vi.spyOn(root, 'getContext');
  f.input.stagingCanvas = vi.fn(() => {
    throw new Error('Direct output must not acquire staging');
  });
  const layer = f.passes.overlayFrame.visualLayers[0];
  if (!layer || layer.kind !== 'video') throw new Error('Expected video');
  layer.sourceContentTransform = [1, 0, 0.2, 0, 1, 0, 0, 0, 1];
  const fence = Promise.withResolvers<void>();
  f.present.mockReturnValueOnce(fence.promise);
  const published = vi.fn();
  root.addEventListener('sniptale-preview-frame', published);
  const pending = f.owner.render(f.input, f.passes, f.finish, () => false);
  await vi.waitFor(() => expect(f.present).toHaveBeenCalledOnce());
  expect(f.captured[0]!.close).not.toHaveBeenCalled();
  expect(f.releaseOutput).not.toHaveBeenCalled();
  expect(published).not.toHaveBeenCalled();
  expect(f.render).not.toHaveBeenCalled();
  expect(f.input.stagingCanvas).not.toHaveBeenCalled();
  expect(getContext).not.toHaveBeenCalled();
  const request = f.present.mock.calls[0]![0];
  expect(request.output).toEqual({ width: 12, height: 8 });
  expect(request.logical).toEqual({ width: 12, height: 8 });
  expect(request.layers).toHaveLength(2);
  expect(request.layers[1]!.rect).toEqual({ x: 0, y: 1, width: 12, height: 6 });
  const group = request.layers[1]!.source;
  if (!('kind' in group) || group.kind !== 'group')
    throw new Error('Expected full composition group');
  expect(group.logical).toEqual(f.input.project);
  expect(group.layers.length).toBeGreaterThan(1);
  expect(f.finish).toHaveBeenCalledOnce();
  fence.resolve();
  const result = await pending;
  if (!result || typeof result !== 'object') throw new Error('Expected GPU output');
  expect(result.canvas).toBe(f.targets[0]);
  expect(f.captured[0]!.close).toHaveBeenCalledOnce();
  expect(published).not.toHaveBeenCalled();
  result.release();
  result.release();
  expect(f.releaseOutput).toHaveBeenCalledOnce();
});

it('keeps a published GPU provider while disposal drains a pending frame and its CPU materials', async () => {
  const f = directFixture();
  const first = await f.owner.render(f.input, f.passes, f.finish, () => false);
  if (!first || typeof first !== 'object') throw new Error('Expected GPU output');
  const background = f.present.mock.calls[0]![0].layers[0]!.source;
  if (!(background instanceof HTMLCanvasElement)) throw new Error('Expected retained background');
  const fence = Promise.withResolvers<void>();
  f.present.mockReturnValueOnce(fence.promise);
  const pending = f.owner.render(f.input, f.passes, f.finish, () => false);
  await vi.waitFor(() => expect(f.present).toHaveBeenCalledTimes(2));
  f.owner.dispose();
  expect(f.dispose).not.toHaveBeenCalled();
  expect(background.width).toBeGreaterThan(0);
  expect(f.captured[1]!.close).not.toHaveBeenCalled();
  expect(f.releaseOutput).not.toHaveBeenCalled();
  expect(await f.owner.render(f.input, f.passes, f.finish, () => false)).toBeUndefined();
  fence.resolve();
  expect(await pending).toBe(false);
  expect(f.captured[1]!.close).toHaveBeenCalledOnce();
  expect(f.releaseOutput).toHaveBeenCalledOnce();
  expect(background.width).toBe(0);
  expect(f.dispose).not.toHaveBeenCalled();
  expect(f.targets[0]).not.toBe(f.targets[1]);
  first.release();
  first.release();
  expect(f.releaseOutput).toHaveBeenCalledTimes(2);
  expect(f.dispose).toHaveBeenCalledOnce();
});

it.each(['abort', 'invalidated'] as const)(
  'releases a stale direct target only after its fence settles after %s',
  async (reason) => {
    const f = directFixture();
    const controller = new AbortController();
    f.input.signal = controller.signal;
    let invalidated = false;
    const fence = Promise.withResolvers<void>();
    f.present.mockReturnValueOnce(fence.promise);
    const pending = f.owner.render(f.input, f.passes, f.finish, () => invalidated);
    await vi.waitFor(() => expect(f.present).toHaveBeenCalledOnce());
    if (reason === 'abort') controller.abort();
    else invalidated = true;
    expect(f.releaseOutput).not.toHaveBeenCalled();
    expect(f.captured[0]!.close).not.toHaveBeenCalled();
    fence.resolve();
    expect(await pending).toBe(false);
    expect(f.releaseOutput).toHaveBeenCalledOnce();
    expect(f.captured[0]!.close).toHaveBeenCalledOnce();
  }
);

it.each(['device', 'contract'] as const)(
  'releases a failed direct target and preserves %s failure classification',
  async (reason) => {
    const f = directFixture();
    const error =
      reason === 'device'
        ? new GpuPreviewDeviceError('Device lost')
        : new Error('Invalid composition');
    f.present.mockRejectedValueOnce(error);
    const pending = f.owner.render(f.input, f.passes, f.finish, () => false);
    if (reason === 'device') await expect(pending).resolves.toBeUndefined();
    else await expect(pending).rejects.toBe(error);
    expect(f.releaseOutput).toHaveBeenCalledOnce();
    expect(f.captured[0]!.close).toHaveBeenCalledOnce();
    expect(f.dispose).toHaveBeenCalledTimes(reason === 'device' ? 1 : 0);
  }
);

it('keeps the old bitmap route and suppresses its frame event only when the caller defers it', async () => {
  const f = fixture();
  f.input.deferFrameEvent = true;
  const published = vi.fn();
  f.input.canvas.addEventListener('sniptale-preview-frame', published);
  expect(await f.owner.render(f.input, f.passes, f.finish, () => false)).toBe(true);
  expect(f.render).toHaveBeenCalledOnce();
  expect(f.bitmap.close).toHaveBeenCalledOnce();
  expect(published).not.toHaveBeenCalled();
});

it('declines direct output when the provider lacks surface support without acquiring staging or a target', async () => {
  const f = fixture();
  f.input.acquireGpuOutput = vi.fn(() => {
    throw new Error('Unexpected destination');
  });
  f.input.stagingCanvas = vi.fn(() => {
    throw new Error('Unexpected staging');
  });
  expect(await f.owner.render(f.input, f.passes, f.finish, () => false)).toBeUndefined();
  expect(f.input.acquireGpuOutput).not.toHaveBeenCalled();
  expect(f.input.stagingCanvas).not.toHaveBeenCalled();
  expect(f.finish).not.toHaveBeenCalled();
  expect(f.captured).toHaveLength(0);
});

it('passes plain STRETCH rectangles to the admitted renderer and preserves rotation', async () => {
  const f = fixture();
  const layer = f.passes.overlayFrame.visualLayers[0];
  if (!layer || layer.kind !== 'video') throw new Error('Expected video');
  layer.clip.fitMode = 'STRETCH';
  delete layer.clip.windowHeader;
  delete layer.clip.sourceCrop;
  layer.rotation = 45;
  const original = structuredClone(layer);
  expect(await f.owner.render(f.input, f.passes, f.finish, () => false)).toBe(true);
  const source = f.render.mock.calls[0]![0].layers.find((node) =>
    Object.is(node.source, f.captured[0])
  );
  expect(source).toBeDefined();
  const rect = { x: layer.x, y: layer.y, width: layer.width, height: layer.height };
  expect(source!.rect).toEqual(rect);
  expect(source!.clip?.rect).toEqual(rect);
  expect(Object.keys(source!.rect).sort()).toEqual(['height', 'width', 'x', 'y']);
  expect(Object.keys(source!.clip!.rect).sort()).toEqual(['height', 'width', 'x', 'y']);
  const centre = projectQuickEditPoint(source!.inverse, { x: 4, y: 2 });
  expect(centre?.x).toBeCloseTo(4, 10);
  expect(centre?.y).toBeCloseTo(2, 10);
  const turned = projectQuickEditPoint(source!.inverse, { x: 5, y: 2 });
  expect(turned?.x).toBeCloseTo(4 + Math.SQRT1_2, 10);
  expect(turned?.y).toBeCloseTo(2 - Math.SQRT1_2, 10);
  expect(layer).toEqual(original);
});

it('retains drift background pixels while GPU geometry follows programme time and camera', async () => {
  const f = fixture();
  f.input.project.width = 2560;
  f.input.project.height = 1440;
  f.input.project.sceneBackground = {
    ...createSceneGradientBackground(),
    motion: { mode: 'drift', intensity: 100, speed: 100 },
  };
  f.passes = resolveVideoCompositionRenderPasses(f.input.project, 1);
  const original = structuredClone(f.input.project);
  await f.owner.render(f.input, f.passes, f.finish, () => false);
  f.input.currentTime = 2;
  await f.owner.render(f.input, f.passes, f.finish, () => false);
  const background = (index: number) => {
    const pending = [...f.render.mock.calls[index]![0].layers];
    while (pending.length) {
      const layer = pending.pop()!;
      if (layer.cache?.key === 'native-background') return layer;
      if ('kind' in layer.source && layer.source.kind === 'group')
        pending.push(...layer.source.layers);
    }
    throw new Error('Expected project background');
  };
  const first = background(0);
  const second = background(1);
  expect(second.cache).toEqual(first.cache);
  expect(second.source).toBe(first.source);
  expect(second.rect).not.toEqual(first.rect);
  expect(first.source).toBeInstanceOf(HTMLCanvasElement);
  if (!(first.source instanceof HTMLCanvasElement)) throw new Error('Expected background paint');
  expect(first.source.width).toBe(2048);
  expect(first.source.height).toBe(1152);
  expect(second.clip).toEqual({
    rect: { x: 0, y: 0, width: 2560, height: 1440 },
    radius: 0,
    shape: 'hard-rect',
  });
  f.passes.overlayFrame.camera.backgroundCamera = { scale: 1.5, viewportX: 60, viewportY: 40 };
  await f.owner.render(f.input, f.passes, f.finish, () => false);
  const third = background(2);
  expect(third.cache).toEqual(first.cache);
  expect(third.inverse).toEqual([1 / 1.5, 0, 60, 0, 1 / 1.5, 40, 0, 0, 1]);
  expect(f.input.project).toEqual(original);
});

it.each(['glow', 'waves', 'blur', 'gradient-animation'] as const)(
  'keeps the existing changing raster for unsupported retained drift setting %s',
  async (setting) => {
    const f = fixture();
    f.input.project.sceneBackground = {
      ...createSceneGradientBackground(),
      motion: {
        mode: setting === 'glow' || setting === 'waves' ? setting : 'drift',
        intensity: 100,
        speed: 100,
      },
      ...(setting === 'blur' ? { blur: 1 } : {}),
      ...(setting === 'gradient-animation'
        ? { animation: { mode: 'breathe' as const, intensity: 100, speed: 100 } }
        : {}),
    };
    await f.owner.render(f.input, f.passes, f.finish, () => false);
    f.input.currentTime = 2;
    await f.owner.render(f.input, f.passes, f.finish, () => false);
    const first = f.render.mock.calls[0]![0].layers[0]!;
    const second = f.render.mock.calls[1]![0].layers[0]!;
    expect(second.cache).not.toEqual(first.cache);
    expect(second.rect).toEqual(first.rect);
    expect(second.clip).toBeUndefined();
  }
);

it.each(['speed', 'intensity'] as const)(
  'preserves exact dormant drift paint when %s is zero',
  async (zero) => {
    const f = fixture();
    f.input.project.sceneBackground = {
      ...createSceneGradientBackground(),
      motion: {
        mode: 'drift',
        speed: zero === 'speed' ? 0 : 100,
        intensity: zero === 'intensity' ? 0 : 100,
      },
    };
    await f.owner.render(f.input, f.passes, f.finish, () => false);
    f.input.currentTime = 2;
    await f.owner.render(f.input, f.passes, f.finish, () => false);
    const first = f.render.mock.calls[0]![0].layers[0]!;
    const second = f.render.mock.calls[1]![0].layers[0]!;
    expect(second.cache).toEqual(first.cache);
    expect(second.rect).toEqual({ x: 0, y: 0, width: 8, height: 4 });
    expect(second.clip).toBeUndefined();
  }
);

it.each(['paint', 'size', 'mode', 'image'] as const)(
  'replaces retained drift pixels after a %s change and disposes the paint',
  async (change) => {
    const f = fixture();
    const motion = { mode: 'drift' as const, speed: 100, intensity: 100 };
    f.input.project.sceneBackground =
      change === 'image'
        ? { kind: 'image', assetId: 'first', imageFit: 'cover', motion }
        : { ...createSceneGradientBackground(), motion };
    await f.owner.render(f.input, f.passes, f.finish, () => false);
    const first = f.render.mock.calls[0]![0].layers[0]!;
    const background = f.input.project.sceneBackground;
    f.input.project = {
      ...f.input.project,
      ...(change === 'size' ? { width: 10, height: 5 } : {}),
      sceneBackground:
        change === 'paint'
          ? { ...createSceneGradientBackground('#ff0000'), motion }
          : change === 'mode'
            ? { ...background, motion: { ...motion, mode: 'glow' } }
            : change === 'image' && background.kind === 'image'
              ? { ...background, assetId: 'second' }
              : background,
    };
    f.passes = resolveVideoCompositionRenderPasses(f.input.project, 1);
    await f.owner.render(f.input, f.passes, f.finish, () => false);
    const second = f.render.mock.calls[1]![0].layers[0]!;
    expect(second.cache).not.toEqual(first.cache);
    f.owner.dispose();
    expect(second.source).toBeInstanceOf(HTMLCanvasElement);
    if (!(second.source instanceof HTMLCanvasElement)) throw new Error('Expected background');
    expect(second.source.width).toBe(0);
  }
);

it('forwards final submission notification to the shared GPU request', async () => {
  const f = fixture();
  const submitted = vi.fn();
  f.input.onGpuSubmitted = submitted;
  f.render.mockImplementationOnce(async (request) => {
    expect(submitted).not.toHaveBeenCalled();
    request.onSubmitted?.();
    expect(submitted).toHaveBeenCalledOnce();
    return f.bitmap;
  });
  await f.owner.render(f.input, f.passes, f.finish, () => false);
  expect(submitted).toHaveBeenCalledOnce();
});
