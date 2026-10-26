// @vitest-environment jsdom
import type { drawCompositionSceneSpotlights } from '../../draw/project-spotlight';
import {
  createEffectRuntimeCompositionResourceLedger,
  closeEffectRuntimeBitmap,
} from '../runtime/resource-limits';
import {
  createQuickEditBorder,
  createQuickEditSpotlight,
} from '../../../project/scene/focus-appearance';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import {
  VideoClipLinkMode,
  VideoMediaFitMode,
  VideoProjectClipType,
} from '../../../project/types/index';
import { IDENTITY_TRANSITION_VISUAL_STATE } from '../../../project/transition/presentation.types';
import type { VideoCompositionVisualLayer } from '../../types';
import { createEffectRuntimeInputMaterializer } from './inputs';
import type { EffectRuntimeFramePlan } from '../runtime/types';

import { createVideoProjectFromRecording } from '../../../project/factories/creation';
import { createEffectHostClip } from '../../../project/factories/overlay-clip';
import { resolveVideoCompositionFrame } from '../../timeline/frame';
import { drawSpatialCompositionGroup } from '../../draw/spatial';
import { createDefaultCameraState } from '../../motion/defaults';
import type { EffectRuntimeRenderedFrameMap } from '../runtime/types';
vi.mock('../../draw/spatial', () => ({ drawSpatialCompositionGroup: vi.fn(() => true) }));

const { drawLayer, drawMask } = vi.hoisted(() => ({ drawLayer: vi.fn(), drawMask: vi.fn() }));
vi.mock('../../draw/project-spotlight', () => ({ drawCompositionSceneSpotlights: drawMask }));
vi.mock('../../draw/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../draw/index')>()),
  drawCompositionVisualLayer: drawLayer,
}));

class FakeBitmap implements ImageBitmap {
  readonly close = vi.fn();
  constructor(
    readonly width: number,
    readonly height: number
  ) {}
}

const clearRect = vi.fn();
const context: Partial<CanvasRenderingContext2D> = {
  clearRect,
  save: vi.fn(),
  restore: vi.fn(),
  scale: vi.fn(),
  translate: vi.fn(),
};

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    context as CanvasRenderingContext2D
  );
  drawLayer.mockReset();
  drawMask.mockReset();
  vi.mocked(drawSpatialCompositionGroup).mockReset().mockReturnValue(true);
  clearRect.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it('keeps the browser bitmap factory bound to its owning window', async () => {
  const bitmap = new FakeBitmap(20, 10);
  const browserCreateBitmap = vi.fn(function (this: unknown) {
    if (this !== window) throw new TypeError('Illegal invocation');
    return Promise.resolve(bitmap);
  });
  vi.stubGlobal('createImageBitmap', browserCreateBitmap);
  const materializer = createEffectRuntimeInputMaterializer({
    clipMediaElements: new Map(),
    imageBank: {},
    visualLayers: [createLayer('clip')],
  });

  await expect(
    materializer.materializeTargetSource(
      createPlan({
        chainIndex: 0,
        clipId: 'clip',
        kind: 'clip',
        placement: { height: 10, opacity: 1, rotation: 0, width: 20, x: 0, y: 0 },
      })
    )
  ).resolves.toBe(bitmap);
  expect(browserCreateBitmap).toHaveBeenCalledOnce();
});

it('materializes an isolated target layer at exact effect dimensions', async () => {
  const bitmap = new FakeBitmap(20, 10);
  const createBitmap = vi.fn().mockResolvedValue(bitmap);
  const materializer = createEffectRuntimeInputMaterializer({
    clipMediaElements: new Map(),
    createBitmap,
    imageBank: {},
    visualLayers: [createLayer('clip')],
  });

  await expect(
    materializer.materializeTargetSource(
      createPlan({
        chainIndex: 0,
        clipId: 'clip',
        kind: 'clip',
        placement: { height: 10, opacity: 1, rotation: 0, width: 20, x: 0, y: 0 },
      })
    )
  ).resolves.toBe(bitmap);
  expect(drawLayer).toHaveBeenCalledWith(
    context,
    expect.objectContaining({ height: 10, opacity: 1, rotation: 0, width: 20, x: 0, y: 0 }),
    1,
    1,
    {},
    expect.any(Map)
  );
});

it('materializes both transition sides and closes the first when the second fails', async () => {
  const from = new FakeBitmap(20, 10);
  const createBitmap = vi.fn().mockResolvedValueOnce(from).mockRejectedValueOnce(new Error('to'));
  const materializer = createEffectRuntimeInputMaterializer({
    clipMediaElements: new Map(),
    createBitmap,
    imageBank: {},
    visualLayers: [createLayer('leading'), createLayer('trailing')],
  });

  await expect(
    materializer.materializeTransitionInputs(
      createPlan({
        kind: 'transition',
        leadingClipId: 'leading',
        trailingClipId: 'trailing',
        transitionId: 't',
      })
    )
  ).rejects.toThrow('EFFECT_RUNTIME_FRAME_INPUT_FAILED');
  expect(from.close).toHaveBeenCalledOnce();
});

it('rejects target/type/layer/context and bitmap-dimension drift', async () => {
  const wrongSize = new FakeBitmap(1, 1);
  const materializer = createEffectRuntimeInputMaterializer({
    clipMediaElements: new Map(),
    createBitmap: vi.fn().mockResolvedValue(wrongSize),
    imageBank: {},
    visualLayers: [createLayer('clip')],
  });
  await expect(
    materializer.materializeTargetSource(createPlan({ clipId: 'host', kind: 'scene' }))
  ).rejects.toThrow();
  await expect(
    materializer.materializeTargetSource(
      createPlan({
        chainIndex: 0,
        clipId: 'missing',
        kind: 'clip',
        placement: { height: 10, opacity: 1, rotation: 0, width: 20, x: 0, y: 0 },
      })
    )
  ).rejects.toThrow();
  await expect(
    materializer.materializeTargetSource(
      createPlan({
        chainIndex: 0,
        clipId: 'clip',
        kind: 'clip',
        placement: { height: 10, opacity: 1, rotation: 0, width: 20, x: 0, y: 0 },
      })
    )
  ).rejects.toThrow();
  expect(wrongSize.close).toHaveBeenCalledOnce();

  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  await expect(
    materializer.materializeTargetSource(
      createPlan({
        chainIndex: 0,
        clipId: 'clip',
        kind: 'clip',
        placement: { height: 10, opacity: 1, rotation: 0, width: 20, x: 0, y: 0 },
      })
    )
  ).rejects.toThrow();
});

function createPlan(target: EffectRuntimeFramePlan['target']): EffectRuntimeFramePlan {
  return {
    assets: [],
    controls: {},
    dimensions: { height: 10, width: 20 },
    renderDimensions: { height: 10, width: 20 },
    documentSha256: 'a'.repeat(64),
    documentSource: '{}',
    duration: 2,
    effectInstanceId: 'effect',
    fps: 30,
    frameIndex: 0,
    kind:
      target.kind === 'clip' || target.kind === 'track' || target.kind === 'video-group'
        ? 'targetEffect'
        : target.kind === 'transition'
          ? 'transition'
          : 'standalone',
    progress: 0,
    snapshotId: 'snapshot',
    target,
    time: 0,
  };
}

function createLayer(clipId: string): VideoCompositionVisualLayer {
  return {
    clip: {
      assetId: `${clipId}-asset`,
      duration: 2,
      fadeInMs: 0,
      fadeOutMs: 0,
      fitMode: VideoMediaFitMode.CONTAIN,
      groupId: null,
      id: clipId,
      linkMode: VideoClipLinkMode.DETACHED,
      muted: false,
      name: clipId,
      startTime: 0,
      trackId: 'track',
      transform: { height: 10, opacity: 1, rotation: 0, width: 20, x: 0, y: 0 },
      transitionIn: 'NONE',
      transitionOut: 'NONE',
      type: VideoProjectClipType.IMAGE,
      volume: 1,
    },
    clipId,
    height: 10,
    kind: 'image',
    opacity: 1,
    renderState: IDENTITY_TRANSITION_VISUAL_STATE,
    rotation: 0,
    width: 20,
    x: 0,
    y: 0,
    zIndex: 0,
  };
}

it('keeps captured actions outside FX input and draws them once in the final overlay', async () => {
  const { drawCompositionVisualLayer, drawCompositionVisualLayerBitmap } =
    await import('../../draw/visual');
  const { createVisualTestContext } = await import('../../draw/visual.test-support');
  Object.assign(context, createVisualTestContext(), { clearRect, arc: vi.fn() });
  drawLayer.mockImplementation(drawCompositionVisualLayer);
  const base = createLayer('captured');
  if (base.kind !== 'image') throw new Error('Expected media fixture');
  const event = {
    id: 'fact',
    kind: 'CLICK' as const,
    label: 'Click',
    data: {},
    point: { x: 0.25, y: 0.5 },
    anchor: {
      kind: 'recording-source' as const,
      recordingId: 'recording',
      sourceInstanceId: 'instance',
      sourceEventId: 'raw',
      sourceTime: 0.5,
    },
  };
  const layer: Extract<VideoCompositionVisualLayer, { kind: 'video' }> = {
    ...base,
    kind: 'video',
    clip: {
      ...base.clip,
      type: 'VIDEO',
      sourceInstanceId: 'instance',
      sourceStart: 0,
      sourceDuration: 2,
    },
    actions: [
      {
        event,
        clipId: base.clipId,
        occurrence: {
          event,
          eventId: event.id,
          clipId: base.clipId,
          time: 0.5,
          sourceInstanceId: 'instance',
          playbackRun: { id: base.clipId, clipIds: [base.clipId] },
        },
        duration: 1,
        point: event.point,
        preset: 'CLICK_RIPPLE',
        renderKind: 'accent',
        progress: 0.5,
        start: 0.5,
      },
    ],
  };
  const source = { sourceWidth: 20, sourceHeight: 10, draw: vi.fn() };
  const materializer = createEffectRuntimeInputMaterializer({
    clipMediaElements: new Map([[layer.clipId, source]]),
    imageBank: {},
    visualLayers: [layer],
    createBitmap: vi.fn().mockResolvedValue(new FakeBitmap(20, 10)),
  });
  const bitmap = await materializer.materializeTargetSource(
    createPlan({
      kind: 'clip',
      chainIndex: 0,
      clipId: layer.clipId,
      placement: { x: 0, y: 0, width: 20, height: 10, rotation: 0, opacity: 1 },
    })
  );
  expect(source.draw).toHaveBeenCalledOnce();
  expect(context.arc).not.toHaveBeenCalled();
  drawCompositionVisualLayerBitmap(context as CanvasRenderingContext2D, layer, bitmap, 1, 1);
  drawCompositionVisualLayer(
    context as CanvasRenderingContext2D,
    { ...layer, effectActionsOnly: true },
    1,
    1,
    {},
    new Map([[layer.clipId, source]])
  );
  expect(source.draw).toHaveBeenCalledOnce();
  expect(context.arc).toHaveBeenCalledTimes(1);
  bitmap.close();
});

it('projects unbaked group inputs before FX and refuses a missing spatial renderer', async () => {
  vi.mocked(drawSpatialCompositionGroup).mockClear();
  const camera = {
    ...createDefaultCameraState({ width: 20, height: 10 }),
    spatial: {
      rotation: [0, 0, 0, 1] as const,
      perspective: 0.5,
      windowMotion: 1,
      lockBackground: true,
      focus: [],
      reference: { x: 0, y: 0, width: 20, height: 10 },
    },
  };
  const renderer = { validateSizes: vi.fn(), surface: vi.fn(), draw: vi.fn(), dispose: vi.fn() };
  const spatialRenderer = vi.fn(() => renderer),
    createBitmap = vi.fn(async () => new FakeBitmap(20, 10));
  const args = {
    camera,
    spatialRenderer,
    createBitmap,
    clipMediaElements: new Map(),
    imageBank: {},
    visualLayers: [createLayer('a'), createLayer('b')],
  };
  await createEffectRuntimeInputMaterializer(args).materializeTargetSource(
    createPlan({ kind: 'track', trackId: 'track', clipIds: ['a', 'b'] })
  );
  expect(drawSpatialCompositionGroup).toHaveBeenCalledOnce();
  expect(drawSpatialCompositionGroup).toHaveBeenCalledWith(
    expect.objectContaining({
      camera,
      renderer,
      logicalSize: { width: 20, height: 10 },
      rasterScale: 1,
    })
  );
  expect(drawLayer).not.toHaveBeenCalled();
  const { spatialRenderer: _renderer, ...withoutRenderer } = args;
  await expect(
    createEffectRuntimeInputMaterializer(withoutRenderer).materializeTargetSource(
      createPlan({ kind: 'track', trackId: 'track', clipIds: ['a', 'b'] })
    )
  ).rejects.toThrow('SPATIAL_RENDERER');
});

it('keeps already camera-baked group rasters locked instead of applying spatial projection twice', async () => {
  vi.mocked(drawSpatialCompositionGroup).mockClear();
  context.drawImage = vi.fn();
  context.globalAlpha = 1;
  const camera = {
    ...createDefaultCameraState({ width: 20, height: 10 }),
    spatial: {
      rotation: [0, 0, 0, 1] as const,
      perspective: 0.5,
      windowMotion: 1,
      lockBackground: true,
      focus: [],
      reference: { x: 0, y: 0, width: 20, height: 10 },
    },
  };
  const frames: EffectRuntimeRenderedFrameMap = new Map([
    [
      'baked',
      {
        effectInstanceId: 'baked',
        bitmap: new FakeBitmap(20, 10),
        logicalWidth: 20,
        logicalHeight: 10,
        width: 20,
        height: 10,
        snapshotId: 'snapshot',
        kind: 'targetEffect',
        target: { kind: 'track', trackId: 'track', clipIds: ['a', 'b'] },
      },
    ],
  ]);
  const spatialRenderer = vi.fn(() => ({
    validateSizes: vi.fn(),
    surface: vi.fn(),
    draw: vi.fn(),
    dispose: vi.fn(),
  }));
  const materializer = createEffectRuntimeInputMaterializer({
    camera,
    spatialRenderer,
    createBitmap: vi.fn(async () => new FakeBitmap(20, 10)),
    clipMediaElements: new Map(),
    imageBank: {},
    visualLayers: [createLayer('a'), createLayer('b')],
  });
  await materializer.materializeTargetSource(
    createPlan({ kind: 'track', trackId: 'track', clipIds: ['a', 'b'] }),
    frames
  );
  expect(drawSpatialCompositionGroup).not.toHaveBeenCalled();
  expect(spatialRenderer).not.toHaveBeenCalled();
  expect(context.drawImage).toHaveBeenCalledOnce();
});

it('keeps source attachment outside an effect host clip FX input', async () => {
  const project = createVideoProjectFromRecording({
    recordingId: 'source',
    filename: 'source.webm',
    width: 200,
    height: 120,
    duration: 3,
    size: 1,
    mimeType: 'video/webm',
  });
  const owner = resolveVideoCompositionFrame(project, 1).visualLayers.find(
    (layer) => layer.kind === 'video'
  )!;
  if (owner.kind !== 'video') throw new Error('Expected video');
  const clip = createEffectHostClip({
    duration: 2,
    effectInstanceId: 'effect',
    name: 'Effect',
    startTime: 0,
    trackId: project.tracks[0]!.id,
    projectWidth: 200,
    projectHeight: 120,
  });
  const layer: Extract<VideoCompositionVisualLayer, { kind: 'effect' }> = {
    ...createLayer('host'),
    clip,
    kind: 'effect',
    sourceAttachment: {
      owner,
      mapping: {
        frame: owner.clip.transform,
        fitMode: owner.clip.fitMode,
        sourceWidth: 200,
        sourceHeight: 120,
        renderState: owner.renderState,
      },
    },
  };
  const bitmap = new FakeBitmap(20, 10);
  const materializer = createEffectRuntimeInputMaterializer({
    clipMediaElements: new Map(),
    createBitmap: vi.fn().mockResolvedValue(bitmap),
    imageBank: {},
    visualLayers: [layer],
  });
  await materializer.materializeTargetSource(
    createPlan({
      chainIndex: 0,
      clipId: 'host',
      kind: 'clip',
      placement: { x: 0, y: 0, width: 20, height: 10, rotation: 0, opacity: 1 },
    })
  );
  expect(drawLayer).toHaveBeenCalledOnce();
  expect(drawLayer.mock.calls[0]![1]).not.toHaveProperty('sourceAttachment');
  expect(layer.sourceAttachment?.owner.clipId).toBe(owner.clipId);
});

it.each([
  ['track', false],
  ['video-group', false],
  ['track', true],
  ['video-group', true],
] as const)(
  'bakes source masks once before later %s members (spatial %s)',
  async (kind, spatial) => {
    const project = createVideoProjectFromRecording({
      recordingId: 'source',
      filename: 'source.webm',
      width: 20,
      height: 10,
      duration: 2,
      mimeType: 'video/webm',
      size: 1,
    });
    const frame = resolveVideoCompositionFrame(project, 1);
    frame.sceneSpotlights = [
      {
        id: 'mask',
        clipId: 'source',
        afterClipId: 'source',
        spotlight: createQuickEditSpotlight(),
        phase: 'hold',
        progress: 1,
      },
    ];
    if (spatial)
      frame.camera.spatial = {
        rotation: [0, 0, 0, 1],
        perspective: 0.5,
        windowMotion: 1,
        lockBackground: true,
        focus: [],
        reference: { x: 0, y: 0, width: 20, height: 10 },
      };
    const calls: string[] = [];
    vi.mocked(drawSpatialCompositionGroup).mockImplementation((args) => {
      calls.push(...args.layers.map((layer) => layer.clipId));
      return true;
    });
    drawLayer.mockImplementation((_context, layer: VideoCompositionVisualLayer) =>
      calls.push(layer.clipId)
    );
    drawMask.mockImplementation(() => calls.push('mask'));
    const materializer = createEffectRuntimeInputMaterializer({
      camera: frame.camera,
      spatialRenderer: () => ({
        validateSizes: vi.fn(),
        surface: vi.fn(),
        draw: vi.fn(),
        dispose: vi.fn(),
      }),
      scene: { project, frame },
      imageBank: {},
      clipMediaElements: new Map(),
      visualLayers: [createLayer('source'), createLayer('annotation')],
      createBitmap: async () => new FakeBitmap(20, 10),
    });
    const target =
      kind === 'track'
        ? { kind, trackId: 'track', clipIds: ['source', 'annotation'] }
        : { kind, clipIds: ['source', 'annotation'] };
    const plan = createPlan(target);
    await materializer.materializeTargetSource(plan);
    expect(calls).toEqual(['source', 'mask', 'annotation']);
    expect(drawMask).toHaveBeenCalledWith(
      expect.objectContaining({
        afterClipId: 'source',
        project,
        frame,
        viewport: { x: 0, y: 0, width: 20, height: 10 },
        composition: { x: 0, y: 0, scale: 1 },
      })
    );
    drawMask.mockClear();
    drawLayer.mockClear();
    const drawImage = vi.fn();
    Object.assign(context, { drawImage });
    await materializer.materializeTargetSource(
      plan,
      new Map([
        [
          'track',
          {
            bitmap: new FakeBitmap(20, 10),
            effectInstanceId: 'track',
            snapshotId: 'track',
            kind: 'targetEffect',
            width: 20,
            height: 10,
            logicalWidth: 20,
            logicalHeight: 10,
            target: { kind: 'track', trackId: 'track', clipIds: ['source', 'annotation'] },
          },
        ],
      ])
    );
    expect(drawMask).not.toHaveBeenCalled();
    expect(drawLayer).not.toHaveBeenCalled();
    expect(drawImage).toHaveBeenCalledOnce();
  }
);

it.each(['missing', 'failed', 'success'] as const)(
  'releases lazy backdrop leases after %s background sampling',
  async (outcome) => {
    const project = createVideoProjectFromRecording({
      recordingId: 'source',
      filename: 'source.webm',
      width: 20,
      height: 10,
      duration: 2,
      size: 1,
      mimeType: 'video/webm',
    });
    const source = project.clips.find((clip) => clip.type === 'VIDEO')!;
    const frame = resolveVideoCompositionFrame(project, 1);
    frame.sceneSpotlights = [
      {
        id: 'mask',
        clipId: source.id,
        afterClipId: source.id,
        spotlight: { ...createQuickEditSpotlight(), effect: 'blur' },
        phase: 'hold',
        progress: 1,
      },
    ];
    const before = structuredClone(project);
    const canvas = document.createElement('canvas');
    canvas.width = 20;
    canvas.height = 10;
    Object.assign(context, { canvas, drawImage: vi.fn() });
    drawMask.mockImplementation((options: Parameters<typeof drawCompositionSceneSpotlights>[0]) =>
      options.blurSource?.()
    );
    const frameScope = createEffectRuntimeCompositionResourceLedger().createFrameScope();
    let live = 0;
    const resourceScope = {
      ...frameScope,
      allocateCanvas(width: unknown, height: unknown) {
        const release = frameScope.allocateCanvas(width, height);
        live++;
        return () => {
          live--;
          release();
        };
      },
    };
    const drawBackground = vi.fn(() => {
      if (outcome === 'failed') throw new Error('background failed');
    });
    const materializer = createEffectRuntimeInputMaterializer({
      camera: frame.camera,
      scene: { project, frame },
      ...(outcome === 'missing' ? {} : { drawBackground }),
      imageBank: {},
      clipMediaElements: new Map(),
      visualLayers: [createLayer(source.id)],
      resourceScope,
      createBitmap: async () => new FakeBitmap(20, 10),
    });
    const plan = createPlan({ kind: 'video-group', clipIds: [source.id] });
    if (outcome === 'success')
      closeEffectRuntimeBitmap(await materializer.materializeTargetSource(plan));
    else
      await expect(materializer.materializeTargetSource(plan)).rejects.toThrow(
        outcome === 'missing' ? 'EFFECT_RUNTIME_SOURCE_SCENE_BACKDROP_MISSING' : 'background failed'
      );
    expect(live).toBe(0);
    expect(frameScope.snapshot().liveRasterResources).toBe(0);
    expect(project).toEqual(before);
    if (outcome === 'failed') {
      drawBackground.mockImplementation(() => undefined);
      closeEffectRuntimeBitmap(await materializer.materializeTargetSource(plan));
      expect(live).toBe(0);
      expect(frameScope.snapshot().liveRasterResources).toBe(0);
    }
  }
);

it.each(['clip', 'transition', 'track', 'video-group'] as const)(
  'keeps source border on the correct side of the scene mask in %s input',
  async (kind) => {
    const project = createVideoProjectFromRecording({
      recordingId: 'source',
      filename: 'source.webm',
      width: 20,
      height: 10,
      duration: 2,
      size: 1,
      mimeType: 'video/webm',
    });
    const frame = resolveVideoCompositionFrame(project, 1);
    const source = frame.visualLayers.find((layer) => layer.kind === 'video')!;
    if (source.kind !== 'video') throw new Error('Expected video.');
    source.borders = [
      {
        id: 'border',
        border: createQuickEditBorder(),
        clock: {
          time: 1,
          duration: 2,
          enter: { type: 'none', duration: 0 },
          exit: { type: 'none', duration: 0 },
        },
      },
    ];
    const before = structuredClone(source);
    const calls: string[] = [];
    drawLayer.mockImplementation((_context, layer: VideoCompositionVisualLayer) => {
      if (layer.kind === 'video') calls.push(layer.effectActionsOnly ? 'border' : 'body');
    });
    drawMask.mockImplementation(() => calls.push('mask'));
    const make = (masked: boolean) => {
      frame.sceneSpotlights = masked
        ? [
            {
              id: 'mask',
              afterClipId: source.clipId,
              clipId: source.clipId,
              spotlight: createQuickEditSpotlight(),
              phase: 'hold',
              progress: 1,
            },
          ]
        : [];
      return createEffectRuntimeInputMaterializer({
        scene: { project, frame },
        visualLayers: [source, createLayer('other')],
        clipMediaElements: new Map(),
        imageBank: {},
        createBitmap: async () => new FakeBitmap(20, 10),
      });
    };
    const target: EffectRuntimeFramePlan['target'] =
      kind === 'clip'
        ? {
            kind,
            clipId: source.clipId,
            chainIndex: 0,
            placement: { x: 0, y: 0, width: 20, height: 10, opacity: 1, rotation: 0 },
          }
        : kind === 'transition'
          ? {
              kind,
              transitionId: 'transition',
              leadingClipId: source.clipId,
              trailingClipId: 'other',
            }
          : kind === 'track'
            ? { kind, trackId: source.clip.trackId, clipIds: [source.clipId] }
            : { kind, clipIds: [source.clipId] };
    for (const masked of [false, true]) {
      drawLayer.mockClear();
      calls.length = 0;
      const materializer = make(masked);
      const plan = createPlan(target);
      if (kind === 'transition') await materializer.materializeTransitionInputs(plan);
      else await materializer.materializeTargetSource(plan);
      const painted = drawLayer.mock.calls
        .map(([, layer]) => layer as VideoCompositionVisualLayer)
        .filter((layer) => layer.kind === 'video');
      if (!masked) {
        expect(calls).toEqual(['body']);
        expect(painted[0]?.kind === 'video' && painted[0].borders).toEqual(source.borders);
      } else if (kind === 'track' || kind === 'video-group') {
        expect(calls).toEqual(['body', 'mask', 'border']);
        expect(painted[0]?.kind === 'video' && painted[0].borders).toEqual([]);
        expect(painted[1]?.kind === 'video' && painted[1].borders).toEqual(source.borders);
        expect(painted[1]?.deferSourceBorders).toBe(true);
      } else {
        expect(calls).toEqual(['body']);
        expect(painted[0]?.kind === 'video' && painted[0].borders).toEqual([]);
      }
      expect(source).toEqual(before);
    }
  }
);
