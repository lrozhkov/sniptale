import { createSourceImageFilter } from '../../../features/image-filters/contract';
import { normalizeVideoProjectCursorSkin } from '../../../features/video/project/cursor';
import { createGlTransitionSelection } from '../../../features/video/project/transition/gl-catalog';
// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import {
  createProject,
  createVideoClip,
  createTextClip,
} from '../../../features/video/project/timeline/project-meta.test.helpers';
import { resolveVideoCompositionRenderPasses } from '../../../features/video/composition/timeline/render';
import { createQuickEditSpotlight } from '../../../features/video/project/scene/focus-appearance';
import type { GpuPreviewLayer } from '../../../features/video/composition/canvas/gpu-preview';
import type { VideoCompositionFrameSource } from '../../../features/video/composition/draw/media-source';
import type { renderNativeCompositionScene } from './render-scene';
import { buildNativeGpuPreviewLayers, buildNativeGpuEffectLayer } from './gpu-preview-layers';
import { createNativeGpuPreviewMaterials } from './gpu-preview-materials';
import { DEFAULT_WINDOW_HEADER } from '@sniptale/runtime-contracts/window-header';
import { windowHeaderImageKey } from '../../../features/video/composition/draw/window-header';
import { resolveDecoratedMediaFrame } from '../../../features/video/project/window-geometry';

vi.mock('../../../features/video/composition/draw/spotlight', async (original) => ({
  ...(await original<typeof import('../../../features/video/composition/draw/spotlight')>()),
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
  const input: Parameters<typeof renderNativeCompositionScene>[0] = {
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
  const draw = await import('../../../features/video/composition/draw/effects/cursor');
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
  const draw = await import('../../../features/video/composition/draw/effects/actions');
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
    const draw = await import('../../../features/video/composition/draw/effects/actions');
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
      ).toHaveLength(1);
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
): import('../../../features/video/composition/types').VideoCompositionActionState {
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

it('shares the original source snapshot and bounds magnifier-only artwork', async () => {
  const f = fixture();
  const layer = f.passes.overlayFrame.visualLayers[0]!;
  if (layer.kind !== 'video') throw new Error('Expected video');
  layer.actions = [
    {
      ...clickAction(layer.clipId),
      gestureFeedback: {
        effect: 'magnify',
        point: { x: 0.25, y: 0.5 },
        radius: 3,
        stroke: 1,
        opacity: 1,
        color: '#f00',
        lens: { scale: 2, shape: 'circle', shadow: 20 },
      },
    },
  ];
  const plan = await buildNativeGpuPreviewLayers(f);
  plans.push(plan);
  const nodes = flatten(plan.layers);
  expect(nodes.filter((node) => node.source === f.source)).toHaveLength(1);
  const containing = nodes.filter(
    (node) =>
      'kind' in node.source &&
      node.source.kind === 'group' &&
      flatten(node.source.layers).some((child) => child.lens)
  );
  expect(containing.length).toBeGreaterThan(0);
  for (const node of containing) {
    expect(node.rect.width).toBeLessThan(64);
    expect(node.rect.height).toBeLessThan(64);
    expect(Number.isInteger(node.rect.x) && Number.isInteger(node.rect.y)).toBe(true);
  }
  const rasters = [...new Set(nodes.map((node) => node.source))].filter(
    (source): source is HTMLCanvasElement => source instanceof HTMLCanvasElement
  );
  expect(
    rasters.filter((source) => source.width >= 32 + 256 && source.height >= 16 + 256)
  ).toHaveLength(1);
  plan.release();
  for (const raster of rasters.filter((source) => source !== f.input.canvas))
    expect([raster.width, raster.height]).toEqual([0, 0]);
  expect(f.source.close).not.toHaveBeenCalled();
  expect(f.borrowed.draw).not.toHaveBeenCalled();
});

it('keeps source bodies distinct for separate exposure poses of the same clip', async () => {
  const f = fixture();
  const first = f.passes.visualPasses[0]!;
  f.passes.visualPasses = [
    { ...first, alpha: 0.5 },
    {
      ...first,
      alpha: 0.5,
      time: first.time + 0.01,
      frame: {
        ...first.frame,
        visualLayers: first.frame.visualLayers.map((layer) => ({ ...layer, x: layer.x + 8 })),
      },
    },
  ];
  const plan = await buildNativeGpuPreviewLayers(f);
  plans.push(plan);
  const video = flatten(plan.layers).filter((node) => node.source === f.source);
  expect(video).toHaveLength(2);
  expect(video[1]!.rect.x - video[0]!.rect.x).toBe(8);
  expect(f.borrowed.draw).not.toHaveBeenCalled();
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
      import('../../../features/video/composition/effect-runtime/runtime/types').EffectRuntimeRenderedFrameMap
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
        group: import('../../../features/video/composition/canvas/gpu-preview').GpuPreviewGroup
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
      group: import('../../../features/video/composition/canvas/gpu-preview').GpuPreviewGroup
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

async function attachedFixture() {
  const f = fixture();
  const owner = f.passes.overlayFrame.visualLayers[0]!;
  if (owner.kind !== 'video') throw new Error('Expected video');
  const { createEffectHostClip } =
    await import('../../../features/video/project/factories/overlay-clip');
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
    import('../../../features/video/composition/types').VideoCompositionVisualLayer,
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
  return { f, owner, effect, bitmap, frames };
}

it('keeps attached effect bitmaps as textures inside owner masks and filters the transformed material', async () => {
  const { f, bitmap, frames } = await attachedFixture();
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
    const draw = await import('../../../features/video/composition/draw');
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

it('retains white coverage across new source frames and invalidates changed window geometry', async () => {
  const f = fixture();
  const materials = createNativeGpuPreviewMaterials();
  const first = await buildNativeGpuPreviewLayers({ ...f, sourceMask: materials.sourceMask });
  plans.push(first);
  const maskOf = (layers: readonly GpuPreviewLayer[]) =>
    flatten(layers).find((node) => node.cache?.key === 'native-source-mask');
  const mask = maskOf(first.layers);
  expect(mask).toBeDefined();
  const nextSource = new VideoFrame(f.source);
  const second = await buildNativeGpuPreviewLayers({
    ...f,
    sources: new Map([...f.sources].map(([id]) => [id, nextSource])),
    sourceMask: materials.sourceMask,
  });
  plans.push(second);
  const secondMask = maskOf(second.layers);
  expect(secondMask?.source).toBe(mask?.source);
  expect(secondMask?.cache).toEqual(mask?.cache);
  expect(flatten(second.layers).some((node) => node.source === nextSource)).toBe(true);
  expect(flatten(second.layers).some((node) => node.source === f.source)).toBe(false);
  first.release();
  second.release();
  const layer = f.passes.overlayFrame.visualLayers[0]!;
  if (layer.kind !== 'video') throw new Error('Expected video');
  layer.clip.windowCornerRadius = 8;
  const third = await buildNativeGpuPreviewLayers({ ...f, sourceMask: materials.sourceMask });
  plans.push(third);
  expect(maskOf(third.layers)?.source).not.toBe(mask?.source);
  expect(maskOf(third.layers)?.cache?.revision).not.toBe(mask?.cache?.revision);
  materials.dispose();
  const retained = maskOf(third.layers)?.source;
  if (!(retained instanceof HTMLCanvasElement)) throw new Error('Expected retained mask');
  expect(retained.width).toBeGreaterThan(0);
  third.release();
  expect([retained.width, retained.height]).toEqual([0, 0]);
});

it.each([0, 30])(
  'omits only empty source decoration with shadow intensity %s',
  async (intensity) => {
    const f = fixture();
    const layer = f.passes.overlayFrame.visualLayers[0]!;
    if (layer.kind !== 'video') throw new Error('Expected video');
    layer.clip.shadowIntensity = intensity;
    const plan = await buildNativeGpuPreviewLayers(f);
    plans.push(plan);
    const fullRasters = flatten(plan.layers).filter(
      (node) => node.source instanceof HTMLCanvasElement && node.source.width >= 288
    );
    expect(fullRasters).toHaveLength(intensity > 0 ? 2 : 1);
  }
);

it.each([false, true])(
  'keeps STRETCH source rectangles numeric without leaking layer metadata: camera=%s',
  async (camera) => {
    const f = fixture();
    const layer = f.passes.overlayFrame.visualLayers[0];
    if (!layer || layer.kind !== 'video') throw new Error('Expected video');
    layer.clip.fitMode = 'STRETCH';
    delete layer.clip.windowHeader;
    delete layer.clip.sourceCrop;
    layer.rotation = 45;
    if (camera) layer.trackRole = 'CAMERA';
    const original = structuredClone(layer);
    const plan = await buildNativeGpuPreviewLayers(f);
    plans.push(plan);
    const nodes = flatten(plan.layers);
    const source = nodes.find((node) => node.source === f.source);
    expect(source).toBeDefined();
    expect(source!.rect).toEqual({
      x: layer.x,
      y: layer.y,
      width: layer.width,
      height: layer.height,
    });
    for (const node of nodes)
      for (const rect of [node.rect, node.clip?.rect])
        if (rect) {
          expect(Object.keys(rect).sort()).toEqual(['height', 'width', 'x', 'y']);
          expect(Object.values(rect).every(Number.isFinite)).toBe(true);
          expect(rect.width).toBeGreaterThan(0);
          expect(rect.height).toBeGreaterThan(0);
        }
    const material = plan.layers[1];
    expect(material).toBeDefined();
    const { projectQuickEditPoint } =
      await import('../../../features/video/composition/motion/spatial-geometry');
    const centre = { x: layer.x + layer.width / 2, y: layer.y + layer.height / 2 };
    const mapped = projectQuickEditPoint(material!.inverse, centre);
    expect(mapped?.x).toBeCloseTo(centre.x, 10);
    expect(mapped?.y).toBeCloseTo(centre.y, 10);
    expect(material!.inverse).not.toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1]);
    expect(layer).toEqual(original);
  }
);

it('retains generic video decoration across frames and invalidates changed shadow pixels', async () => {
  const f = fixture();
  const layer = f.passes.overlayFrame.visualLayers[0]!;
  if (layer.kind !== 'video') throw new Error('Expected video');
  layer.clip.shadowIntensity = 30;
  const materials = createNativeGpuPreviewMaterials();
  const build = async () => {
    const plan = await buildNativeGpuPreviewLayers({
      ...f,
      sourceMask: materials.sourceMask,
      sourceDecoration: materials.sourceDecoration,
    });
    plans.push(plan);
    return plan;
  };
  const decoration = (plan: Awaited<ReturnType<typeof build>>) =>
    flatten(plan.layers).find((node) => node.cache?.key === 'native-source-decoration');
  const first = await build();
  const pixels = decoration(first);
  expect(pixels).toBeDefined();
  first.release();
  const nextSource = new VideoFrame(f.source);
  f.sources = new Map([...f.sources].map(([id]) => [id, nextSource]));
  const second = await build();
  expect(decoration(second)?.source).toBe(pixels?.source);
  expect(decoration(second)?.cache?.revision).toBe(pixels?.cache?.revision);
  second.release();
  layer.clip.shadowIntensity = 45;
  const third = await build();
  expect(decoration(third)?.source).not.toBe(pixels?.source);
  expect(decoration(third)?.cache?.revision).not.toBe(pixels?.cache?.revision);
  materials.dispose();
  const retained = decoration(third)?.source;
  if (!(retained instanceof HTMLCanvasElement)) throw new Error('Expected retained decoration');
  expect(retained.width).toBeGreaterThan(0);
  third.release();
  expect(retained.width).toBe(0);
});

it('retains attached annotation coverage across bitmap and pose changes, and invalidates crop changes', async () => {
  const { f, effect, frames } = await attachedFixture();
  const materials = createNativeGpuPreviewMaterials();
  const build = async () => {
    const plan = await buildNativeGpuPreviewLayers({
      ...f,
      annotationMask: materials.annotationMask,
      effects: { overlayFrames: frames, framesByTime: new Map([[1, frames]]) },
    });
    plans.push(plan);
    return plan;
  };
  const mask = (plan: Awaited<ReturnType<typeof build>>) =>
    flatten(plan.layers).find((node) => node.cache?.key === 'native-annotation-mask');
  const first = await build();
  const coverage = mask(first);
  expect(coverage).toBeDefined();
  first.release();
  effect.x += 2;
  const nextBitmap = Object.assign(document.createElement('canvas'), { close: vi.fn() });
  nextBitmap.width = 8;
  nextBitmap.height = 4;
  frames.get('attached')!.bitmap = nextBitmap;
  const second = await build();
  expect(mask(second)?.source).toBe(coverage?.source);
  expect(mask(second)?.cache?.revision).toBe(coverage?.cache?.revision);
  expect(flatten(second.layers).some((node) => node.source === nextBitmap)).toBe(true);
  second.release();
  effect.sourceAttachment!.mapping.sourceCrop = { x: 0.2, y: 0.2, width: 0.6, height: 0.6 };
  const third = await build();
  expect(mask(third)?.source).not.toBe(coverage?.source);
  expect(mask(third)?.cache?.revision).not.toBe(coverage?.cache?.revision);
  materials.dispose();
  const retained = mask(third)?.source;
  if (!(retained instanceof HTMLCanvasElement)) throw new Error('Expected annotation coverage');
  expect(retained.width).toBeGreaterThan(0);
  third.release();
  expect(retained.width).toBe(0);
});

it('keeps ordinary source feedback artwork and its GPU group local to the painted accent', async () => {
  const f = fixture();
  const layer = f.passes.overlayFrame.visualLayers[0]!;
  if (layer.kind !== 'video') throw new Error('Expected video');
  const action = clickAction(layer.clipId);
  layer.actions = [
    {
      ...action,
      gestureFeedback: {
        effect: 'ripple',
        point: action.point!,
        radius: 2,
        stroke: 1,
        opacity: 1,
        color: '#ff0000',
      },
    },
  ];
  const plan = await buildNativeGpuPreviewLayers(f);
  plans.push(plan);
  const feedback = flatten(plan.layers).at(-1)!;
  expect(feedback.source).toBeInstanceOf(HTMLCanvasElement);
  expect(feedback.rect.width).toBeLessThan(32);
  expect(feedback.rect.height).toBeLessThan(32);
  expect(plan.layers.at(-1)!.rect.width).toBeLessThan(32);
  expect(plan.layers.at(-1)!.rect.height).toBeLessThan(32);
  plan.release();
  expect((feedback.source as HTMLCanvasElement).width).toBe(0);
});

it('shares the exact attached SDK wrapper between foreground and descriptor-only preparation', async () => {
  const { f, effect, bitmap, frames } = await attachedFixture();
  const plan = await buildNativeGpuPreviewLayers({
    ...f,
    effects: { overlayFrames: frames, framesByTime: new Map([[1, frames]]) },
  });
  plans.push(plan);
  const nodes = flatten(plan.layers);
  const original = nodes.find((layer) => layer.cssFilter?.blur === effect.renderState.blurAmount);
  if (!original || !('kind' in original.source) || original.source.kind !== 'group')
    throw new Error('Expected attached group');
  const mask = flatten([original]).find((layer) => layer.blend === 'mask')!;
  const source = mask.source;
  const paint = vi.fn();
  const wrapped = buildNativeGpuEffectLayer({
    layer: effect,
    frame: frames.get('attached')!,
    fullFrame: false,
    plane: original.rect,
    mask: (key, draw) => {
      expect(key).toBeTypeOf('string');
      paint(draw);
      return { source, rect: original.rect, inverse: [1, 0, 0, 0, 1, 0, 0, 0, 1] };
    },
  });
  expect(original).toEqual(wrapped);
  expect(wrapped.cssFilter).toEqual({
    blur: effect.renderState.blurAmount,
    brightness: 1,
    saturate: 1,
  });
  expect(paint).toHaveBeenCalledOnce();
  expect(bitmap.close).not.toHaveBeenCalled();
});

it('retains exact enhanced body, source, click and nested scene demand graphs at physical density', async () => {
  const f = fixture();
  const layer = f.passes.overlayFrame.visualLayers[0]!;
  if (layer.kind !== 'video') throw new Error('Expected video');
  const focus = {
    id: 'inner',
    phase: 'hold' as const,
    progress: 1,
    spotlight: { ...createQuickEditSpotlight(), effect: 'magnify' as const, magnification: 2 },
  };
  layer.spotlights = [focus];
  const action = {
    ...clickAction(layer.clipId),
    gestureFeedback: {
      effect: 'magnify' as const,
      point: { x: 0.5, y: 0.5 },
      radius: 3,
      stroke: 1,
      opacity: 1,
      color: '#f00',
      lens: { scale: 2, shape: 'circle' as const, shadow: 0 },
    },
  };
  layer.actions = [action];
  f.passes.overlayFrame.sceneSpotlights = [{ ...focus, id: 'outer' }];
  const tiles = new Map<string, HTMLCanvasElement>();
  const selected: string[] = [];
  const sourceForFrame: NonNullable<
    Parameters<typeof buildNativeGpuPreviewLayers>[0]['sourceForFrame']
  > = (_frame, _time, _layers, demand = 'body') => {
    selected.push(demand);
    let image = tiles.get(demand);
    if (!image) {
      image = document.createElement('canvas');
      image.width = 128;
      image.height = 64;
      tiles.set(demand, image);
    }
    const tile = image;
    return {
      frames: f.sources,
      media: new Map([
        [
          layer.clipId,
          {
            ...f.borrowed,
            preparedSampling: {
              sourceKey: {},
              sourceTime: 1,
              passTime: 1,
              sourceSize: { width: 32, height: 16 },
              drawPrepared: () => true,
              visitPreparedTiles(id, consume) {
                expect(id).toBe('body');
                consume({
                  image: tile,
                  physicalSourceRect: { x: 0, y: 0, width: 128, height: 64 },
                  originalPixelROI: { x: 0, y: 0, width: 32, height: 16 },
                });
                return true;
              },
            },
          },
        ],
      ]),
    };
  };
  const plan = await buildNativeGpuPreviewLayers({ ...f, sourceForFrame });
  plans.push(plan);
  const { sourceClickSamplingDemandId } =
    await import('../../../features/video/composition/draw/effects/actions');
  const click = sourceClickSamplingDemandId(action);
  expect(selected).toContain('sceneLens:inner');
  expect(selected).toContain(click);
  expect(selected).toContain('sceneLens:outer');
  expect(selected).toContain('sceneLens:outer/sceneLens:inner');
  expect(selected).toContain(`sceneLens:outer/${click}`);
  const nodes = flatten(plan.layers);
  for (const demand of [
    'body',
    'sceneLens:inner',
    click,
    'sceneLens:outer',
    'sceneLens:outer/sceneLens:inner',
    `sceneLens:outer/${click}`,
  ])
    expect(nodes.some((node) => node.source === tiles.get(demand))).toBe(true);
  for (const [demand, density] of [
    ['body', 1],
    ['sceneLens:inner', 2],
    [click, 2],
    ['sceneLens:outer', 2],
    ['sceneLens:outer/sceneLens:inner', 4],
    [`sceneLens:outer/${click}`, 4],
  ] as const) {
    const holder = nodes.find(
      (node) =>
        'kind' in node.source &&
        node.source.kind === 'group' &&
        node.source.layers.some((child) => child.source === tiles.get(demand))
    );
    if (!holder || !('kind' in holder.source) || holder.source.kind !== 'group')
      throw new Error('Missing prepared tile group');
    expect(holder.source.output.width).toBeGreaterThanOrEqual(
      holder.source.logical.width * density
    );
    expect(holder.source.output.height).toBeGreaterThanOrEqual(
      holder.source.logical.height * density
    );
  }
  expect(f.borrowed.draw).not.toHaveBeenCalled();
});

it('uses the sampler physical density for the enhanced header and source join', async () => {
  const f = fixture();
  const layer = f.passes.overlayFrame.visualLayers[0]!;
  if (layer.kind !== 'video') throw new Error('Expected video');
  layer.clip.windowHeader = DEFAULT_WINDOW_HEADER;
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
    const density = 3.25;
    const plan = await buildNativeGpuPreviewLayers({
      ...f,
      sourceForFrame: () => ({
        frames: f.sources,
        media: f.media,
        sourceRasterScale: () => density,
      }),
    });
    plans.push(plan);
    const { resolveFittedWindowRaster } =
      await import('../../../features/video/composition/draw/fitted-media');
    const { resolveVideoWindowMedia } =
      await import('../../../features/video/composition/draw/video');
    const raster = resolveFittedWindowRaster(
      { ...resolveVideoWindowMedia(layer, f.borrowed, 1, f.input.imageBank), frame: layer },
      density,
      50
    );
    const nodes = flatten(plan.layers);
    expect(nodes.find((node) => node.source === f.source)?.rect).toEqual(raster.source);
    const header = nodes.find((node) => node.clampSourceEdges?.includes('bottom'));
    expect(header).toBeDefined();
    expect(header!.rect.y + header!.rect.height).toBeCloseTo(raster.visible.y, 12);
  } finally {
    paint.mockRestore();
  }
});

it('retains enhanced scene-demand exposure snapshots before the next streamed effect pass', async () => {
  const f = fixture();
  const first = f.passes.visualPasses[0]!;
  const clipId = first.frame.visualLayers[0]!.clipId;
  f.passes.visualPasses = [
    { ...first, time: 0.99, alpha: 0.5 },
    { ...first, time: 1.01, alpha: 0.5 },
  ];
  f.passes.overlayFrame.sceneSpotlights = [
    {
      id: 'outer',
      phase: 'hold',
      progress: 1,
      spotlight: { ...createQuickEditSpotlight(), effect: 'magnify', magnification: 2 },
    },
  ];
  const sampling = {
    sourceRasterScaleForDemand: () => undefined,
    forDemand: () => f.media,
    effectMedia: () => f.media,
    renderDimensions: () => ({ width: 32, height: 16 }),
  };
  f.input.preparedFrame = {
    passes: f.passes,
    rasterScale: 1,
    compositionTime: 1,
    sourcePresentation: new Map(),
    sourceFrames: {
      nominal: f.media,
      bindings: new Map(),
      media: () => f.media,
      sampling: () => sampling,
      release() {},
    },
  };
  const demandTiles = new Map<string, HTMLCanvasElement>();
  const sourceForFrame: NonNullable<
    Parameters<typeof buildNativeGpuPreviewLayers>[0]['sourceForFrame']
  > = (_frame, time, _layers, demand = 'body') => {
    const key = `${time}/${demand}`;
    let image = demandTiles.get(key);
    if (!image) {
      image = document.createElement('canvas');
      image.width = 128;
      image.height = 64;
      demandTiles.set(key, image);
    }
    const tile = image;
    return {
      frames: f.sources,
      media: new Map([
        [
          clipId,
          {
            ...f.borrowed,
            preparedSampling: {
              sourceKey: {},
              sourceTime: time,
              passTime: time,
              sourceSize: { width: 32, height: 16 },
              drawPrepared: () => true,
              visitPreparedTiles(_id, consume) {
                consume({
                  image: tile,
                  physicalSourceRect: { x: 0, y: 0, width: 128, height: 64 },
                  originalPixelROI: { x: 0, y: 0, width: 32, height: 16 },
                });
                return true;
              },
            },
          },
        ],
      ]),
    };
  };
  let current = 0;
  const snapshots: Array<HTMLCanvasElement & { close(): void }> = [];
  const sceneReads: number[] = [];
  const plan = await buildNativeGpuPreviewLayers({
    ...f,
    sourceForFrame,
    effects: {
      overlayFrames: new Map(),
      framesByTime: new Map(),
      prepareVisualPass: async (time) => {
        current = time;
      },
    },
    snapshotGroup: async (group) => {
      const nodes = flatten(group.layers);
      if (nodes.some((node) => node.source === demandTiles.get(`${current}/sceneLens:outer`))) {
        sceneReads.push(current);
        expect(group.output).toEqual({ width: 64, height: 32 });
      }
      const image = Object.assign(document.createElement('canvas'), { close: vi.fn() });
      image.width = group.output.width;
      image.height = group.output.height;
      snapshots.push(image);
      return image;
    },
  });
  plans.push(plan);
  expect(sceneReads).toEqual([0.99, 1.01]);
  expect(snapshots).toHaveLength(4);
  const nodes = flatten(plan.layers);
  for (const snapshot of snapshots)
    expect(nodes.some((node) => node.source === snapshot)).toBe(true);
  plan.release();
  for (const snapshot of snapshots) expect(snapshot.close).toHaveBeenCalledOnce();
});

it.each(['operationClip', 'depth'] as const)(
  'retains the original parent target for direct %s semantics above the effect output pixel limit',
  async (kind) => {
    const f = fixture();
    const clipId = f.passes.overlayFrame.visualLayers[0]!.clipId;
    const depth = {
      frame: {
        rotation: [0, 0, 0, 1] as const,
        perspective: 1,
        windowMotion: 1,
        lockBackground: true,
        reference: { x: 0, y: 0, width: 32, height: 16 },
        focus: [],
      },
      window: { x: 0, y: 0, width: 32, height: 16 },
    };
    const child: GpuPreviewLayer = {
      source: f.input.canvas,
      rect: { x: 0, y: 0, width: 32, height: 16 },
      inverse: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      ...(kind === 'operationClip' ? { operationClip: { source: f.input.canvas } } : { depth }),
    };
    const group: import('../../../features/video/composition/canvas/gpu-preview').GpuPreviewGroup =
      {
        kind: 'group',
        output: { width: 3584, height: 2464 },
        logical: { width: 32, height: 16 },
        layers: [child],
      };
    const frame: import('../../../features/video/composition/effect-runtime/runtime/types').EffectRuntimeGpuPreparedFrame =
      {
        source: group,
        effectInstanceId: 'large',
        snapshotId: 'large',
        kind: 'targetEffect',
        target: {
          kind: 'clip',
          clipId,
          chainIndex: 0,
          placement: { x: 0, y: 0, width: 32, height: 16, rotation: 0, opacity: 1 },
        },
        width: 128,
        height: 64,
        logicalWidth: 32,
        logicalHeight: 16,
        retain: () => ({ release() {} }),
        dispose() {},
      };
    const frames = new Map([['large', frame]]);
    const sampling = {
      sourceRasterScaleForDemand: () => undefined,
      forDemand: () => f.media,
      effectMedia: () => f.media,
      renderDimensions: () => ({ width: 128, height: 64 }),
    };
    f.input.preparedFrame = {
      passes: f.passes,
      rasterScale: 1,
      compositionTime: 1,
      sourcePresentation: new Map(),
      sourceFrames: {
        nominal: f.media,
        bindings: new Map(),
        media: () => f.media,
        sampling: () => sampling,
        release() {},
      },
    };
    f.passes.overlayFrame.camera.scale = 2;
    f.passes.visualPasses[0]!.frame.camera.scale = 2;
    const plan = await buildNativeGpuPreviewLayers({
      ...f,
      effects: {
        kind: 'gpu-scene',
        overlayFrames: frames,
        framesByTime: new Map([[1, frames]]),
        dispose() {},
      },
    });
    plans.push(plan);
    const owner = flatten(plan.layers).find(
      (layer) =>
        'kind' in layer.source &&
        layer.source.kind === 'group' &&
        layer.source.layers.some((layer) => layer.source === f.input.canvas)
    );
    if (!owner || !('kind' in owner.source) || owner.source.kind !== 'group')
      throw new Error('Missing destination-sensitive target');
    expect(owner.source.logical).toEqual({ width: 32, height: 16 });
    expect(owner.source.output).toEqual(group.output);
    expect(owner.source.layers[0]!.inverse).toEqual(child.inverse);
    expect(owner.source.layers[0]![kind]).toBe(child[kind]);
    const { EFFECT_RUNTIME_RESOURCE_LIMITS } =
      await import('../../../features/video/composition/effect-runtime/runtime/resource-limits');
    expect(owner.source.output.width * owner.source.output.height).toBeGreaterThan(
      EFFECT_RUNTIME_RESOURCE_LIMITS.maxOutputPixels
    );
    const { validateGpuPreviewFrame } =
      await import('../../../features/video/composition/canvas/gpu-preview-plan');
    expect(() =>
      validateGpuPreviewFrame(
        {
          output: { width: 32, height: 16 },
          logical: { width: 32, height: 16 },
          layers: plan.layers,
          signal: new AbortController().signal,
        },
        8192
      )
    ).not.toThrow();
  }
);

it('keeps repeated post-camera groups and a prepared source ROI within the existing GPU texture budget', async () => {
  const f = fixture();
  f.input.project.width = 1920;
  f.input.project.height = 1080;
  f.input.previewRasterSize = { width: 1920, height: 1080 };
  f.passes.overlayFrame.camera.scale = 4;
  f.passes.visualPasses[0]!.frame.camera.scale = 4;
  f.passes.overlayFrame.sceneSpotlights = [
    { id: 'dim', phase: 'hold', progress: 1, spotlight: createQuickEditSpotlight() },
  ];
  const image = document.createElement('canvas');
  image.width = 128;
  image.height = 64;
  const source: VideoCompositionFrameSource = {
    ...f.borrowed,
    preparedSampling: {
      sourceKey: {},
      sourceTime: 1,
      passTime: 1,
      sourceSize: { width: 32, height: 16 },
      drawPrepared: () => true,
      visitPreparedTiles(_id, consume) {
        consume({
          image,
          physicalSourceRect: { x: 0, y: 0, width: 128, height: 64 },
          originalPixelROI: { x: 0, y: 0, width: 32, height: 16 },
        });
        return true;
      },
    },
  };
  const clipId = f.passes.overlayFrame.visualLayers[0]!.clipId;
  const plan = await buildNativeGpuPreviewLayers({
    ...f,
    sourceForFrame: () => ({ frames: f.sources, media: new Map([[clipId, source]]) }),
  });
  plans.push(plan);
  const nodes = flatten(plan.layers);
  const groups = new Set<
    import('../../../features/video/composition/canvas/gpu-preview').GpuPreviewGroup
  >();
  const rasters = new Set<HTMLCanvasElement>();
  for (const layer of nodes) {
    if ('kind' in layer.source && layer.source.kind === 'group') groups.add(layer.source);
    else if (layer.source instanceof HTMLCanvasElement) rasters.add(layer.source);
  }
  const bytes =
    [...groups].reduce((sum, group) => sum + group.output.width * group.output.height * 4, 0) +
    [...rasters].reduce((sum, raster) => sum + raster.width * raster.height * 4, 0);
  const { MAX_TEXTURE_BYTES } =
    await import('../../../features/video/composition/canvas/gpu-preview-plan');
  expect(bytes).toBeLessThan(MAX_TEXTURE_BYTES);
  const scene = [...groups].find(
    (group) => group.logical.width === 1920 && group.logical.height === 1080
  );
  expect(scene?.output).toEqual({ width: 1920, height: 1080 });
  const sampled = nodes.find((node) => node.source === image);
  expect(sampled?.rect).toEqual({ x: 0, y: 0, width: 32, height: 16 });
  expect(sampled?.source).toBe(image);
  expect(image.width).toBe(128);
  expect(image.height).toBe(64);
});

it('sizes an off-center source lens before its projective camera ancestor', async () => {
  const f = fixture();
  const layer = f.passes.overlayFrame.visualLayers[0]!;
  if (layer.kind !== 'video') throw new Error('Expected video');
  const point = { x: 0.75, y: 0.35 };
  const action = {
    ...clickAction(layer.clipId),
    point,
    gestureFeedback: {
      effect: 'magnify' as const,
      point,
      radius: 3,
      stroke: 1,
      opacity: 1,
      color: '#f00',
      lens: { scale: 2, shape: 'circle' as const, shadow: 0 },
    },
  };
  layer.actions = [action];
  const camera = {
    ...f.passes.overlayFrame.camera,
    scale: 1.3,
    spatial: {
      rotation: [0, Math.sin(0.22), 0, Math.cos(0.22)] as const,
      perspective: 1.5,
      windowMotion: 1,
      lockBackground: true,
      reference: { x: 0, y: 0, width: 32, height: 16 },
      focus: [],
    },
  };
  f.passes.overlayFrame.camera = camera;
  f.passes.visualPasses[0]!.frame.camera = camera;
  const { sourceClickSamplingDemandId } =
    await import('../../../features/video/composition/draw/effects/actions');
  const click = sourceClickSamplingDemandId(action);
  const images = new Map<string, HTMLCanvasElement>();
  const sourceForFrame: NonNullable<
    Parameters<typeof buildNativeGpuPreviewLayers>[0]['sourceForFrame']
  > = (_frame, _time, _layers, demand = 'body') => {
    let image = images.get(demand);
    if (!image) {
      image = document.createElement('canvas');
      image.width = 64;
      image.height = 64;
      images.set(demand, image);
    }
    const tile = image;
    return {
      frames: f.sources,
      media: new Map([
        [
          layer.clipId,
          {
            ...f.borrowed,
            preparedSampling: {
              sourceKey: {},
              sourceTime: 1,
              passTime: 1,
              sourceSize: { width: 32, height: 16 },
              drawPrepared: () => true,
              visitPreparedTiles(_id, consume) {
                for (const x of [0, 16])
                  consume({
                    image: tile,
                    physicalSourceRect: { x: 0, y: 0, width: 64, height: 64 },
                    originalPixelROI: { x, y: 0, width: 16, height: 16 },
                  });
                return true;
              },
            },
          },
        ],
      ]),
    };
  };
  const densityModule =
    await import('../../../features/video/composition/export-enhancement/projection-density');
  const densityProof = vi.spyOn(densityModule, 'samplingRasterSize');
  const plan = await buildNativeGpuPreviewLayers({ ...f, sourceForFrame });
  const actualProjections = densityProof.mock.calls.map(([request]) => request.projection);
  densityProof.mockRestore();
  plans.push(plan);
  const { motionCameraProjection } =
    await import('../../../features/video/composition/motion/spatial');
  const { multiplyQuickEditProjections, scaleQuickEditRectAboutCenter } =
    await import('../../../features/video/composition/motion/spatial-geometry');
  const { samplingRasterSize } =
    await import('../../../features/video/composition/export-enhancement/projection-density');
  const lens = scaleQuickEditRectAboutCenter(
    { x: point.x * 32 - 3, y: point.y * 16 - 3, width: 6, height: 6 },
    2
  );
  const projection = multiplyQuickEditProjections(motionCameraProjection(camera)!, lens);
  const expected = samplingRasterSize({ roi: { x: 0, y: 0, width: 32, height: 16 }, projection });
  const holder = flatten(plan.layers).find(
    (node) =>
      'kind' in node.source &&
      node.source.kind === 'group' &&
      node.source.layers.some((child) => child.source === images.get(click))
  );
  if (!holder || !('kind' in holder.source) || holder.source.kind !== 'group')
    throw new Error('Missing source lens group');
  expect(
    actualProjections.some((actual) =>
      actual.every((value, index) => Math.abs(value - projection[index]!) < 1e-10)
    )
  ).toBe(true);
  expect(holder.source.output.width).toBeLessThan(expected.width);
  expect(holder.source.logical.width).toBeLessThan(32);
});

it('bounds the camera 2x optical scene lens 2x within existing GPU admission and keeps lens coverage', async () => {
  const f = fixture();
  const clip = f.input.project.clips[0]!;
  if (clip.type !== 'VIDEO') throw new Error('Expected video');
  clip.transform = { x: 0, y: 0, width: 1920, height: 1080, rotation: 0, opacity: 1 };
  f.input.project.width = 1920;
  f.input.project.height = 1080;
  f.input.previewRasterSize = { width: 1920, height: 1080 };
  f.passes = resolveVideoCompositionRenderPasses(f.input.project, 1);
  const camera = { ...f.passes.overlayFrame.camera, scale: 2, viewportX: 480, viewportY: 270 };
  f.passes.overlayFrame.camera = camera;
  f.passes.visualPasses[0]!.frame.camera = camera;
  f.passes.overlayFrame.sceneSpotlights = [
    {
      id: 'optical',
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
  const tile = document.createElement('canvas');
  tile.width = 1920;
  tile.height = 1080;
  const sourceForFrame: NonNullable<
    Parameters<typeof buildNativeGpuPreviewLayers>[0]['sourceForFrame']
  > = (_frame, _time, _layers, demand = 'body') => {
    const roi =
      demand === 'body'
        ? { x: 480, y: 270, width: 960, height: 540 }
        : { x: 720, y: 405, width: 480, height: 270 };
    return {
      frames: f.sources,
      media: new Map([
        [
          clip.id,
          {
            ...f.borrowed,
            sourceWidth: 1920,
            sourceHeight: 1080,
            preparedSampling: {
              sourceKey: {},
              sourceTime: 1,
              passTime: 1,
              sourceSize: { width: 1920, height: 1080 },
              drawPrepared: () => true,
              visitPreparedTiles(_id, consume) {
                consume({
                  image: tile,
                  physicalSourceRect: { x: 0, y: 0, width: 1920, height: 1080 },
                  originalPixelROI: roi,
                });
                return true;
              },
            },
          },
        ],
      ]),
    };
  };
  const plan = await buildNativeGpuPreviewLayers({ ...f, sourceForFrame });
  plans.push(plan);
  const { validateGpuPreviewFrame, MAX_TEXTURE_BYTES } =
    await import('../../../features/video/composition/canvas/gpu-preview-plan');
  expect(() =>
    validateGpuPreviewFrame(
      {
        output: { width: 1920, height: 1080 },
        logical: { width: 1920, height: 1080 },
        layers: plan.layers,
        signal: new AbortController().signal,
      },
      8192
    )
  ).not.toThrow();
  const nodes = flatten(plan.layers);
  const groups = new Set<
    import('../../../features/video/composition/canvas/gpu-preview').GpuPreviewGroup
  >();
  const rasters = new Set<HTMLCanvasElement>();
  for (const node of nodes) {
    if ('kind' in node.source && node.source.kind === 'group') groups.add(node.source);
    else if (node.source instanceof HTMLCanvasElement) rasters.add(node.source);
  }
  const bytes =
    [...groups].reduce((sum, group) => sum + group.output.width * group.output.height * 4, 0) +
    [...rasters].reduce((sum, raster) => sum + raster.width * raster.height * 4, 0);
  expect(bytes).toBeLessThan(MAX_TEXTURE_BYTES);
  const lens = nodes.find((node) => node.lens?.optics === 'optical');
  expect(lens?.clip?.rect).toEqual({
    x: lens!.lens!.bounds.x - 2,
    y: lens!.lens!.bounds.y - 2,
    width: lens!.lens!.bounds.width + 4,
    height: lens!.lens!.bounds.height + 4,
  });
  expect(
    nodes.some(
      (node) =>
        'kind' in node.source &&
        node.source.kind === 'group' &&
        node.clip &&
        node.clip.rect.width > node.rect.width
    )
  ).toBe(true);
  const {
    invertQuickEditProjection,
    multiplyQuickEditProjections,
    projectQuickEditPoint,
    scaleQuickEditRectAboutCenter,
  } = await import('../../../features/video/composition/motion/spatial-geometry');
  const positions: Array<{ x: number; y: number }> = [];
  const locate = (
    layers: readonly GpuPreviewLayer[],
    ancestor: import('../../../features/video/composition/motion/spatial-geometry').QuickEditHomography
  ) => {
    for (const layer of layers) {
      const forward = invertQuickEditProjection(layer.inverse)!;
      const lensTransform = layer.lens
        ? scaleQuickEditRectAboutCenter(layer.lens.bounds, layer.lens.scale)
        : ([1, 0, 0, 0, 1, 0, 0, 0, 1] as const);
      const transform = multiplyQuickEditProjections(
        ancestor,
        multiplyQuickEditProjections(forward, lensTransform)
      );
      if ('kind' in layer.source && layer.source.kind === 'group') {
        const group = layer.source;
        const placement = [
          layer.rect.width / group.logical.width,
          0,
          layer.rect.x,
          0,
          layer.rect.height / group.logical.height,
          layer.rect.y,
          0,
          0,
          1,
        ] as const;
        locate(group.layers, multiplyQuickEditProjections(transform, placement));
      } else if (layer.source === tile) {
        positions.push(
          projectQuickEditPoint(transform, {
            x: layer.rect.x + layer.rect.width * 0.3,
            y: layer.rect.y + layer.rect.height * 0.4,
          })!
        );
      }
    }
  };
  locate(plan.layers, [1, 0, 0, 0, 1, 0, 0, 0, 1]);
  expect(positions.length).toBeGreaterThanOrEqual(2);
  for (const point of positions) {
    expect(point.x).toBeCloseTo(576, 9);
    expect(point.y).toBeCloseTo(432, 9);
  }
});

it('keeps destination-in clearing when its unread source group lowers to transparent', async () => {
  const f = fixture();
  const clipId = f.passes.overlayFrame.visualLayers[0]!.clipId;
  const identity = [1, 0, 0, 0, 1, 0, 0, 0, 1] as const;
  const mask: GpuPreviewLayer = {
    source: {
      kind: 'group',
      output: { width: 8, height: 8 },
      logical: { width: 8, height: 8 },
      layers: [
        { source: f.input.canvas, rect: { x: 0, y: 0, width: 8, height: 8 }, inverse: identity },
      ],
    },
    rect: { x: 64, y: 64, width: 8, height: 8 },
    inverse: identity,
    blend: 'mask',
  };
  const source: import('../../../features/video/composition/canvas/gpu-preview').GpuPreviewGroup = {
    kind: 'group',
    output: { width: 32, height: 16 },
    logical: { width: 32, height: 16 },
    layers: [
      { source: f.input.canvas, rect: { x: 0, y: 0, width: 32, height: 16 }, inverse: identity },
      mask,
    ],
  };
  const frame: import('../../../features/video/composition/effect-runtime/runtime/types').EffectRuntimeGpuPreparedFrame =
    {
      source,
      effectInstanceId: 'masked',
      snapshotId: 'masked',
      kind: 'targetEffect',
      target: {
        kind: 'clip',
        clipId,
        chainIndex: 0,
        placement: { x: 0, y: 0, width: 32, height: 16, rotation: 0, opacity: 1 },
      },
      width: 64,
      height: 32,
      logicalWidth: 32,
      logicalHeight: 16,
      retain: () => ({ release() {} }),
      dispose() {},
    };
  const frames = new Map([['masked', frame]]);
  const sampling = {
    sourceRasterScaleForDemand: () => undefined,
    forDemand: () => f.media,
    effectMedia: () => f.media,
    renderDimensions: () => ({ width: 64, height: 32 }),
  };
  f.input.preparedFrame = {
    passes: f.passes,
    rasterScale: 1,
    compositionTime: 1,
    sourcePresentation: new Map(),
    sourceFrames: {
      nominal: f.media,
      bindings: new Map(),
      media: () => f.media,
      sampling: () => sampling,
      release() {},
    },
  };
  const plan = await buildNativeGpuPreviewLayers({
    ...f,
    effects: {
      kind: 'gpu-scene',
      overlayFrames: frames,
      framesByTime: new Map([[1, frames]]),
      dispose() {},
    },
  });
  plans.push(plan);
  const empty = flatten(plan.layers).find(
    (layer) =>
      layer.blend === 'mask' &&
      'kind' in layer.source &&
      layer.source.kind === 'group' &&
      layer.source.layers.length === 0
  );
  expect(empty).toMatchObject({
    blend: 'mask',
    rect: mask.rect,
    inverse: identity,
    source: { output: { width: 1, height: 1 }, layers: [] },
  });
});

it('executes the canonical physical-track GL states with interleaved occlusion and borrowed video frames', async () => {
  const f = fixture();
  const original = f.input.project.clips[0]!;
  const a = { ...original, id: 'A', startTime: 0, duration: 10 };
  const x = { ...original, id: 'X', startTime: 1, duration: 12, timelineLaneId: 'other' };
  const b = { ...original, id: 'B', startTime: 5, duration: 10 };
  const selection = createGlTransitionSelection('CrossZoom')!;
  f.input.project.clips = [a, x, b];
  f.input.project.transitions = [
    {
      id: 'AB',
      leadingClipId: 'A',
      trailingClipId: 'B',
      duration: 5,
      easing: 'LINEAR',
      kind: 'gl',
      selection,
    },
  ];
  f.input.project.cursorTrack = {
    captureMode: 'separate',
    skin: normalizeVideoProjectCursorSkin(undefined),
    samples: [
      {
        id: 'cursor-A',
        time: 6,
        x: 8,
        y: 4,
        recordingPoint: { x: 0.25, y: 0.25 },
        visible: true,
        sourceAnchor: {
          kind: 'recording-source',
          recordingId: 'recording',
          sourceClipId: 'A',
          sourceTime: 6,
        },
      },
      {
        id: 'cursor-B',
        time: 6,
        x: 24,
        y: 12,
        recordingPoint: { x: 0.75, y: 0.75 },
        visible: true,
        sourceAnchor: {
          kind: 'recording-source',
          recordingId: 'recording',
          sourceClipId: 'B',
          sourceTime: 1,
        },
      },
    ],
  };
  f.input.currentTime = 6;
  const aSource = new VideoFrame(f.input.canvas, { timestamp: 6_000_000 });
  const xSource = new VideoFrame(f.input.canvas, { timestamp: 5_000_000 });
  const bSource = new VideoFrame(f.input.canvas, { timestamp: 1_000_000 });
  f.sources = new Map([
    ['A', aSource],
    ['X', xSource],
    ['B', bSource],
  ]);
  f.media = new Map([
    ['A', f.borrowed],
    ['X', f.borrowed],
    ['B', f.borrowed],
  ]);
  f.passes = resolveVideoCompositionRenderPasses(f.input.project, 6);
  expect(f.passes.overlayFrame.glTrackPlans?.size).toBe(1);
  expect([...f.passes.overlayFrame.sourceCursors!.keys()]).toEqual(['A', 'B']);
  expect(f.passes.overlayFrame.sourceCursors!.get('A')?.x).not.toBe(
    f.passes.overlayFrame.sourceCursors!.get('B')?.x
  );
  expect(f.passes.overlayFrame.cursor).toBeNull();
  const plan = await buildNativeGpuPreviewLayers(f);
  plans.push(plan);
  const gl = flatten(plan.layers).find(
    (layer) => 'kind' in layer.source && layer.source.kind === 'group' && layer.source.composition
  );
  if (!gl || !('kind' in gl.source) || gl.source.kind !== 'group')
    throw new Error('Expected production GL group.');
  expect(gl.source.composition).toEqual({ kind: 'gl-transition', selection, progress: 0.2 });
  const before = gl.source.layers[0]!,
    after = gl.source.layers[1]!;
  expect(flatten([before]).map((layer) => layer.source)).toContain(aSource);
  expect(flatten([before]).map((layer) => layer.source)).toContain(xSource);
  expect(flatten([before]).map((layer) => layer.source)).not.toContain(bSource);
  expect(flatten([after]).map((layer) => layer.source)).not.toContain(aSource);
  expect(flatten([after]).map((layer) => layer.source)).toContain(xSource);
  expect(flatten([after]).map((layer) => layer.source)).toContain(bSource);
  plan.release();
  expect(aSource.close).not.toHaveBeenCalled();
  expect(xSource.close).not.toHaveBeenCalled();
  expect(bSource.close).not.toHaveBeenCalled();
});

it('attaches source image filters only to the decoded video leaf in the actual Native GPU plan', async () => {
  const f = fixture(),
    layer = f.passes.overlayFrame.visualLayers[0];
  if (layer?.kind !== 'video') throw new Error('Expected video');
  const filters = { version: 1 as const, filters: [createSourceImageFilter('blur', 'blur')] };
  layer.clip = { ...layer.clip, sourceFilters: filters };
  const plan = await buildNativeGpuPreviewLayers(f);
  plans.push(plan);
  const nodes = flatten(plan.layers),
    filtered = nodes.filter((node) => node.imageFilters);
  expect(filtered).toHaveLength(1);
  expect(filtered[0]!.source).toBe(f.source);
  expect(filtered[0]!.imageFilters).toEqual({
    stack: filters,
    logical: { width: 32, height: 16 },
    projectTime: f.input.currentTime,
  });
  expect(nodes.filter((node) => node.source !== f.source).every((node) => !node.imageFilters)).toBe(
    true
  );
  expect(f.borrowed.draw).not.toHaveBeenCalled();
});

it('uses the unrotated source filter extent for a quarter-turn Native frame', async () => {
  const f = fixture(),
    layer = f.passes.overlayFrame.visualLayers[0];
  if (layer?.kind !== 'video') throw new Error('Expected video');
  const filters = { version: 1 as const, filters: [createSourceImageFilter('blur', 'blur')] };
  layer.clip = { ...layer.clip, sourceFilters: filters };
  f.media.set(layer.clipId, {
    ...f.borrowed,
    sourceWidth: 16,
    sourceHeight: 32,
    orientation: { rotation: 90, flip: false },
  });
  const plan = await buildNativeGpuPreviewLayers(f);
  plans.push(plan);
  const source = flatten(plan.layers).find((node) => node.source === f.source);
  expect(source?.orientation).toEqual({ rotation: 90, flip: false });
  expect(source?.imageFilters?.logical).toEqual({ width: 32, height: 16 });
});
