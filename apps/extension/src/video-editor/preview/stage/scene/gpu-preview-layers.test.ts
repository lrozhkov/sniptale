// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import {
  createProject,
  createVideoClip,
  createTextClip,
} from '../../../../features/video/project/timeline/project-meta.test.helpers';
import { resolveVideoCompositionRenderPasses } from '../../../../features/video/composition/timeline/render';
import { createQuickEditSpotlight } from '../../../../features/video/project/scene/focus-appearance';
import type { GpuPreviewLayer } from '../../../../features/video/composition/canvas/gpu-preview';
import type { VideoCompositionFrameSource } from '../../../../features/video/composition/draw/media-source';
import type { renderPreviewScene } from './render-preview';
import { buildNativeGpuPreviewLayers } from './gpu-preview-layers';
import { DEFAULT_WINDOW_HEADER } from '@sniptale/runtime-contracts/window-header';
import { windowHeaderImageKey } from '../../../../features/video/composition/draw/window-header';
import { resolveDecoratedMediaFrame } from '../../../../features/video/project/window-geometry';

vi.mock('../../../../features/video/composition/draw/spotlight', async (original) => ({
  ...(await original<typeof import('../../../../features/video/composition/draw/spotlight')>()),
  createSceneSpotlightMasks: (
    size: { width: number; height: number },
    layers: readonly { blur: number }[] = []
  ) => {
    const dim = document.createElement('canvas'),
      blur = document.createElement('canvas');
    dim.width = blur.width = size.width;
    dim.height = blur.height = size.height;
    return {
      dim,
      blur,
      radius: Math.max(0, ...layers.map((layer) => layer.blur)),
      dispose() {
        dim.width = dim.height = blur.width = blur.height = 0;
      },
    };
  },
}));

const plans: Awaited<ReturnType<typeof buildNativeGpuPreviewLayers>>[] = [];
afterEach(() => {
  for (const plan of plans.splice(0)) plan.release();
  vi.unstubAllGlobals();
});

function flatten(layers: readonly GpuPreviewLayer[]): GpuPreviewLayer[] {
  const seen = new Set<object>();
  const visit = (items: readonly GpuPreviewLayer[]): GpuPreviewLayer[] =>
    items.flatMap((layer) => {
      if (!('kind' in layer.source) || layer.source.kind !== 'group' || seen.has(layer.source))
        return [layer];
      seen.add(layer.source);
      return [layer, ...visit(layer.source.layers)];
    });
  return visit(layers);
}

function fixture() {
  vi.stubGlobal(
    'VideoFrame',
    class {
      displayWidth = 32;
      displayHeight = 16;
      close = vi.fn();
    }
  );
  const transform = { x: 0, y: 0, width: 32, height: 16, rotation: 0, opacity: 1 };
  const clip = createVideoClip({ transform, shadowIntensity: 0 });
  const project = createProject([clip]);
  project.width = 32;
  project.height = 16;
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 16;
  Object.defineProperties(canvas, { clientWidth: { value: 32 }, clientHeight: { value: 16 } });
  const source = new VideoFrame(canvas, { timestamp: 1_000_000 });
  const borrowed: VideoCompositionFrameSource = {
    sourceWidth: 32,
    sourceHeight: 16,
    draw: vi.fn(),
  };
  const input: Parameters<typeof renderPreviewScene>[0] = {
    project,
    currentTime: 1,
    canvas,
    stage: null,
    imageBank: {},
    videoRefs: { current: {} },
  };
  const passes = resolveVideoCompositionRenderPasses(project, 1);
  const background: GpuPreviewLayer = {
    source: canvas,
    rect: { x: 0, y: 0, width: 32, height: 16 },
    inverse: [1, 0, 0, 0, 1, 0, 0, 0, 1],
  };
  return {
    input,
    passes,
    source,
    borrowed,
    background,
    sources: new Map([[clip.id, source]]),
    media: new Map([[clip.id, borrowed]]),
  };
}

it.each([false, true])(
  'keeps the transformed header inside its window and source crop on video only: %s',
  async (cropped) => {
    const f = fixture();
    const layer = f.passes.overlayFrame.visualLayers[0];
    if (layer?.kind !== 'video') throw new Error('Expected video');
    layer.clip.windowHeader = DEFAULT_WINDOW_HEADER;
    layer.sourceContentTransform = [1.4, 0, -2.3, 0, 1.4, -1.7, 0, 0, 1];
    if (cropped) layer.clip.sourceCrop = { x: 0.2, y: 0.1, width: 0.5, height: 0.6 };
    const image = document.createElement('img');
    Object.defineProperties(image, {
      naturalWidth: { value: 931 },
      naturalHeight: { value: 50 },
      complete: { value: true },
    });
    f.input.imageBank[windowHeaderImageKey(layer.clipId, DEFAULT_WINDOW_HEADER)] = image;
    const paint = vi
      .spyOn(Object.getPrototypeOf(f.input.canvas.getContext('2d')), 'drawImage')
      .mockImplementation(() => {});
    try {
      const plan = await buildNativeGpuPreviewLayers(f);
      plans.push(plan);
      const nodes = flatten(plan.layers);
      const header = nodes.find((node) => node.clampSourceEdges?.includes('bottom'));
      const video = nodes.find((node) => node.source === f.source);
      expect(header).toBeDefined();
      expect(video).toBeDefined();
      const plane = resolveDecoratedMediaFrame({
        frame: layer,
        sourceWidth: 32,
        sourceHeight: 16,
        contentWidth: 32 * (layer.clip.sourceCrop?.width ?? 1),
        contentHeight: 16 * (layer.clip.sourceCrop?.height ?? 1),
        windowHeader: DEFAULT_WINDOW_HEADER,
        fit: 'contain',
      });
      expect(header!.rect.y + header!.rect.height).toBeCloseTo(plane.y + plane.headerHeight, 12);
      expect(header!.inverse).toEqual(video!.inverse);
      expect(header!.operationClip).toBeUndefined();
      expect(video!.operationClip).toBeUndefined();
      if (cropped) {
        expect(video!.clip).toMatchObject({
          radius: 0,
          shape: 'hard-rect',
        });
        // Reapplying a normalized crop can round the last bit of the source height.
        expect(video!.clip!.rect.x).toBeCloseTo(plane.x, 12);
        expect(video!.clip!.rect.y).toBeCloseTo(plane.y + plane.headerHeight, 12);
        expect(video!.clip!.rect.width).toBeCloseTo(plane.width, 12);
        expect(video!.clip!.rect.height).toBeCloseTo(plane.height - plane.headerHeight, 12);
        expect(video!.clip!.rect.y).toBeCloseTo(header!.rect.y + header!.rect.height, 12);
        expect(video!.inverse).not.toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1]);
      }
      const joined = nodes.find(
        (node) =>
          'kind' in node.source &&
          node.source.kind === 'group' &&
          node.source.layers.includes(header!) &&
          node.source.layers.includes(video!)
      );
      if (!joined || !('kind' in joined.source) || joined.source.kind !== 'group')
        throw new Error('Expected window group');
      expect(joined.source.layers.at(-1)?.blend).toBe('mask');
      if (!(header!.source instanceof HTMLCanvasElement)) throw new Error('Expected header raster');
      expect([header!.source.width, header!.source.height]).toEqual([931, 50]);
      plan.release();
      expect(header!.source.width).toBe(0);
      expect(f.borrowed.draw).not.toHaveBeenCalled();
    } finally {
      paint.mockRestore();
    }
  }
);

it('uploads tight cursor artwork with its original paint origin and camera projection', async () => {
  const f = fixture();
  f.input.project.width = 1904;
  f.input.project.height = 1072;
  f.passes.overlayFrame.cursor = {
    animationPreset: 'NONE',
    captureMode: 'separate',
    color: '#fff',
    preset: 'ARROW',
    scale: 1,
    shadow: true,
    time: 0,
    visible: true,
    x: 20.25,
    y: 30.5,
  };
  f.passes.overlayFrame.camera.scale = 2;
  f.passes.overlayFrame.camera.viewportX = 3;
  f.passes.overlayFrame.camera.viewportY = 4;
  const draw = await import('../../../../features/video/composition/draw/effects/cursor');
  let origin: { x: number; y: number } | undefined;
  const paint = vi.spyOn(draw, 'drawCursorCompositionState').mockImplementation((context) => {
    const transform = context.getTransform();
    origin = { x: transform.e, y: transform.f };
  });
  try {
    const plan = await buildNativeGpuPreviewLayers(f);
    plans.push(plan);
    const artwork = plan.layers.at(-1)!;
    expect(artwork.rect).toEqual({ x: -38, y: -27, width: 140, height: 155 });
    expect(origin).toEqual({ x: 38, y: 27 });
    expect(artwork.inverse).toEqual([0.5, 0, 3, 0, 0.5, 4, 0, 0, 1]);
    if (!(artwork.source instanceof HTMLCanvasElement)) throw new Error('Expected cursor raster');
    expect(artwork.source.width * artwork.source.height * 4).toBe(86_800);
    expect(artwork.source.width * artwork.source.height * 4).toBeLessThan(11_473_920);
    expect(f.source.close).not.toHaveBeenCalled();
    plan.release();
    expect(artwork.source.width).toBe(0);
    expect(artwork.source.height).toBe(0);
  } finally {
    paint.mockRestore();
  }
});

it('bounds accent artwork without changing action order or the keystroke fallback', async () => {
  const f = fixture();
  const accent = { ...clickAction('click'), point: { x: 20.25, y: 30.5 } };
  f.passes.overlayFrame.actions = [accent, { ...accent, renderKind: 'keystroke' }];
  const draw = await import('../../../../features/video/composition/draw/effects/actions');
  const expected = draw.resolveActionCompositionPaintBounds(accent, 1)!;
  const x = Math.floor(expected.x),
    y = Math.floor(expected.y);
  const rect = {
    x,
    y,
    width: Math.ceil(expected.x + expected.width) - x,
    height: Math.ceil(expected.y + expected.height) - y,
  };
  const plan = await buildNativeGpuPreviewLayers(f);
  plans.push(plan);
  const [first, second] = plan.layers.slice(-2);
  expect(first!.rect).toEqual(rect);
  expect(second!.rect).toEqual({ x: -128, y: -128, width: 288, height: 272 });
  expect(first!.inverse).toEqual(second!.inverse);
  if (!(first!.source instanceof HTMLCanvasElement)) throw new Error('Expected action raster');
  const transform = first!.source.getContext('2d')!.getTransform();
  expect([transform.e, transform.f]).toEqual([-x, -y]);
  expect(first!.source.width * first!.source.height * 4).toBe(rect.width * rect.height * 4);
  plan.release();
  expect(first!.source.width).toBe(0);
});

it.each([null, { x: NaN, y: 0, width: 8, height: 8 }, { x: 0, y: 0, width: 0, height: 8 }])(
  'keeps full-plane artwork when paint bounds are unavailable or invalid: %j',
  async (bounds) => {
    const f = fixture();
    f.passes.overlayFrame.actions = [clickAction('click')];
    const draw = await import('../../../../features/video/composition/draw/effects/actions');
    const resolve = vi.spyOn(draw, 'resolveActionCompositionPaintBounds').mockReturnValue(bounds);
    try {
      const plan = await buildNativeGpuPreviewLayers(f);
      plans.push(plan);
      expect(plan.layers.at(-1)!.rect).toEqual({ x: -128, y: -128, width: 288, height: 272 });
    } finally {
      resolve.mockRestore();
    }
  }
);

it('weights complete exposures once across video and decoration', async () => {
  const f = fixture();
  const first = f.passes.visualPasses[0]!;
  f.passes.visualPasses = [
    { ...first, alpha: 0.5 },
    { ...first, alpha: 0.5, time: first.time + 0.01 },
  ];
  const plan = await buildNativeGpuPreviewLayers(f);
  plans.push(plan);
  const weighted = flatten(plan.layers).filter((layer) => layer.blend === 'add');
  expect(weighted).toHaveLength(2);
  for (const exposure of weighted) {
    expect(exposure.opacity).toBe(0.5);
    expect('kind' in exposure.source && exposure.source.kind).toBe('group');
    expect(
      flatten([exposure]).some((layer) => layer.source === f.source && layer.opacity === undefined)
    ).toBe(true);
  }
  expect(f.borrowed.draw).not.toHaveBeenCalled();
});

it('keeps raw orientation and applies source crops with GPU masks', async () => {
  const f = fixture();
  const layer = f.passes.overlayFrame.visualLayers[0]!;
  if (layer.kind !== 'video') throw new Error('Expected video');
  layer.clip = { ...layer.clip, sourceCrop: { x: 0.2, y: 0.1, width: 0.5, height: 0.6 } };
  f.borrowed = { ...f.borrowed, orientation: { rotation: 90, flip: true } };
  f.media.set(layer.clipId, f.borrowed);
  const plan = await buildNativeGpuPreviewLayers(f);
  plans.push(plan);
  const nodes = flatten(plan.layers);
  expect(nodes.find((node) => node.source === f.source)?.orientation).toEqual({
    rotation: 90,
    flip: true,
  });
  expect(nodes.some((node) => node.blend === 'mask')).toBe(true);
  expect(f.borrowed.draw).not.toHaveBeenCalled();
});

it.each([false, true])(
  'requests depth filtering only for an active focus region: %s',
  async (enabled) => {
    const f = fixture();
    const camera = {
      ...f.passes.overlayFrame.camera,
      spatial: {
        rotation: [0, 0, 0, 1] as const,
        perspective: 1,
        windowMotion: 1,
        lockBackground: true,
        reference: { x: 0, y: 0, width: 32, height: 16 },
        focus: enabled
          ? [
              {
                weight: 1,
                settings: {
                  enabled: true,
                  mode: 'area' as const,
                  x: 0.5,
                  y: 0.5,
                  width: 0.2,
                  softness: 0.1,
                  strength: 1,
                },
              },
            ]
          : [],
      },
    };
    f.passes.overlayFrame.camera = camera;
    f.passes.visualPasses[0]!.frame.camera = camera;
    const plan = await buildNativeGpuPreviewLayers(f);
    plans.push(plan);
    const nodes = flatten(plan.layers);
    expect(nodes.some((node) => node.depth !== undefined)).toBe(enabled);
    if (!enabled) {
      expect(nodes.every((node) => (node.blur ?? 0) === 0)).toBe(true);
      expect(
        nodes.filter((node) => 'kind' in node.source && node.source.kind === 'group')
      ).toHaveLength(2);
    }
  }
);

it('composes global optical lenses over completed scene groups while retaining a locked text layer', async () => {
  const f = fixture();
  const text = createTextClip({
    transform: { x: 4, y: 2, width: 20, height: 8, opacity: 1, rotation: 0 },
  });
  f.input.project.clips.push(text);
  f.passes = resolveVideoCompositionRenderPasses(f.input.project, 1);
  f.passes.overlayFrame.sceneSpotlights = [
    {
      id: 'lens',
      phase: 'hold',
      progress: 1,
      spotlight: {
        ...createQuickEditSpotlight(),
        effect: 'magnify',
        magnification: 2,
        lensOptics: 'optical',
      },
    },
  ];
  const plan = await buildNativeGpuPreviewLayers(f);
  plans.push(plan);
  const nodes = flatten(plan.layers);
  expect(nodes.some((node) => node.lens?.optics === 'optical' && node.lens.scale === 2)).toBe(true);
  expect(nodes.some((node) => node.source === f.source)).toBe(true);
  expect(f.borrowed.draw).not.toHaveBeenCalled();
});

it('projects ordinary over layers directly and sizes temporal groups to the output', async () => {
  const f = fixture();
  f.input.previewRasterSize = { width: 16, height: 8 };
  const camera = { ...f.passes.overlayFrame.camera, scale: 2, viewportX: 3, viewportY: 4 };
  f.passes.overlayFrame.camera = camera;
  f.passes.visualPasses[0]!.frame.camera = camera;
  const plan = await buildNativeGpuPreviewLayers(f);
  plans.push(plan);
  expect(plan.layers[1]!.inverse).toEqual([0.5, 0, 3, 0, 0.5, 4, 0, 0, 1]);
  const first = f.passes.visualPasses[0]!;
  f.passes.visualPasses = [
    { ...first, alpha: 0.5 },
    { ...first, alpha: 0.5, time: first.time + 0.01 },
  ];
  const temporal = await buildNativeGpuPreviewLayers(f);
  plans.push(temporal);
  for (const layer of flatten(temporal.layers)) {
    if (
      'kind' in layer.source &&
      layer.source.kind === 'group' &&
      layer.source.logical.width === 32
    ) {
      expect(layer.source.output).toEqual({ width: 16, height: 8 });
    }
  }
});

function clickAction(
  clipId: string
): import('../../../../features/video/composition/types').VideoCompositionActionState {
  const event = {
    id: 'click',
    kind: 'CLICK' as const,
    label: 'Click',
    anchor: { kind: 'project' as const, time: 0 },
    data: {},
    point: { x: 0.25, y: 0.5 },
  };
  return {
    clipId,
    duration: 1,
    event,
    occurrence: {
      event,
      eventId: event.id,
      clipId,
      time: 0,
      sourceInstanceId: null,
      playbackRun: null,
    },
    point: event.point,
    preset: 'CLICK_RIPPLE',
    progress: 0.5,
    renderKind: 'accent',
    start: 0,
  };
}

it('preserves camera mirroring before inner framing and releases its exact silhouette mask', async () => {
  const f = fixture();
  const layer = f.passes.overlayFrame.visualLayers[0]!;
  if (layer.kind !== 'video') throw new Error('Expected video');
  layer.trackRole = 'CAMERA';
  layer.clip = {
    ...layer.clip,
    cameraMirrored: true,
    cameraAppearance: { shape: 'circle', roundness: 0, zoom: 1, panX: 0, panY: 0 },
  };
  layer.sourceContentTransform = [2, 0, 3, 0, 2, 4, 0, 0, 1];
  const plan = await buildNativeGpuPreviewLayers(f);
  plans.push(plan);
  const nodes = flatten(plan.layers);
  const raw = nodes.find((node) => node.source === f.source)!;
  // Padded target translation is composed after the exact inverse inner framing and mirror.
  expect(raw.inverse.slice(0, 6)).toEqual([-0.5, 0, 97.5, 0, 0.5, -66]);
  expect(raw.rect.width).toBe(32);
  expect(raw.rect.height).toBe(16);
  const masks = nodes.filter((node) => node.blend === 'mask');
  expect(masks.length).toBeGreaterThan(0);
  const silhouette = masks[0]!.source;
  if (!(silhouette instanceof HTMLCanvasElement)) throw new Error('Expected raster silhouette');
  const maskPixels = silhouette.getContext('2d')!;
  expect(maskPixels.getImageData(144, 136, 1, 1).data[3]).toBe(255);
  expect(maskPixels.getImageData(128, 128, 1, 1).data[3]).toBe(0);
  expect(f.borrowed.draw).not.toHaveBeenCalled();
  plan.release();
  for (const mask of masks)
    if (mask.source instanceof HTMLCanvasElement) expect(mask.source.width).toBe(0);
});

it.each(['source-window', undefined] as const)(
  'isolates source spotlight edits inside the original window: %s',
  async (coordinateSpace) => {
    const f = fixture();
    const layer = f.passes.overlayFrame.visualLayers[0]!;
    if (layer.kind !== 'video') throw new Error('Expected video');
    layer.spotlights = [
      {
        id: 'source-focus',
        phase: 'hold',
        progress: 1,
        ...(coordinateSpace ? { coordinateSpace } : {}),
        spotlight: {
          ...createQuickEditSpotlight(),
          effect: 'magnify',
          magnification: 2,
          lensOptics: 'optical',
        },
      },
    ];
    const plan = await buildNativeGpuPreviewLayers(f);
    plans.push(plan);
    const nodes = flatten(plan.layers);
    const erase = nodes.findIndex((node) => node.blend === 'erase');
    const restore = nodes.findIndex((node) => node.blend === 'add');
    expect(erase).toBeGreaterThan(0);
    expect(restore).toBeGreaterThan(erase);
    expect(nodes.some((node) => node.lens?.optics === 'optical')).toBe(true);
    expect(nodes.some((node) => node.source === f.source)).toBe(true);
    expect(f.borrowed.draw).not.toHaveBeenCalled();
  }
);

it.each(['circle', 'rounded'] as const)(
  'keeps magnify feedback sharp above its masked source without clipping the %s lens output',
  async (shape) => {
    const f = fixture();
    const layer = f.passes.overlayFrame.visualLayers[0]!;
    if (layer.kind !== 'video') throw new Error('Expected video');
    layer.trackRole = 'CAMERA';
    layer.clip = { ...layer.clip, cameraMirrored: true };
    if (shape === 'rounded') layer.sourceContentTransform = [1.5, 0, 1, 0, 1.5, 2, 0, 0, 1];
    const action = clickAction(layer.clipId);
    layer.actions = [
      action,
      {
        ...action,
        gestureFeedback: {
          effect: 'magnify',
          point: { x: 0.2, y: 0.5 },
          radius: 2,
          stroke: 1,
          opacity: 0.8,
          color: '#ff0000',
          lens: {
            scale: 2,
            shape,
            shadow: 10,
            ...(shape === 'circle' ? { optics: 'optical' as const, edgeWidth: 4 } : {}),
          },
        },
      },
    ];
    const plan = await buildNativeGpuPreviewLayers(f);
    plans.push(plan);
    const nodes = flatten(plan.layers);
    const lens = nodes.find((node) => node.lens?.scale === 2)!;
    expect(lens).toBeDefined();
    expect(lens.lens?.optics).toBe(shape === 'circle' ? 'optical' : 'flat');
    expect(lens.clip?.shape).toBe(shape === 'circle' ? 'ellipse' : undefined);
    const owner = nodes.find(
      (node) =>
        'kind' in node.source && node.source.kind === 'group' && node.source.layers.includes(lens)
    );
    if (!owner || !('kind' in owner.source) || owner.source.kind !== 'group')
      throw new Error('Expected lens owner');
    expect(owner.source.layers.some((node) => node.blend === 'mask')).toBe(false);
    expect(nodes.indexOf(lens)).toBeGreaterThan(
      nodes.findIndex((node) => node.source === f.source)
    );
    expect(nodes.some((node) => node.blend === 'mask')).toBe(true);
    expect(f.borrowed.draw).not.toHaveBeenCalled();
  }
);

it('allocates the complete source magnifier footprint outside the canonical plane', async () => {
  const f = fixture();
  const layer = f.passes.overlayFrame.visualLayers[0]!;
  if (layer.kind !== 'video') throw new Error('Expected video');
  const action = clickAction(layer.clipId);
  layer.actions = [
    {
      ...action,
      point: { x: 0.5, y: 0.1 },
      gestureFeedback: {
        effect: 'magnify',
        point: { x: 0.5, y: 0.1 },
        radius: 160,
        stroke: 4,
        opacity: 1,
        color: '#f00',
        lens: { scale: 3, shape: 'circle', shadow: 20 },
      },
    },
  ];
  const plan = await buildNativeGpuPreviewLayers(f);
  plans.push(plan);
  const nodes = flatten(plan.layers);
  const containing = nodes.filter(
    (node) =>
      'kind' in node.source &&
      node.source.kind === 'group' &&
      flatten(node.source.layers).some((child) => child.lens)
  );
  expect(containing.some((node) => node.rect.y < -160)).toBe(true);
  expect(containing.some((node) => node.rect.width > 32 + 256)).toBe(true);
});

it('uses the original external frame dimensions when no decoded media descriptor is present', async () => {
  const f = fixture();
  f.media.clear();
  const plan = await buildNativeGpuPreviewLayers(f);
  plans.push(plan);
  const raw = flatten(plan.layers).find((node) => node.source === f.source)!;
  expect(raw.rect).toEqual({ x: 0, y: 0, width: 32, height: 16 });
  expect(raw.orientation).toBeUndefined();
});

it.each([false, true])(
  'snapshots streamed outputs across overlapping segments: %s',
  async (overlap) => {
    const f = fixture();
    const first = f.passes.visualPasses[0]!;
    if (overlap) {
      const base = first.frame.visualLayers[0]!;
      const text = createTextClip();
      f.input.project.clips.push(text);
      const resolved = resolveVideoCompositionRenderPasses(
        f.input.project,
        1
      ).overlayFrame.visualLayers.find((layer) => layer.clipId === text.id)!;
      first.frame.visualLayers = [base, resolved, { ...base, clipId: 'other' }];
      f.sources.set('other', f.source);
      f.media.set('other', f.borrowed);
    }
    f.passes.visualPasses = [
      { ...first, time: 0.99, alpha: 0.5 },
      { ...first, time: 1.01, alpha: 0.5 },
    ];
    const sampled = new Map<
      number,
      import('../../../../features/video/composition/effect-runtime/runtime/types').EffectRuntimeRenderedFrameMap
    >();
    const originals: Array<HTMLCanvasElement & { close: () => void }> = [];
    const snapshots: Array<HTMLCanvasElement & { close: () => void }> = [];
    const frames = (bitmap: ImageBitmap) =>
      new Map([
        [
          'effect',
          {
            bitmap,
            effectInstanceId: 'effect',
            height: 16,
            width: 32,
            logicalWidth: 32,
            logicalHeight: 16,
            kind: 'targetEffect' as const,
            snapshotId: 'snapshot',
            target: {
              kind: 'clip' as const,
              clipId: first.frame.visualLayers[0]!.clipId,
              chainIndex: 0,
              placement: { x: 0, y: 0, width: 32, height: 16, rotation: 0, opacity: 1 },
            },
          },
        ],
      ]);
    let previous: (typeof originals)[number] | undefined;
    const effects = {
      overlayFrames: new Map(),
      framesByTime: sampled,
      prepareVisualPass: vi.fn(async (time: number) => {
        previous?.close();
        sampled.clear();
        const bitmap = Object.assign(document.createElement('canvas'), { close: vi.fn() });
        bitmap.width = 32;
        bitmap.height = 16;
        originals.push(bitmap);
        previous = bitmap;
        const entries = frames(bitmap);
        if (overlap) {
          const original = entries.get('effect')!;
          entries.set('other', {
            ...original,
            effectInstanceId: 'other',
            target: {
              kind: 'clip',
              clipId: 'other',
              chainIndex: 0,
              placement: { x: 0, y: 0, width: 32, height: 16, opacity: 1, rotation: 0 },
            },
          });
        }
        sampled.set(time, entries);
      }),
    };
    const snapshotGroup = vi.fn(
      async (
        group: import('../../../../features/video/composition/canvas/gpu-preview').GpuPreviewGroup
      ) => {
        expect(previous?.close).not.toHaveBeenCalled();
        expect(flatten(group.layers).some((layer) => layer.source === previous)).toBe(true);
        const bitmap = Object.assign(document.createElement('canvas'), { close: vi.fn() });
        bitmap.width = group.output.width;
        bitmap.height = group.output.height;
        snapshots.push(bitmap);
        return bitmap;
      }
    );
    const plan = await buildNativeGpuPreviewLayers({ ...f, effects, snapshotGroup });
    plans.push(plan);
    expect(snapshotGroup).toHaveBeenCalledTimes(overlap ? 4 : 2);
    expect(originals[0]!.close).toHaveBeenCalledOnce();
    const projected = flatten(plan.layers);
    for (const original of originals)
      expect(projected.some((layer) => layer.source === original)).toBe(false);
    for (const bitmap of snapshots) {
      expect(bitmap.close).not.toHaveBeenCalled();
      expect(
        projected.some(
          (layer) => layer.source === bitmap && layer.opacity === 0.5 && layer.blend === 'add'
        )
      ).toBe(true);
    }
    plan.release();
    for (const bitmap of snapshots) expect(bitmap.close).toHaveBeenCalledOnce();
  }
);

it('releases completed exposure snapshots and owned artwork when a later snapshot fails', async () => {
  const f = fixture();
  const first = f.passes.visualPasses[0]!;
  f.passes.visualPasses = [
    { ...first, time: 0.99, alpha: 0.5 },
    { ...first, time: 1.01, alpha: 0.5 },
  ];
  const bitmap = Object.assign(document.createElement('canvas'), { close: vi.fn() });
  bitmap.width = 32;
  bitmap.height = 16;
  const failure = new Error('Exposure snapshot failed');
  const artwork: HTMLCanvasElement[] = [];
  let calls = 0;
  const snapshotGroup = vi.fn(
    async (
      group: import('../../../../features/video/composition/canvas/gpu-preview').GpuPreviewGroup
    ) => {
      artwork.push(
        ...flatten(group.layers)
          .map((layer) => layer.source)
          .filter((source) => source instanceof HTMLCanvasElement)
      );
      if (calls++ === 1) throw failure;
      return bitmap;
    }
  );
  await expect(
    buildNativeGpuPreviewLayers({
      ...f,
      effects: {
        overlayFrames: new Map(),
        framesByTime: new Map(),
        prepareVisualPass: async () => {},
      },
      snapshotGroup,
    })
  ).rejects.toBe(failure);
  expect(bitmap.close).toHaveBeenCalledOnce();
  for (const source of artwork) expect(source.width).toBe(0);
  expect(f.source.close).not.toHaveBeenCalled();
});

it('keeps attached effect bitmaps as textures inside owner masks and filters the transformed material', async () => {
  const f = fixture();
  const owner = f.passes.overlayFrame.visualLayers[0]!;
  if (owner.kind !== 'video') throw new Error('Expected video');
  const { createEffectHostClip } =
    await import('../../../../features/video/project/factories/overlay-clip');
  const clip = createEffectHostClip({
    duration: 2,
    effectInstanceId: 'attached',
    name: 'Effect',
    startTime: 0,
    trackId: owner.clip.trackId,
    projectWidth: 32,
    projectHeight: 16,
  });
  const effect: Extract<
    import('../../../../features/video/composition/types').VideoCompositionVisualLayer,
    { kind: 'effect' }
  > = {
    ...owner,
    clip,
    clipId: clip.id,
    kind: 'effect',
    x: 2,
    y: 1,
    width: 8,
    height: 4,
    opacity: 0.5,
    renderState: { ...owner.renderState, blurAmount: 2 },
    sourceAttachment: {
      owner,
      mapping: {
        frame: owner.clip.transform,
        fitMode: owner.clip.fitMode,
        sourceWidth: 32,
        sourceHeight: 16,
        renderState: owner.renderState,
        sourceCrop: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
      },
      innerTransform: [2, 0, 3, 0, 2, 4, 0, 0, 1],
    },
  };
  const bitmap = Object.assign(document.createElement('canvas'), { close: vi.fn() });
  bitmap.width = 8;
  bitmap.height = 4;
  const frames = new Map([
    [
      'attached',
      {
        bitmap,
        effectInstanceId: 'attached',
        height: 4,
        width: 8,
        logicalHeight: 4,
        logicalWidth: 8,
        kind: 'standalone' as const,
        snapshotId: 'snapshot',
        target: { kind: 'scene' as const, clipId: clip.id },
        bitmapBounds: { x: -0.25, y: 0, width: 1.5, height: 1 },
      },
    ],
  ]);
  f.passes.overlayFrame.visualLayers = [effect];
  f.passes.visualPasses[0]!.frame.visualLayers = [effect];
  const plan = await buildNativeGpuPreviewLayers({
    ...f,
    effects: { overlayFrames: frames, framesByTime: new Map([[1, frames]]) },
  });
  plans.push(plan);
  const nodes = flatten(plan.layers);
  const texture = nodes.find((layer) => layer.source === bitmap)!;
  expect(texture).toBeDefined();
  expect(texture.rect).toEqual({ x: 0, y: 1, width: 12, height: 4 });
  expect(texture.inverse).toEqual([0.4, 0, -49.2, 0, 0.4, -51.2, 0, 0, 1]);
  expect(texture.opacity).toBe(0.5);
  expect(texture.blur).toBeUndefined();
  expect(
    nodes.some((layer) => layer.cssFilter?.blur === 2 && layer.cssFilter.brightness === 1)
  ).toBe(true);
  expect(nodes.some((layer) => layer.blend === 'mask')).toBe(true);
  plan.release();
  expect(bitmap.close).not.toHaveBeenCalled();
});

it('uses lower processed viewport rasters once in grouped input blur backdrops', async () => {
  const f = fixture();
  const source = f.passes.overlayFrame.visualLayers[0]!;
  const lower = { ...source, clipId: 'lower' };
  const camera = { ...f.passes.overlayFrame.camera, scale: 2, viewportX: 1, viewportY: 2 };
  const sceneFrame = {
    ...f.passes.overlayFrame,
    camera,
    visualLayers: [lower, source],
    sceneSpotlights: [
      {
        id: 'blur',
        clipId: source.clipId,
        afterClipId: source.clipId,
        phase: 'hold' as const,
        progress: 1,
        spotlight: { ...createQuickEditSpotlight(), effect: 'blur' as const, blur: 4 },
      },
    ],
  };
  const bitmap = Object.assign(document.createElement('canvas'), { close: vi.fn() });
  bitmap.width = 32;
  bitmap.height = 16;
  const frames = new Map([
    [
      'lower',
      {
        bitmap,
        effectInstanceId: 'lower',
        height: 16,
        width: 32,
        logicalWidth: 32,
        logicalHeight: 16,
        kind: 'targetEffect' as const,
        snapshotId: 'snapshot',
        target: { kind: 'track' as const, trackId: 'track', clipIds: ['lower'] },
      },
    ],
  ]);
  const plan = await buildNativeGpuPreviewLayers({
    ...f,
    inputComposition: {
      dimensions: { width: 32, height: 16 },
      renderDimensions: { width: 16, height: 8 },
      layers: [source],
      applyCamera: true,
      camera,
      frames,
      scene: { project: f.input.project, frame: sceneFrame },
    },
  });
  plans.push(plan);
  const nodes = flatten(plan.layers);
  const filtered = nodes.find((layer) => (layer.blur ?? 0) > 0)!;
  expect(filtered).toBeDefined();
  if (!('kind' in filtered.source) || filtered.source.kind !== 'group')
    throw new Error('Expected GPU backdrop');
  const lowerTexture = flatten(filtered.source.layers).find((layer) => layer.source === bitmap)!;
  expect(lowerTexture).toBeDefined();
  expect(lowerTexture.inverse).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1]);
  expect(f.borrowed.draw).not.toHaveBeenCalled();
  plan.release();
  expect(bitmap.close).not.toHaveBeenCalled();
});

it.each(['track', 'video-group'] as const)(
  'draws source feedback once through the camera after a locked %s effect raster',
  async (kind) => {
    const f = fixture();
    const layer = f.passes.overlayFrame.visualLayers[0]!;
    if (layer.kind !== 'video') throw new Error('Expected video');
    layer.actions = [clickAction(layer.clipId)];
    const camera = {
      ...f.passes.overlayFrame.camera,
      scale: 2,
      viewportX: 3,
      viewportY: 4,
      spatial: {
        rotation: [0, 0, 0, 1] as const,
        perspective: 0.7,
        windowMotion: 1,
        lockBackground: true,
        reference: { x: 0, y: 0, width: 32, height: 16 },
        focus: [
          {
            weight: 1,
            settings: {
              enabled: true,
              mode: 'area' as const,
              x: 0.5,
              y: 0.5,
              width: 0.1,
              softness: 0.1,
              strength: 1,
            },
          },
        ],
      },
    };
    f.passes.overlayFrame.camera = camera;
    f.passes.visualPasses[0]!.frame.camera = camera;
    const bitmap = Object.assign(document.createElement('canvas'), { close: vi.fn() });
    bitmap.width = 32;
    bitmap.height = 16;
    const frames = new Map([
      [
        'processed',
        {
          bitmap,
          effectInstanceId: 'processed',
          kind: 'targetEffect' as const,
          target:
            kind === 'track'
              ? { kind, trackId: layer.clip.trackId, clipIds: [layer.clipId] }
              : { kind, clipIds: [layer.clipId] },
          width: 32,
          height: 16,
          logicalWidth: 32,
          logicalHeight: 16,
          snapshotId: 'snapshot',
        },
      ],
    ]);
    const draw = await import('../../../../features/video/composition/draw');
    const paint = vi.spyOn(draw, 'drawCompositionVisualLayer').mockImplementation(() => {});
    try {
      const plan = await buildNativeGpuPreviewLayers({
        ...f,
        effects: { overlayFrames: frames, framesByTime: new Map([[1, frames]]) },
      });
      plans.push(plan);
      const actionPaint = paint.mock.calls.filter(
        ([, painted]) =>
          painted.kind === 'video' && painted.effectActionsOnly && painted.actions?.length
      );
      expect(actionPaint).toHaveLength(1);
      const canvas = actionPaint[0]![0].canvas;
      const nodes = flatten(plan.layers);
      const owners = nodes.filter(
        (node) =>
          'kind' in node.source &&
          node.source.kind === 'group' &&
          node.source.layers.some((child) => child.source === canvas)
      );
      expect(owners).toHaveLength(1);
      expect(owners[0]!.inverse).toEqual([0.5, 0, 3, 0, 0.5, 4, 0, 0, 1]);
      expect(owners[0]!.depth).toBeUndefined();
      expect(nodes.filter((node) => node.source === bitmap)).toHaveLength(1);
    } finally {
      paint.mockRestore();
    }
  }
);
