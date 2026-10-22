import { afterEach, expect, it, vi } from 'vitest';
import { createQuickEditSpotlight } from '../../project/scene/focus-appearance';
import { sampleCompositionSpotlightLayer } from './project-spotlight';
import { createVideoProjectFromRecording } from '../../project/factories/creation';
import { createVideoProjectMotionRegion } from '../../project/motion';
import { bindMotionRegionToClip } from '../../project/motion/source-binding';
import { resolveVideoCompositionFrame } from '../timeline/frame';
import { IDENTITY_TRANSITION_VISUAL_STATE } from '../../project/transition/presentation.types';
import { projectQuickEditPoint } from '../motion/spatial-geometry';
import { resolveCompositionSceneSpotlights } from './project-spotlight';
import { drawCompositionSceneSpotlights } from './project-spotlight';
import { drawSceneSpotlights } from './spotlight';
const geometry = {
  window: { x: 0, y: 0, width: 400, height: 200 },
  extent: { x: -100, y: -100, width: 600, height: 400 },
  scale: 2,
  projection: [1, 0, 0, 0, 1, 0, 0, 0, 1] as const,
};
it('keeps authored protection while a contracting entrance covers a wider opening', () => {
  const frame = sampleCompositionSpotlightLayer({
    ...geometry,
    state: {
      id: 'contract',
      spotlight: { ...createQuickEditSpotlight(), reveal: 'contract' },
      phase: 'enter',
      progress: 0.25,
    },
  });
  expect(frame.protectionOpening).toEqual({ x: 100, y: 50, width: 200, height: 100 });
  expect(frame.opening.width).toBeGreaterThan(200);
  expect(frame.presence).toBe(0.25);
  expect(frame.openingClipProgress).toBe(0.25);
});
it('uses the moving opening as full-strength protection throughout a linked morph', () => {
  const from = {
    ...createQuickEditSpotlight(),
    strength: 0.8,
    area: { x: 0, y: 0, width: 0.5, height: 0.5 },
  };
  const frame = sampleCompositionSpotlightLayer({
    ...geometry,
    state: {
      id: 'morph',
      spotlight: { ...createQuickEditSpotlight(), effect: 'blur', blur: 10 },
      phase: 'enter',
      progress: 0.5,
      from,
    },
  });
  expect(frame.opening).toEqual({ x: 50, y: 25, width: 200, height: 100 });
  expect(frame.protectionOpening).toEqual(frame.opening);
  expect(frame).toMatchObject({ presence: 1, openingClipProgress: 1, dim: 0.4, blur: 10 });
});

function sceneFixture() {
  const project = createVideoProjectFromRecording({
    recordingId: 'source',
    filename: 'source.webm',
    width: 320,
    height: 180,
    duration: 4,
    mimeType: 'video/webm',
    size: 10,
  });
  const clip = project.clips.find((item) => item.type === 'VIDEO')!;
  clip.fitMode = 'STRETCH';
  clip.windowCornerRadius = 12;
  clip.transform = { x: 50, y: 30, width: 160, height: 90, rotation: 0, opacity: 1 };
  const region = bindMotionRegionToClip(
    {
      ...createVideoProjectMotionRegion(project, 0),
      duration: 4,
      spotlight: createQuickEditSpotlight(),
      spotlightTarget: 'scene',
    },
    clip
  );
  project.motionRegions = [region];
  const frame = resolveVideoCompositionFrame(project, 2);
  return {
    project,
    clip,
    frame,
    images: {},
    viewport: { x: 0, y: 0, width: 640, height: 360 },
    composition: { x: 20, y: 10, scale: 2 },
    transform: { a: 2, b: 0, c: 0, d: 2, e: 0, f: 0 },
  };
}

it('projects a bound opening through output fitting and DPR while canvas scope ignores the camera', () => {
  const args = sceneFixture();
  const bound = resolveCompositionSceneSpotlights(args)[0]!;
  expect(bound.protectionOpening).toEqual({ x: 90, y: 52.5, width: 80, height: 45 });
  expect(bound.clip).toMatchObject({ radius: 12, rect: { x: 50, y: 30, width: 160, height: 90 } });
  expect(projectQuickEditPoint(bound.projection!, { x: 130, y: 75 })).toEqual({ x: 560, y: 320 });
  args.frame.sceneSpotlights = args.frame.sceneSpotlights!.map(
    ({ clipId: _clipId, ...state }) => state
  );
  const before = resolveCompositionSceneSpotlights(args)[0]!;
  args.frame.camera = { ...args.frame.camera, scale: 3, viewportX: 20, viewportY: 10 };
  expect(resolveCompositionSceneSpotlights(args)[0]).toEqual(before);
});

it('uses Native clip rotation and transition scale/translation before camera and output fitting', () => {
  const args = sceneFixture();
  const layer = args.frame.visualLayers[0]!;
  layer.rotation = 90;
  layer.renderState = {
    ...IDENTITY_TRANSITION_VISUAL_STATE,
    scaleX: 0.5,
    scaleY: 2,
    translateX: 12,
    translateY: -6,
  };
  const frame = resolveCompositionSceneSpotlights(args)[0]!;
  const corner = projectQuickEditPoint(frame.projection!, { x: 90, y: 52.5 })!;
  expect(corner.x).toBeCloseTo(653, 7);
  expect(corner.y).toBeCloseTo(-24, 7);
});

it('retains camera silhouettes and viewport lock instead of applying the scene camera twice', () => {
  const args = sceneFixture();
  const layer = args.frame.visualLayers[0]!;
  if (layer.kind !== 'video') throw new Error('Expected video');
  layer.trackRole = 'CAMERA';
  layer.clip.cameraAppearance = { shape: 'ellipse', roundness: 0, zoom: 1, panX: 0, panY: 0 };
  args.frame.camera = { ...args.frame.camera, scale: 3, viewportX: 20, viewportY: 10 };
  const frame = resolveCompositionSceneSpotlights(args)[0]!;
  expect(projectQuickEditPoint(frame.projection!, { x: 130, y: 75 })).toEqual({ x: 560, y: 320 });
  expect(frame.clip?.outline).toHaveLength(128);
  expect(frame.clip?.outline?.[0]).toEqual({ x: 1, y: 0.5 });
  expect(frame.clip?.outline?.[32]?.x).toBeCloseTo(0.5, 12);
  expect(frame.clip?.outline?.[32]?.y).toBe(1);
});

it('fades bound scene strength and protection with its concrete clip opacity', () => {
  const args = sceneFixture();
  args.frame.visualLayers[0]!.opacity = 0.37;
  const frame = resolveCompositionSceneSpotlights(args)[0]!;
  expect(frame.dim).toBeCloseTo(0.65 * 0.37, 12);
  expect(frame.presence).toBe(0.37);
});

it('omits unavailable or degenerate attachments without substituting a source or hiding valid masks', () => {
  const args = sceneFixture();
  const canvas = { ...args.frame.sceneSpotlights![0]!, id: 'canvas' };
  delete canvas.clipId;
  args.frame.sceneSpotlights = [...args.frame.sceneSpotlights!, canvas];
  const layer = args.frame.visualLayers[0]!;
  layer.renderState = { ...IDENTITY_TRANSITION_VISUAL_STATE, scaleX: 0 };
  expect(resolveCompositionSceneSpotlights(args)).toHaveLength(1);
  args.frame.visualLayers = [];
  expect(resolveCompositionSceneSpotlights(args)).toHaveLength(1);
  args.frame.sceneSpotlights = [{ ...canvas, clipId: 'another-instance' }];
  expect(resolveCompositionSceneSpotlights(args)).toEqual([]);
});

vi.mock('./spotlight', async (original) => ({
  ...(await original<typeof import('./spotlight')>()),
  drawSceneSpotlights: vi.fn(),
}));
afterEach(() => vi.clearAllMocks());

it('skips a bound window behind the scene plane instead of masking another instance', () => {
  const args = sceneFixture();
  args.frame.visualLayers[0]!.x = -100000;
  args.frame.camera.spatial = {
    reference: { x: 0, y: 0, width: 320, height: 180 },
    rotation: [0, Math.sin((35 * Math.PI) / 360), 0, Math.cos((35 * Math.PI) / 360)],
    perspective: 0.5,
    windowMotion: 0,
    lockBackground: true,
    focus: [],
  };
  expect(resolveCompositionSceneSpotlights(args)).toEqual([]);
});

it.each([false, true])(
  'restores the output context when scene mask drawing fails with source scope=%s',
  (sourceScope) => {
    const args = sceneFixture();
    if (sourceScope) args.frame.sceneSpotlights![0]!.afterClipId = args.clip.id;
    const context = {
      canvas: { width: 1280, height: 720 },
      getTransform: () => args.transform,
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      rect: vi.fn(),
      clip: vi.fn(),
      setTransform: vi.fn(),
    };
    vi.mocked(drawSceneSpotlights).mockImplementationOnce(() => {
      throw new Error('mask failed');
    });
    expect(() =>
      drawCompositionSceneSpotlights({
        ...args,
        ...(sourceScope ? { afterClipId: args.clip.id } : {}),
        context: context as unknown as CanvasRenderingContext2D,
      })
    ).toThrow('mask failed');
    expect(context.rect).toHaveBeenCalledWith(0, 0, 640, 360);
    expect(context.setTransform).toHaveBeenCalledWith(1, 0, 0, 1, 0, 0);
    expect(context.restore).toHaveBeenCalledOnce();
  }
);

it.each([false, true])(
  'projects inner source masks without moving the window clip: source=%s',
  (source) => {
    const args = sceneFixture();
    const layer = args.frame.visualLayers[0]!;
    if (layer.kind !== 'video') throw new Error('Expected video');
    layer.sourceContentTransform = [2, 0, -50, 0, 2, -30, 0, 0, 1];
    args.frame.sceneSpotlights = args.frame.sceneSpotlights!.map((state) => ({
      ...state,
      ...(source ? { coordinateSpace: 'source-window' as const } : {}),
      spotlight: { ...state.spotlight, effect: 'blur' as const, blur: 5 },
    }));
    const mask = resolveCompositionSceneSpotlights(args)[0]!;
    expect(mask.protectionOpening).toEqual(
      source ? { x: 130, y: 75, width: 160, height: 90 } : { x: 90, y: 52.5, width: 80, height: 45 }
    );
    expect(mask.clip).toMatchObject({ radius: 12, rect: { x: 50, y: 30, width: 160, height: 90 } });
    expect(mask.blur).toBe(source ? 40 : 20);
  }
);

it.each(['dim', 'blur'] as const)(
  'samples an explicit composed source only for active %s blur',
  (effect) => {
    const args = sceneFixture();
    args.frame.sceneSpotlights![0]!.spotlight.effect = effect;
    const context = {
      canvas: { width: 1280, height: 720 },
      getTransform: () => args.transform,
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      rect: vi.fn(),
      clip: vi.fn(),
      setTransform: vi.fn(),
    };
    const snapshot = { width: 1280, height: 720 };
    const blurSource = vi.fn(() => snapshot as HTMLCanvasElement);
    drawCompositionSceneSpotlights({
      ...args,
      context: context as unknown as CanvasRenderingContext2D,
      blurSource,
    });
    expect(blurSource).toHaveBeenCalledTimes(effect === 'blur' ? 1 : 0);
    expect(vi.mocked(drawSceneSpotlights).mock.lastCall?.[1]).toBe(
      effect === 'blur' ? snapshot : context.canvas
    );
  }
);

it.each(['dim', 'blur'] as const)(
  'retains the authored %s kernel and carries Native crossfade coverage separately',
  (effect) => {
    const args = sceneFixture();
    const original = args.frame.visualLayers[0]!;
    if (original.kind !== 'video') throw new Error('Expected source video.');
    args.frame.visualLayers = [0.25, 0.75].map((weight, index) => ({
      ...original,
      clipId: index ? 'trailing' : original.clipId,
      clip: { ...original.clip, id: index ? 'trailing' : original.clipId },
      opacity: weight,
      renderState: { ...original.renderState, opacityMultiplier: weight },
    }));
    const transition = {
      id: 'authored-focus-crossfade',
      blend: true as const,
      leadingClipId: original.clipId,
      trailingClipId: 'trailing',
    };
    args.frame.sceneSpotlights = args.frame.visualLayers.map((layer, index) => ({
      ...args.frame.sceneSpotlights![0]!,
      id: `mask-${index}`,
      clipId: layer.clipId,
      afterClipId: 'trailing',
      sourceTransition: transition,
      spotlight: { ...createQuickEditSpotlight(), effect },
      phase: 'hold',
      progress: 1,
    }));
    const before = structuredClone(args.frame);
    const layers = resolveCompositionSceneSpotlights(args);
    const full = sampleCompositionSpotlightLayer({
      ...geometry,
      state: args.frame.sceneSpotlights[0]!,
      window: layers[0]!.protectionOpening!,
      scale: 4,
    });
    expect(layers.map((layer) => layer.blend)).toEqual([
      { groupId: transition.id, weight: 0.25 },
      { groupId: transition.id, weight: 0.75 },
    ]);
    expect(layers.map((layer) => layer.presence)).toEqual([0.25, 0.75]);
    if (effect === 'dim') expect(layers.map((layer) => layer.dim)).toEqual([0.65, 0.65]);
    else {
      expect(full.blur).toBe(48);
      expect(layers.map((layer) => layer.blur)).toEqual([48, 48]);
    }
    expect(args.frame).toEqual(before);
  }
);
