// @vitest-environment jsdom

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

const { drawLayer } = vi.hoisted(() => ({ drawLayer: vi.fn() }));
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
const context: Partial<CanvasRenderingContext2D> = { clearRect };

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    context as CanvasRenderingContext2D
  );
  drawLayer.mockReset();
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
      target.kind === 'clip'
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

it('bakes captured actions into isolated effect input once without appending to the bitmap', async () => {
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
  expect(context.arc).toHaveBeenCalledTimes(1);
  expect(context.arc).toHaveBeenCalledWith(5, 5, 32, 0, Math.PI * 2);
  drawCompositionVisualLayerBitmap(context as CanvasRenderingContext2D, layer, bitmap, 1, 1);
  expect(context.arc).toHaveBeenCalledTimes(1);
  bitmap.close();
});
