// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { EffectRuntimeSandboxExecutor } from '../../../../../contracts/effect-runtime/types';
import type { VideoCompositionFrame, VideoCompositionVisualPass } from '../../types';
import { renderEffectRuntimeComposition } from './wave';
import type { EffectRuntimeFramePlan, EffectRuntimeRenderedFrameMap } from '../runtime/types';

const { renderPlans } = vi.hoisted(() => ({ renderPlans: vi.fn() }));
vi.mock('../runtime/driver', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../runtime/driver')>()),
  renderEffectRuntimeFramePlans: renderPlans,
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
