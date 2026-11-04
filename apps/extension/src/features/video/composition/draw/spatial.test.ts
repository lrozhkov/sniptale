// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import { createQuickEditBorder } from '../../project/scene/focus-appearance';
import { createVideoClip, createImageClip } from '../../project/timeline/project-meta.test.helpers';
import { createDefaultCameraState } from '../motion/defaults';
import { IDENTITY_TRANSITION_VISUAL_STATE } from '../../project/transition/presentation.types';
import type { VideoCompositionActionState, VideoCompositionVisualLayer } from '../types';
import { drawSpatialCompositionGroup, drawSpatialSceneOverlays } from './spatial';
import { drawCursorCompositionState, resolveCursorCompositionPaintBounds } from './effects/cursor';
import { drawActionCompositionState, resolveActionCompositionPaintBounds } from './effects/actions';
import { drawSpatialCameraGroup } from '../canvas/spatial-group';
import { drawCompositionVisualLayer } from './visual';
import { drawEffectRuntimeVisualLayer } from './effect-runtime';

vi.mock('../canvas/spatial-group', () => ({ drawSpatialCameraGroup: vi.fn() }));
vi.mock('./visual', () => ({ drawCompositionVisualLayer: vi.fn() }));
vi.mock('./effect-runtime', async (original) => ({
  ...(await original<typeof import('./effect-runtime')>()),
  drawEffectRuntimeVisualLayer: vi.fn(() => false),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(drawEffectRuntimeVisualLayer).mockImplementation(() => false);
  vi.mocked(drawCompositionVisualLayer).mockImplementation((context, layer) => {
    context.save();
    context.globalAlpha = layer.opacity;
    if (layer.effectActionsOnly) {
      context.fillStyle = '#ff0000';
      context.fillRect(10, 10, 10, 10);
    } else {
      context.fillStyle = '#0000ff';
      context.fillRect(layer.x, layer.y, layer.width, layer.height);
    }
    context.restore();
  });
  vi.mocked(drawSpatialCameraGroup).mockImplementation((args) => {
    const source = document.createElement('canvas');
    source.width = 80;
    source.height = 40;
    args.paint(source.getContext('2d')!, 1);
    args.context.drawImage(source, 0, 0);
    return true;
  });
});
const output = { width: 80, height: 40 };
function video(): Extract<VideoCompositionVisualLayer, { kind: 'video' }> {
  const event: VideoCompositionActionState['event'] = {
    id: 'click',
    kind: 'CLICK',
    label: 'Click',
    anchor: { kind: 'project', time: 0 },
    data: {},
    point: { x: 0.2, y: 0.2 },
  };
  const action: VideoCompositionActionState = {
    clipId: 'a',
    duration: 1,
    event,
    occurrence: {
      event,
      eventId: event.id,
      clipId: 'a',
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
  const clip = createVideoClip({ id: 'a', shadowIntensity: 0 });
  return {
    clip,
    clipId: clip.id,
    kind: 'video',
    x: 0,
    y: 0,
    ...output,
    rotation: 0,
    opacity: 1,
    zIndex: 0,
    renderState: IDENTITY_TRANSITION_VISUAL_STATE,
    actions: [action],
  };
}
function setup(layers: VideoCompositionVisualLayer[]) {
  const canvas = document.createElement('canvas');
  canvas.width = output.width;
  canvas.height = output.height;
  const context = canvas.getContext('2d')!;
  const renderer = { validateSizes: vi.fn(), surface: vi.fn(), draw: vi.fn(), dispose: vi.fn() };
  const args = {
    camera: {
      ...createDefaultCameraState(output),
      spatial: {
        rotation: [0, 0, 0, 1] as const,
        perspective: 0,
        windowMotion: 0,
        lockBackground: false,
        focus: [],
        reference: { x: 0, y: 0, ...output },
      },
    },
    clipMediaElements: new Map(),
    context,
    destination: { x: 0, y: 0, ...output },
    effectState: { drawnTransitionIds: new Set<string>() },
    imageBank: {},
    layers,
    logicalSize: output,
    output,
    rasterScale: 1,
    renderer,
  };
  return { args, context };
}
function pixel(context: CanvasRenderingContext2D) {
  return Array.from(context.getImageData(15, 15, 1, 1).data);
}

it('keeps lower source actions occluded by an opaque or translucent higher media layer', () => {
  const lower = video(),
    clip = createImageClip({ shadowIntensity: 0 });
  const higher: VideoCompositionVisualLayer = {
    clip,
    clipId: clip.id,
    kind: 'image',
    x: 0,
    y: 0,
    ...output,
    rotation: 0,
    opacity: 1,
    zIndex: 1,
    renderState: IDENTITY_TRANSITION_VISUAL_STATE,
  };
  for (const [opacity, expected] of [
    [1, [0, 0, 255, 255]],
    [0.5, [127, 0, 128, 255]],
    [0, [255, 0, 0, 255]],
  ] as const) {
    const { args, context } = setup([lower, { ...higher, opacity }]);
    expect(drawSpatialCompositionGroup(args)).toBe(true);
    const actual = pixel(context);
    expected.forEach((value, index) =>
      expect(Math.abs(actual[index]! - value)).toBeLessThanOrEqual(1)
    );
  }
  expect(lower.actions).toHaveLength(1);
  const calls = vi.mocked(drawSpatialCameraGroup).mock.calls;
  expect(
    vi
      .mocked(drawEffectRuntimeVisualLayer)
      .mock.calls.every(([arg]) => arg.layer.kind !== 'video' || !arg.layer.actions?.length)
  ).toBe(true);
  expect(calls.filter(([arg]) => arg.sharp)).toHaveLength(3);
});

it('uses one pose and raster reference for blur and sharp passes without duplicating processed actions', () => {
  const layer = video();
  const { args } = setup([layer, { ...layer, effectActionsOnly: true }]);
  drawSpatialCompositionGroup(args);
  const calls = vi.mocked(drawSpatialCameraGroup).mock.calls;
  expect(calls).toHaveLength(2);
  expect(calls[0]![0].camera).toBe(calls[1]![0].camera);
  expect(calls[0]![0].sourceRect).toEqual(calls[1]![0].sourceRect);
  expect(
    vi.mocked(drawCompositionVisualLayer).mock.calls.filter(([, item]) => item.effectActionsOnly)
  ).toHaveLength(1);
});

it('retains the incoming effect draw state separately for the sharp occlusion masks', () => {
  const layer = video();
  const { args } = setup([layer]);
  args.effectState.drawnTransitionIds.add('already-drawn');
  const seen: string[][] = [];
  vi.mocked(drawEffectRuntimeVisualLayer).mockImplementation(({ state }) => {
    seen.push([...state.drawnTransitionIds]);
    state.drawnTransitionIds.add('new-transition');
    return false;
  });
  drawSpatialCompositionGroup(args);
  expect(seen).toEqual([['already-drawn'], ['already-drawn']]);
  expect([...args.effectState.drawnTransitionIds]).toEqual(['already-drawn', 'new-transition']);
});

it('allocates no sharp pass without source actions and keeps ordinary cameras off spatial drawing', () => {
  const layer = { ...video(), actions: [] };
  const { args } = setup([layer]);
  drawSpatialCompositionGroup(args);
  expect(drawSpatialCameraGroup).toHaveBeenCalledOnce();
  vi.mocked(drawSpatialCameraGroup).mockClear();
  expect(drawSpatialCompositionGroup({ ...args, camera: createDefaultCameraState(output) })).toBe(
    false
  );
  expect(drawSpatialCameraGroup).not.toHaveBeenCalled();
});

it.each(['ARROW', 'DOT', 'RING', 'CROSSHAIR'] as const)(
  'captures actual %s cursor ink, animation and shadow within raster bounds',
  (preset) => {
    for (const animationPreset of ['NONE', 'PRESS', 'PULSE', 'BREATHE', 'FLOAT'] as const)
      for (const scale of [0.15, 0.7, 2])
        for (const shadow of [false, true]) {
          const canvas = document.createElement('canvas');
          canvas.width = 384;
          canvas.height = 384;
          const context = canvas.getContext('2d')!;
          const cursor = {
            visible: true,
            preset,
            animationPreset,
            captureMode: 'separate' as const,
            color: '#ffffff',
            scale,
            shadow,
            time: 0.25,
            x: 128,
            y: 128,
          };
          const bounds = resolveCursorCompositionPaintBounds(cursor)!;
          drawCursorCompositionState(context, cursor);
          const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
          let count = 0,
            outside = 0;
          for (let y = 0; y < canvas.height; y++)
            for (let x = 0; x < canvas.width; x++) {
              if (data[(y * canvas.width + x) * 4 + 3]! < 2) continue;
              count++;
              if (
                x < Math.floor(bounds.x) ||
                y < Math.floor(bounds.y) ||
                x >= Math.ceil(bounds.x + bounds.width) ||
                y >= Math.ceil(bounds.y + bounds.height)
              )
                outside++;
            }
          expect(count).toBeGreaterThan(0);
          expect(outside, JSON.stringify({ preset, scale, shadow, bounds })).toBe(0);
        }
  }
);

it('keeps off-canvas action, path and area ink inside their source capture', () => {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext('2d')!;
  const action = {
    ...video().actions![0]!,
    point: { x: 130, y: 90 },
    gestureFeedback: {
      effect: 'press' as const,
      point: { x: 130, y: 90 },
      radius: 30,
      stroke: 7,
      opacity: 1,
      color: '#ffffff',
      path: [
        { x: 8, y: 40 },
        { x: 160, y: 150 },
      ],
      area: { x: 6, y: 6, width: 180, height: 170 },
    },
  };
  const bounds = resolveActionCompositionPaintBounds(action, 0.1)!;
  drawActionCompositionState(context, action, null, 0.1);
  const data = context.getImageData(0, 0, 256, 256).data;
  let count = 0,
    outside = 0;
  for (let y = 0; y < 256; y++)
    for (let x = 0; x < 256; x++) {
      if (data[(y * 256 + x) * 4 + 3]! < 2) continue;
      count++;
      if (
        x < bounds.x - 1 ||
        y < bounds.y - 1 ||
        x > bounds.x + bounds.width ||
        y > bounds.y + bounds.height
      )
        outside++;
    }
  expect(count).toBeGreaterThan(0);
  expect(outside).toBe(0);
});

it('projects global content sharp in action order around viewport keystrokes and then the cursor', () => {
  const { args } = setup([]);
  const first = { ...video().actions![0]!, clipId: null, point: { x: -10, y: 15 } };
  const key = {
    ...first,
    keyStyle: {
      position: 'top-left',
      fontFamily: 'sans-serif',
      fontSize: 8,
      color: '#fff',
      background: '#000',
      opacity: 1,
      cornerRadius: 2,
      margin: 0,
      entrance: 'none',
    } as const,
    renderKind: 'keystroke' as const,
    event: { ...first.event, label: 'Ctrl+K' },
  };
  const cursor = {
    visible: true,
    x: 70,
    y: 30,
    scale: 1,
    shadow: true,
    time: 0.25,
    color: '#fff',
    preset: 'ARROW' as const,
    captureMode: 'separate' as const,
    animationPreset: 'FLOAT' as const,
  };
  const order: string[] = [];
  vi.mocked(drawSpatialCameraGroup).mockImplementation((input) => {
    order.push('spatial');
    expect(input.sharp).toBe(true);
    expect(input.camera).toBe(args.camera);
    return true;
  });
  vi.spyOn(args.context, 'fillText').mockImplementation(() => {
    order.push('key');
  });
  const spatialRenderer = vi.fn(() => args.renderer);
  expect(
    drawSpatialSceneOverlays({ ...args, actions: [first, key, first], cursor, spatialRenderer })
  ).toBe(true);
  expect(order).toEqual(['spatial', 'key', 'spatial', 'spatial']);
  expect(spatialRenderer).toHaveBeenCalledTimes(3);
  expect(vi.mocked(drawSpatialCameraGroup).mock.calls[0]![0].sourceRect.x).toBeLessThan(-10);
  const snapshot = structuredClone([first, key, cursor]);
  drawSpatialSceneOverlays({ ...args, actions: [first, key], cursor, spatialRenderer });
  expect([first, key, cursor]).toEqual(snapshot);
});

it('avoids resources for plain or key-only overlays and refuses unavailable spatial painting', () => {
  const { args } = setup([]);
  const spatialRenderer = vi.fn(() => args.renderer);
  const base = { ...args, actions: [], cursor: null, spatialRenderer };
  expect(drawSpatialSceneOverlays({ ...base, camera: createDefaultCameraState(output) })).toBe(
    false
  );
  expect(drawSpatialSceneOverlays(base)).toBe(true);
  const key = {
    ...video().actions![0]!,
    renderKind: 'keystroke' as const,
    event: { ...video().actions![0]!.event, label: 'Ctrl+K' },
  };
  expect(drawSpatialSceneOverlays({ ...base, actions: [key] })).toBe(true);
  expect(spatialRenderer).not.toHaveBeenCalled();
  expect(drawSpatialCameraGroup).not.toHaveBeenCalled();
  const { spatialRenderer: _provider, ...missing } = base;
  expect(() => drawSpatialSceneOverlays({ ...missing, actions: [video().actions![0]!] })).toThrow(
    'Perspective renderer is unavailable.'
  );
});

it('paints a deferred source border in the sharp projection without replaying source pixels', () => {
  const layer = video();
  layer.actions = [];
  layer.effectActionsOnly = true;
  layer.deferSourceBorders = true;
  layer.borders = [
    {
      id: 'border',
      border: createQuickEditBorder(),
      clock: {
        time: 1,
        duration: 3,
        enter: { type: 'none', duration: 0 },
        exit: { type: 'none', duration: 0 },
      },
    },
  ];
  const { args } = setup([layer]);
  drawSpatialCompositionGroup(args);
  expect(drawEffectRuntimeVisualLayer).not.toHaveBeenCalled();
  expect(drawSpatialCameraGroup).toHaveBeenCalledTimes(2);
  expect(vi.mocked(drawSpatialCameraGroup).mock.calls[1]![0].sharp).toBe(true);
  expect(drawCompositionVisualLayer).toHaveBeenCalledExactlyOnceWith(
    expect.anything(),
    expect.objectContaining({
      effectActionsOnly: true,
      deferSourceBorders: true,
      borders: layer.borders,
    }),
    1,
    1,
    expect.anything(),
    expect.anything()
  );
});

import type { ReviewSpatialRenderer } from '../canvas/spatial-renderer';
import type { VideoCompositionCameraState } from '../types';
import { DEFAULT_CAMERA_DEPTH } from '../../project/motion/spatial';
import { projectQuickEditPoint } from '../motion/spatial-geometry';

function sharpRenderer() {
  const surface = vi.fn<ReviewSpatialRenderer['surface']>((_kind, width, height) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return { canvas, context: canvas.getContext('2d')! };
  });
  const draw = vi.fn<ReviewSpatialRenderer['draw']>((context, request) => {
    const h = request.projection!;
    context.save();
    context.setTransform(h[0], h[3], h[1], h[4], h[2], h[5]);
    context.drawImage(
      request.source,
      request.sourceRect.x,
      request.sourceRect.y,
      request.sourceRect.width,
      request.sourceRect.height
    );
    context.restore();
  });
  return {
    surface,
    draw,
    validateSizes: vi.fn<ReviewSpatialRenderer['validateSizes']>(),
    dispose: vi.fn(),
  };
}

it('projects a dense3D lens ROI with unchanged geometry and evaluated DOF compensation', () => {
  const { args } = setup([video()]);
  const renderer = sharpRenderer();
  const camera: VideoCompositionCameraState = {
    ...args.camera,
    spatial: {
      ...args.camera.spatial,
      perspective: 0.5,
      rotation: [0, Math.sin(Math.PI / 12), 0, Math.cos(Math.PI / 12)],
      focus: [{ settings: { ...DEFAULT_CAMERA_DEPTH, enabled: true }, weight: 0.4 }],
    },
  };
  const before = structuredClone(camera);
  const projection = [3, 0.1, -30, 0.2, 3, -20, 0.001, 0.0005, 1] as const;
  drawSpatialCompositionGroup({
    ...args,
    camera,
    renderer,
    sourceRasterScale: 3,
    sharpOutput: {
      projection,
      output: { width: 50, height: 20 },
      destination: { x: 0, y: 0, width: 50, height: 20 },
    },
  });
  expect(drawSpatialCameraGroup).not.toHaveBeenCalled();
  expect(renderer.surface.mock.calls.filter(([kind]) => kind === 'exposure')).toEqual([
    ['exposure', 50, 20],
    ['exposure', 50, 20],
  ]);
  for (const [, request] of renderer.draw.mock.calls) {
    expect(request.projection).toEqual(projection);
    expect(request.output).toEqual({ width: 50, height: 20 });
    expect(projectQuickEditPoint(request.projection!, { x: 20, y: 10 })).toEqual({
      x: 31 / 1.025,
      y: 14 / 1.025,
    });
    expect(request.frame.focus[0]!.weight).toBeCloseTo((0.4 * 80) / 50, 12);
    expect(request.source.width / request.sourceRect.width).toBeCloseTo(3, 12);
    expect(request.source.height / request.sourceRect.height).toBeCloseTo(3, 12);
  }
  expect(camera).toEqual(before);
  const body = renderer.draw.mock.calls[0]![1];
  expect(body.frame.focus[0]!.weight * body.output.width).toBeCloseTo(0.4 * args.output.width, 12);
});

it('retains translucent higher-layer occlusion and sharp action alpha in the direct ROI path', () => {
  const lower = video(),
    clip = createImageClip({ shadowIntensity: 0 });
  const higher: VideoCompositionVisualLayer = {
    clip,
    clipId: clip.id,
    kind: 'image',
    x: 0,
    y: 0,
    ...output,
    rotation: 0,
    opacity: 0.5,
    zIndex: 1,
    renderState: IDENTITY_TRANSITION_VISUAL_STATE,
  };
  const { args, context } = setup([lower, higher]);
  const before = context.getTransform();
  drawSpatialCompositionGroup({
    ...args,
    renderer: sharpRenderer(),
    sourceRasterScale: 2,
    sharpOutput: {
      projection: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      output,
      destination: { x: 0, y: 0, ...output },
    },
  });
  expect(pixel(context)).toEqual([127, 0, 128, 255]);
  expect(context.getTransform()).toEqual(before);
  expect(
    vi.mocked(drawCompositionVisualLayer).mock.calls.filter(([, layer]) => layer.effectActionsOnly)
  ).toHaveLength(1);
});

it.each(['zero-output', 'singular-projection', 'device-admission'] as const)(
  'refuses %s before sharp-stage allocation or publication',
  (failure) => {
    const { args, context } = setup([video()]);
    const renderer = sharpRenderer();
    if (failure === 'device-admission')
      renderer.validateSizes.mockImplementation(() => {
        throw new Error('Device admission failed');
      });
    const sharpOutput = {
      projection:
        failure === 'singular-projection'
          ? ([0, 0, 0, 0, 0, 0, 0, 0, 1] as const)
          : ([2, 0, 0, 0, 2, 0, 0, 0, 1] as const),
      output: { width: failure === 'zero-output' ? 0 : 40, height: 20 },
      destination: { x: 0, y: 0, width: 40, height: 20 },
    };
    expect(() => drawSpatialCompositionGroup({ ...args, renderer, sharpOutput })).toThrow();
    expect(renderer.surface).not.toHaveBeenCalled();
    expect(renderer.draw).not.toHaveBeenCalled();
    expect(pixel(context)).toEqual([0, 0, 0, 0]);
  }
);

it('crops a small final-density ROI rather than allocating a full enlarged scene', () => {
  const { args } = setup([]);
  const renderer = sharpRenderer();
  drawSpatialCompositionGroup({
    ...args,
    renderer,
    logicalSize: { width: 1920, height: 1080 },
    sourceRasterScale: 4,
    sharpOutput: {
      projection: [4, 0, -2000, 0, 4, -1000, 0, 0, 1],
      output: { width: 100, height: 80 },
      destination: { x: 0, y: 0, width: 100, height: 80 },
    },
  });
  const source = renderer.surface.mock.calls.find(([kind]) => kind === 'plane')!;
  expect(source[1]).toBeLessThan(300);
  expect(source[2]).toBeLessThan(300);
  expect(renderer.surface.mock.calls.filter(([kind]) => kind === 'exposure')).toEqual([
    ['exposure', 100, 80],
  ]);
});

import { resolveCompositionPaintBounds } from './paint-bounds';
import { resolveReviewSpatialFilterLevels } from '../canvas/spatial-filter-levels';

it.each([1.5, 3])(
  'retains the ordinary fractional capture grid and selected reduction origin at density%s',
  (density) => {
    const layer = { ...video(), x: -2.125, width: 83.25 };
    const { args } = setup([layer]);
    const renderer = sharpRenderer();
    const bounds = resolveCompositionPaintBounds({
      context: args.context,
      layers: args.layers,
      output: args.logicalSize,
      rasterScale: args.rasterScale,
    });
    const left = Math.floor(bounds.x),
      top = Math.floor(bounds.y),
      right = Math.ceil(bounds.x + bounds.width),
      bottom = Math.ceil(bounds.y + bounds.height);
    const fullX = Math.ceil((right - left) * density) / (right - left),
      fullY = Math.ceil((bottom - top) * density) / (bottom - top);
    const stage = {
      projection: [1, 0, -20, 0, 1, -10, 0, 0, 1] as const,
      output: { width: 20, height: 10 },
      destination: { x: 0, y: 0, width: 20, height: 10 },
    };
    drawSpatialCompositionGroup({
      ...args,
      renderer,
      sourceRasterScale: density,
      sharpOutput: stage,
    });
    const request = renderer.draw.mock.calls[0]![1];
    expect(request.source.width / request.sourceRect.width).toBeCloseTo(fullX, 12);
    expect(request.source.height / request.sourceRect.height).toBeCloseTo(fullY, 12);
    const inverse = [1, 0, 20, 0, 1, 10, 0, 0, 1] as const;
    const levels = resolveReviewSpatialFilterLevels({
      inverse,
      output: stage.output,
      precision: 16,
      sourceScale: { x: fullX, y: fullY },
      blurWeights: [],
    });
    const alignment = 2 ** (levels - 1);
    const offsetX = (request.sourceRect.x - left) * fullX,
      offsetY = (request.sourceRect.y - top) * fullY;
    expect(offsetX / alignment).toBeCloseTo(Math.round(offsetX / alignment), 12);
    expect(offsetY / alignment).toBeCloseTo(Math.round(offsetY / alignment), 12);
  }
);
