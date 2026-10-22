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
