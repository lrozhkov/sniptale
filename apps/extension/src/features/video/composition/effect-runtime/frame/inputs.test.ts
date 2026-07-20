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
