import { createEffectHostClip } from '../../../project/factories/overlay-clip';
import { disposeEffectRuntimeComposition } from './rendered';
import {
  EFFECT_RUNTIME_RESOURCE_LIMITS,
  type EffectRuntimeFrameResourceScope,
} from '../runtime/resource-limits';
import { createEffectRuntimeInputMaterializer } from '../frame/inputs';
import { drawSceneBackground } from '../../../project/scene/background';
import { createVideoProjectFromRecording } from '../../../project/factories/creation';
import { resolveVideoCompositionFrame } from '../../timeline/frame';
import { createQuickEditSpotlight } from '../../../project/scene/focus-appearance';
// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { EffectRuntimeSandboxExecutor } from '../../../../../contracts/effect-runtime/types';
import type { VideoCompositionFrame, VideoCompositionVisualPass } from '../../types';
import { renderEffectRuntimeComposition } from './wave';
import type {
  EffectRuntimeFramePlan,
  EffectRuntimeRenderedFrameMap,
  EffectRuntimeRenderedFrame,
} from '../runtime/types';

const { renderPlans } = vi.hoisted(() => ({ renderPlans: vi.fn() }));
vi.mock('../runtime/driver', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../runtime/driver')>()),
  renderEffectRuntimeFramePlans: renderPlans,
}));

vi.mock('../frame/inputs', async (original) => {
  const actual = await original<typeof import('../frame/inputs')>();
  return {
    ...actual,
    createEffectRuntimeInputMaterializer: vi.fn(actual.createEffectRuntimeInputMaterializer),
  };
});
vi.mock('../../../project/scene/background', async (original) => ({
  ...(await original<typeof import('../../../project/scene/background')>()),
  drawSceneBackground: vi.fn(),
}));

class FakeBitmap implements ImageBitmap {
  readonly close = vi.fn();
  constructor(
    readonly width: number,
    readonly height: number
  ) {}
}

const executor = { dispose: vi.fn(), renderFrame: vi.fn() } satisfies EffectRuntimeSandboxExecutor;

beforeEach(() => {
  renderPlans.mockReset();
  vi.mocked(createEffectRuntimeInputMaterializer).mockClear();
  vi.mocked(drawSceneBackground).mockClear();
  vi.stubGlobal('createImageBitmap', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it('renders each unique composition time once and reuses the overlay authority', async () => {
  const overlayFrames = createFrames('overlay');
  const passFrames = createFrames('pass');
  renderPlans.mockResolvedValueOnce(overlayFrames).mockResolvedValueOnce(passFrames);
  const overlayFrame = createFrame([createPlan('overlay')]);
  const passes = [
    createPass(0, overlayFrame),
    createPass(1, createFrame([createPlan('pass')])),
    createPass(2, createFrame([])),
  ];

  const rendered = await renderEffectRuntimeComposition({
    clipMediaElements: new Map(),
    executor,
    imageBank: {},
    overlayFrame,
    overlayTime: 0,
    ownerDocument: document,
    visualPasses: passes,
  });

  expect(renderPlans).toHaveBeenCalledTimes(2);
  expect(rendered.overlayFrames).toBe(overlayFrames);
  expect(rendered.framesByTime.get(0)).toBe(overlayFrames);
  expect(rendered.framesByTime.get(1)).toBe(passFrames);
  expect(rendered.framesByTime.get(2)).toEqual(new Map());
});

it('disposes every completed time when a later runtime wave fails', async () => {
  const completed = createFrames('completed');
  renderPlans.mockResolvedValueOnce(completed).mockRejectedValueOnce(new Error('runtime'));

  await expect(
    renderEffectRuntimeComposition({
      clipMediaElements: new Map(),
      executor,
      imageBank: {},
      overlayFrame: createFrame([createPlan('overlay')]),
      overlayTime: 0,
      ownerDocument: document,
      visualPasses: [createPass(1, createFrame([createPlan('pass')]))],
    })
  ).rejects.toThrow('runtime');
  expect(completed.get('completed')!.bitmap.close).toHaveBeenCalledOnce();
});

it('renders preview rasters below logical project size without changing effect geometry', async () => {
  renderPlans.mockResolvedValueOnce(createFrames('scaled'));

  await renderEffectRuntimeComposition({
    clipMediaElements: new Map(),
    executor,
    imageBank: {},
    overlayFrame: createFrame([createPlan('scaled')]),
    overlayTime: 0,
    ownerDocument: document,
    rasterScale: 0.5,
    visualPasses: [],
  });

  expect(renderPlans).toHaveBeenCalledWith(
    expect.objectContaining({
      plans: [
        expect.objectContaining({
          dimensions: { height: 10, width: 10 },
          renderDimensions: { height: 5, width: 5 },
        }),
      ],
    })
  );
});

it('renders supersampled rasters above logical project size without changing effect geometry', async () => {
  renderPlans.mockResolvedValueOnce(createFrames('supersampled'));

  await renderEffectRuntimeComposition({
    clipMediaElements: new Map(),
    executor,
    imageBank: {},
    overlayFrame: createFrame([createPlan('supersampled')]),
    overlayTime: 0,
    ownerDocument: document,
    rasterScale: 2,
    visualPasses: [],
  });

  expect(renderPlans).toHaveBeenCalledWith(
    expect.objectContaining({
      plans: [
        expect.objectContaining({
          dimensions: { height: 10, width: 10 },
          renderDimensions: { height: 20, width: 20 },
        }),
      ],
    })
  );
});

function createFrame(effectRuntimePlans: EffectRuntimeFramePlan[]): VideoCompositionFrame {
  return {
    actions: [],
    camera: {
      focusPoint: { x: 0, y: 0 },
      motionBlurAmount: 0,
      regionId: null,
      scale: 1,
      viewportHeight: 10,
      viewportWidth: 10,
      viewportX: 0,
      viewportY: 0,
    },
    cursor: null,
    effectInputLayers: [],
    effectRuntimePlans,
    visualLayers: [],
  };
}

function createPass(time: number, frame: VideoCompositionFrame): VideoCompositionVisualPass {
  return { alpha: 1, frame, time, transitionOverlays: [] };
}

function createPlan(id: string): EffectRuntimeFramePlan {
  return {
    assets: [],
    controls: {},
    dimensions: { height: 10, width: 10 },
    renderDimensions: { height: 10, width: 10 },
    documentSha256: 'a'.repeat(64),
    documentSource: '{}',
    duration: 2,
    effectInstanceId: id,
    fps: 30,
    frameIndex: 0,
    kind: 'standalone',
    progress: 0,
    snapshotId: 'snapshot',
    target: { clipId: 'host', kind: 'scene' },
    time: 0,
  };
}

function createFrames(id: string): EffectRuntimeRenderedFrameMap {
  const bitmap = new FakeBitmap(10, 10);
  return new Map([
    [
      id,
      {
        bitmap,
        effectInstanceId: id,
        height: 10,
        kind: 'standalone',
        logicalHeight: 10,
        logicalWidth: 10,
        snapshotId: 'snapshot',
        target: { clipId: 'host', kind: 'scene' },
        width: 10,
      },
    ],
  ]);
}

it('refuses source scene rendering without its accepted project geometry', async () => {
  const overlayFrame = createFrame([createPlan('group')]);
  overlayFrame.sceneSpotlights = [
    {
      id: 'mask',
      clipId: 'source',
      afterClipId: 'source',
      spotlight: createQuickEditSpotlight(),
      phase: 'hold',
      progress: 1,
    },
  ];
  renderPlans.mockResolvedValue(new Map());
  await expect(
    renderEffectRuntimeComposition({
      clipMediaElements: new Map(),
      executor,
      imageBank: {},
      overlayFrame,
      overlayTime: 1,
      visualPasses: [],
    })
  ).rejects.toThrow('EFFECT_RUNTIME_SOURCE_SCENE_CONTEXT_MISSING');
  expect(renderPlans).not.toHaveBeenCalled();
});

it('renders lower track FX before a higher backdrop consumer regardless of effect insertion order', async () => {
  const project = createVideoProjectFromRecording({
    recordingId: 'source',
    filename: 'source.webm',
    width: 20,
    height: 10,
    duration: 2,
    size: 1,
    mimeType: 'video/webm',
  });
  const lower = project.clips.find((clip) => clip.type === 'VIDEO')!;
  const upper = { ...lower, id: 'upper', trackId: 'upper-track' };
  project.tracks.push({
    ...project.tracks[0]!,
    id: upper.trackId,
    order: project.tracks[0]!.order - 1,
    isRoot: false,
  });
  project.clips.push(upper);
  const overlayFrame = resolveVideoCompositionFrame(project, 1);
  const lowerPlan = {
    ...createPlan('lower'),
    kind: 'targetEffect' as const,
    target: { kind: 'track' as const, trackId: lower.trackId, clipIds: [lower.id] },
  };
  const upperPlan = {
    ...createPlan('upper'),
    kind: 'targetEffect' as const,
    target: { kind: 'track' as const, trackId: upper.trackId, clipIds: [upper.id] },
  };
  overlayFrame.effectRuntimePlans = [upperPlan, lowerPlan];
  overlayFrame.sceneSpotlights = [
    {
      id: 'mask',
      clipId: upper.id,
      afterClipId: upper.id,
      spotlight: { ...createQuickEditSpotlight(), effect: 'blur' },
      phase: 'hold',
      progress: 1,
    },
  ];
  renderPlans.mockResolvedValue(new Map());
  await renderEffectRuntimeComposition({
    project,
    clipMediaElements: new Map(),
    executor,
    imageBank: {},
    overlayFrame,
    overlayTime: 1,
    visualPasses: [],
  });
  expect(
    renderPlans.mock.lastCall?.[0].plans.map(
      (plan: EffectRuntimeFramePlan) => plan.effectInstanceId
    )
  ).toEqual(['lower', 'upper']);
});

it('samples the shared background with each unique frame time and its own camera', async () => {
  const project = createVideoProjectFromRecording({
    recordingId: 'source',
    filename: 'source.webm',
    width: 20,
    height: 10,
    duration: 2,
    size: 1,
    mimeType: 'video/webm',
  });
  const overlayFrame = createFrame([createPlan('overlay')]);
  overlayFrame.camera.backgroundCamera = { scale: 1.2, viewportX: 3, viewportY: 4 };
  const earlier = createFrame([createPlan('earlier')]);
  renderPlans.mockResolvedValue(new Map());
  const imageBank = {};
  await renderEffectRuntimeComposition({
    project,
    executor,
    imageBank,
    clipMediaElements: new Map(),
    overlayFrame,
    overlayTime: 1,
    visualPasses: [createPass(0.5, earlier), createPass(1, overlayFrame)],
  });
  const calls = vi.mocked(createEffectRuntimeInputMaterializer).mock.calls;
  expect(calls).toHaveLength(2);
  const context = {} as CanvasRenderingContext2D;
  for (const [input] of calls) input.drawBackground?.(context, { width: 20, height: 10 });
  expect(drawSceneBackground).toHaveBeenNthCalledWith(
    1,
    expect.objectContaining({
      context,
      currentTime: 1,
      width: 20,
      height: 10,
      projectScale: 1,
      audioEnvelope: 0,
      loadedImages: imageBank,
      camera: overlayFrame.camera.backgroundCamera,
    })
  );
  expect(drawSceneBackground).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({ currentTime: 0.5 })
  );
  expect(vi.mocked(drawSceneBackground).mock.calls[1]![0]).not.toHaveProperty('camera');
});

function createAnnotationComposition() {
  const project = createVideoProjectFromRecording({
    recordingId: 'recording',
    filename: 'source.webm',
    width: 20,
    height: 10,
    duration: 2,
    size: 1,
    mimeType: 'video/webm',
  });
  const source = project.clips.find((clip) => clip.type === 'VIDEO')!;
  const hosts = ['source', 'viewport'].map((attachment) => {
    const host = createEffectHostClip({
      trackId: source.trackId,
      startTime: 0,
      duration: 2,
      effectInstanceId: attachment,
      name: attachment,
      projectWidth: 20,
      projectHeight: 10,
    });
    host.id = attachment;
    host.attachment =
      attachment === 'viewport'
        ? { kind: 'viewport' }
        : {
            kind: 'source',
            assetId: source.assetId,
            sourceInstanceId: source.sourceInstanceId ?? source.id,
          };
    host.sourceRange = {
      assetId: source.assetId,
      sourceInstanceId: source.sourceInstanceId ?? source.id,
      start: 0,
      end: 2,
    };
    return host;
  });
  project.clips.push(...hosts);
  const frame = resolveVideoCompositionFrame(project, 1);
  frame.effectRuntimePlans = hosts.map((host) => ({
    ...createPlan(host.id),
    target: { kind: 'scene', clipId: host.id },
  }));
  return { project, frame };
}

it('keeps both annotation planes and five camera exposures within the real retained raster limit', async () => {
  const { project, frame } = createAnnotationComposition();
  const bitmaps: ImageBitmap[] = [];
  let peak = 0;
  renderPlans.mockImplementation(
    async ({
      plans,
      resourceScope,
    }: {
      plans: readonly EffectRuntimeFramePlan[];
      resourceScope: EffectRuntimeFrameResourceScope;
    }) => {
      const frames = new Map();
      for (const plan of plans) {
        const output = createFrames(plan.effectInstanceId).get(plan.effectInstanceId)!;
        resourceScope.retainBitmap(output.bitmap);
        bitmaps.push(output.bitmap);
        peak = Math.max(peak, resourceScope.snapshot().liveRasterResources);
        frames.set(plan.effectInstanceId, { ...output, target: plan.target });
      }
      return frames;
    }
  );
  const rendered = await renderEffectRuntimeComposition({
    project,
    executor,
    imageBank: {},
    clipMediaElements: new Map(),
    overlayFrame: frame,
    overlayTime: 1,
    visualPasses: [0.98, 0.99, 1, 1.01, 1.02].map((time) => createPass(time, frame)),
  });
  expect(rendered.overlayFrames.size).toBe(2);
  expect(rendered.framesByTime.size).toBe(5);
  expect(peak).toBeLessThanOrEqual(EFFECT_RUNTIME_RESOURCE_LIMITS.maxLiveCanvases);
  for (const time of [0.98, 0.99, 1.01, 1.02]) {
    expect([...rendered.framesByTime.get(time)!.keys()]).toEqual(['source']);
  }
  disposeEffectRuntimeComposition(rendered);
  for (const bitmap of bitmaps) expect(bitmap.close).toHaveBeenCalledOnce();
});

it.each(['clip', 'transition', 'track', 'video-group', 'backdrop'] as const)(
  'retains a viewport annotation read by a sampled %s input',
  async (kind) => {
    const { project, frame } = createAnnotationComposition();
    const plan = {
      ...createPlan('reader'),
      kind: kind === 'transition' ? ('transition' as const) : ('targetEffect' as const),
    };
    switch (kind) {
      case 'clip':
        plan.target = {
          kind: 'clip',
          clipId: 'viewport',
          chainIndex: 0,
          placement: { x: 0, y: 0, width: 20, height: 10, opacity: 1, rotation: 0 },
        };
        break;
      case 'transition':
        plan.target = {
          kind: 'transition',
          transitionId: 'transition',
          leadingClipId: 'source',
          trailingClipId: 'viewport',
        };
        break;
      case 'track':
        plan.target = { kind: 'track', trackId: 'track', clipIds: ['source', 'viewport'] };
        break;
      case 'video-group':
        plan.target = { kind: 'video-group', clipIds: ['source', 'viewport'] };
        break;
      case 'backdrop':
        frame.sceneSpotlights = [
          {
            id: 'backdrop',
            clipId: 'source',
            afterClipId: 'source',
            spotlight: { ...createQuickEditSpotlight(), effect: 'blur' },
            phase: 'hold',
            progress: 1,
          },
        ];
        break;
    }
    if (kind !== 'backdrop') frame.effectRuntimePlans!.push(plan);
    renderPlans.mockResolvedValue(new Map());
    await renderEffectRuntimeComposition({
      project,
      executor,
      imageBank: {},
      clipMediaElements: new Map(),
      overlayFrame: frame,
      overlayTime: 1,
      visualPasses: [createPass(0.99, frame)],
    });
    expect(
      renderPlans.mock.lastCall?.[0].plans.map(
        (item: EffectRuntimeFramePlan) => item.effectInstanceId
      )
    ).toEqual(kind === 'backdrop' ? ['source', 'viewport'] : ['source', 'viewport', 'reader']);
  }
);

it('keeps an overlay-sampled layer when the neighboring camera changes owner', async () => {
  const { project, frame } = createAnnotationComposition();
  const neighboring = { ...frame, camera: { ...frame.camera, sourceClipId: 'another-video' } };
  renderPlans.mockResolvedValue(new Map());
  await renderEffectRuntimeComposition({
    project,
    executor,
    imageBank: {},
    clipMediaElements: new Map(),
    overlayFrame: frame,
    overlayTime: 1,
    visualPasses: [createPass(0.99, neighboring)],
  });
  expect(
    renderPlans.mock.lastCall?.[0].plans.map(
      (plan: EffectRuntimeFramePlan) => plan.effectInstanceId
    )
  ).toEqual(['source']);
});

it.each(['clip', 'track', 'video-group', 'stacked'] as const)(
  'releases consumed rasters after scoped %s FX without closing later-reader inputs',
  async (kind) => {
    const { project, frame } = createAnnotationComposition();
    const target: EffectRuntimeFramePlan['target'] =
      kind === 'clip'
        ? {
            kind: 'clip',
            clipId: 'source',
            chainIndex: 0,
            placement: { x: 0, y: 0, width: 20, height: 10, rotation: 0, opacity: 1 },
          }
        : kind === 'track'
          ? { kind: 'track', trackId: 'track', clipIds: ['source', 'viewport'] }
          : { kind: 'video-group', clipIds: ['source', 'viewport'] };
    if (kind === 'stacked')
      frame.effectRuntimePlans!.push(
        {
          ...createPlan('upstream-clip'),
          kind: 'targetEffect',
          target: {
            kind: 'clip',
            clipId: 'source',
            chainIndex: 0,
            placement: { x: 0, y: 0, width: 20, height: 10, rotation: 0, opacity: 1 },
          },
        },
        {
          ...createPlan('transition'),
          kind: 'transition',
          target: {
            kind: 'transition',
            transitionId: 'join',
            leadingClipId: 'source',
            trailingClipId: 'viewport',
          },
        },
        {
          ...createPlan('upstream-track'),
          kind: 'targetEffect',
          target: { kind: 'track', trackId: 'track', clipIds: ['source', 'viewport'] },
        }
      );
    frame.effectRuntimePlans!.push({ ...createPlan('reader'), kind: 'targetEffect', target });
    const bitmaps: ImageBitmap[] = [];
    let peak = 0;
    renderPlans.mockImplementation(
      async ({
        plans,
        resourceScope,
      }: {
        plans: readonly EffectRuntimeFramePlan[];
        resourceScope: EffectRuntimeFrameResourceScope;
      }) => {
        const frames = new Map<string, EffectRuntimeRenderedFrame>();
        for (const plan of plans) {
          if (plan.effectInstanceId === 'reader') {
            expect(frames.has('source')).toBe(true);
            for (const input of frames.values()) expect(input.bitmap.close).not.toHaveBeenCalled();
          }
          const output = createFrames(plan.effectInstanceId).get(plan.effectInstanceId)!;
          resourceScope.retainBitmap(output.bitmap);
          bitmaps.push(output.bitmap);
          peak = Math.max(peak, resourceScope.snapshot().liveRasterResources);
          frames.set(plan.effectInstanceId, { ...output, kind: plan.kind, target: plan.target });
        }
        return frames;
      }
    );
    const rendered = await renderEffectRuntimeComposition({
      project,
      streamVisualPasses: true,
      executor,
      imageBank: {},
      clipMediaElements: new Map(),
      overlayFrame: frame,
      overlayTime: 1,
      visualPasses:
        kind === 'stacked'
          ? []
          : [0.98, 0.99, 1, 1.01, 1.02].map((time) => createPass(time, frame)),
    });
    const checkFrames = (frames: EffectRuntimeRenderedFrameMap) => {
      expect(frames.has('reader')).toBe(true);
      expect(frames.has('source')).toBe(false);
      expect(frames.has('viewport')).toBe(kind === 'clip' && frames === rendered.overlayFrames);
      if (kind === 'stacked') {
        expect([...frames.keys()]).toEqual(['transition', 'reader']);
      }
    };
    checkFrames(rendered.overlayFrames);
    if (kind !== 'stacked')
      for (const time of [0.98, 0.99, 1, 1.01, 1.02]) {
        await rendered.prepareVisualPass!(time);
        checkFrames(rendered.framesByTime.get(time)!);
      }
    expect(peak).toBeLessThanOrEqual(EFFECT_RUNTIME_RESOURCE_LIMITS.maxLiveCanvases);
    disposeEffectRuntimeComposition(rendered);
    for (const bitmap of bitmaps) expect(bitmap.close).toHaveBeenCalledOnce();
  }
);

it('streams two source annotations through five exposures without retaining every output', async () => {
  const { project, frame } = createAnnotationComposition();
  const source = project.clips.find((clip) => clip.id === 'source');
  const layer = frame.visualLayers.find((layer) => layer.clipId === 'source');
  if (!source || source.type !== 'EFFECT' || !layer) throw new Error('Missing source annotation');
  project.clips.push({ ...source, id: 'source-two', effectInstanceId: 'source-two' });
  frame.visualLayers.push({ ...layer, clipId: 'source-two' });
  frame.effectRuntimePlans!.push({
    ...createPlan('source-two'),
    target: { kind: 'scene', clipId: 'source-two' },
  });
  const bitmaps: ImageBitmap[] = [];
  let peak = 0;
  renderPlans.mockImplementation(
    async ({
      plans,
      resourceScope,
    }: {
      plans: readonly EffectRuntimeFramePlan[];
      resourceScope: EffectRuntimeFrameResourceScope;
    }) => {
      const frames = new Map<string, EffectRuntimeRenderedFrame>();
      for (const plan of plans) {
        const output = createFrames(plan.effectInstanceId).get(plan.effectInstanceId)!;
        resourceScope.retainBitmap(output.bitmap);
        bitmaps.push(output.bitmap);
        peak = Math.max(peak, resourceScope.snapshot().liveRasterResources);
        frames.set(plan.effectInstanceId, { ...output, target: plan.target });
      }
      return frames;
    }
  );
  const rendered = await renderEffectRuntimeComposition({
    project,
    executor,
    imageBank: {},
    clipMediaElements: new Map(),
    overlayFrame: frame,
    overlayTime: 1,
    visualPasses: [0.98, 0.99, 1, 1.01, 1.02].map((time) => createPass(time, frame)),
    streamVisualPasses: true,
  });
  expect(rendered.overlayFrames.size).toBe(3);
  expect(rendered.framesByTime.size).toBe(1);
  expect(rendered.prepareVisualPass).toBeTypeOf('function');
  let previous: EffectRuntimeRenderedFrameMap | undefined;
  for (const time of [0.98, 0.99, 1, 1.01, 1.02, 0.98]) {
    await rendered.prepareVisualPass?.(time);
    if (previous && previous !== rendered.overlayFrames)
      for (const output of previous.values()) expect(output.bitmap.close).toHaveBeenCalledOnce();
    const current = rendered.framesByTime.get(time)!;
    expect(current.size).toBe(time === 1 ? 3 : 2);
    for (const output of current.values()) expect(output.bitmap.close).not.toHaveBeenCalled();
    expect(rendered.framesByTime.size).toBeLessThanOrEqual(2);
    previous = current;
  }
  expect(peak).toBeLessThanOrEqual(EFFECT_RUNTIME_RESOURCE_LIMITS.maxLiveCanvases);
  disposeEffectRuntimeComposition(rendered);
  disposeEffectRuntimeComposition(rendered);
  for (const bitmap of bitmaps) expect(bitmap.close).toHaveBeenCalledOnce();
});

it.each(['dispose', 'failure'] as const)(
  'closes streamed rasters when a pending exposure ends with %s',
  async (mode) => {
    const { project, frame } = createAnnotationComposition();
    const bitmaps: ImageBitmap[] = [];
    const scopes: EffectRuntimeFrameResourceScope[] = [];
    let complete: () => void = () => {
      throw new Error('Missing controlled exposure');
    };
    const produce = ({
      plans,
      resourceScope,
    }: {
      plans: readonly EffectRuntimeFramePlan[];
      resourceScope: EffectRuntimeFrameResourceScope;
    }) => {
      scopes.push(resourceScope);
      const frames = new Map<string, EffectRuntimeRenderedFrame>();
      for (const plan of plans) {
        const output = createFrames(plan.effectInstanceId).get(plan.effectInstanceId)!;
        resourceScope.retainBitmap(output.bitmap);
        bitmaps.push(output.bitmap);
        frames.set(plan.effectInstanceId, { ...output, target: plan.target });
      }
      return frames;
    };
    renderPlans.mockImplementationOnce(produce);
    const rendered = await renderEffectRuntimeComposition({
      project,
      executor,
      imageBank: {},
      clipMediaElements: new Map(),
      overlayFrame: frame,
      overlayTime: 1,
      visualPasses: [createPass(0.99, frame)],
      streamVisualPasses: true,
    });
    renderPlans.mockImplementationOnce(
      (args) =>
        new Promise<EffectRuntimeRenderedFrameMap>((resolve, reject) => {
          complete = () => {
            if (mode === 'failure') reject(new Error('Exposure refused'));
            else resolve(produce(args));
          };
        })
    );
    const pending = rendered.prepareVisualPass!(0.99);
    await vi.waitFor(() => expect(renderPlans).toHaveBeenCalledTimes(2));
    if (mode === 'dispose') disposeEffectRuntimeComposition(rendered);
    complete();
    await expect(pending).rejects.toThrow(
      mode === 'dispose' ? 'EFFECT_RUNTIME_COMPOSITION_DISPOSED' : 'Exposure refused'
    );
    expect(rendered.framesByTime.size).toBe(0);
    await expect(rendered.prepareVisualPass!(0.99)).rejects.toThrow(
      'EFFECT_RUNTIME_COMPOSITION_DISPOSED'
    );
    disposeEffectRuntimeComposition(rendered);
    for (const bitmap of bitmaps) expect(bitmap.close).toHaveBeenCalledOnce();
    for (const scope of scopes) expect(scope.snapshot().liveRasterResources).toBe(0);
  }
);
