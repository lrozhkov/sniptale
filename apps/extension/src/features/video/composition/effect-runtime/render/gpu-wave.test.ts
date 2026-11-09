import { afterEach, expect, it, vi } from 'vitest';
import type { EffectRuntimeSandboxExecutor } from '../../../../../contracts/effect-runtime/types';
import type { EffectRuntimeFramePlan } from '../runtime/types';
import type { VideoCompositionFrame, VideoCompositionVisualPass } from '../../types';
import {
  canPrepareEffectRuntimeGpuComposition,
  prepareEffectRuntimeGpuComposition,
} from './gpu-wave';
afterEach(() => vi.unstubAllGlobals());
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

it('prepares independent overlay and sampled plans through scene output without calling bitmap renderer', async () => {
  const bitmaps: Array<{ width: number; height: number; close: ReturnType<typeof vi.fn> }> = [];
  const prepareGpuFrame: NonNullable<EffectRuntimeSandboxExecutor['prepareGpuFrame']> = async (
    request
  ) => {
    const bitmap = { width: request.renderWidth, height: request.renderHeight, close: vi.fn() };
    bitmaps.push(bitmap);
    return {
      kind: 'frame',
      bitmap,
      width: bitmap.width,
      height: bitmap.height,
      effectInstanceId: request.effectInstanceId,
      requestId: request.requestId,
      sequenceId: request.sequenceId,
      snapshotId: request.snapshotId,
      acknowledged: {
        documentId: request.documentRef.id,
        assetSelectionId: request.assetSelectionRef.id,
      },
    };
  };
  const executor = {
    dispose: vi.fn(),
    renderFrame: vi.fn(),
    prepareGpuFrame: vi.fn(prepareGpuFrame),
  };
  const frame = createFrame([createPlan('annotation')]);
  const scene = await prepareEffectRuntimeGpuComposition({
    executor,
    overlayFrame: frame,
    overlayTime: 0,
    visualPasses: [createPass(1, frame)],
    rasterScale: 0.5,
  });
  expect(executor.renderFrame).not.toHaveBeenCalled();
  expect(executor.prepareGpuFrame.mock.calls[0]![0].renderWidth).toBe(5);
  const borrow = scene.overlayFrames.get('annotation')!.retain();
  await scene.prepareVisualPass!(1);
  scene.dispose();
  expect(bitmaps[0]!.close).not.toHaveBeenCalled();
  expect(bitmaps[1]!.close).toHaveBeenCalledOnce();
  borrow.release();
  expect(bitmaps[0]!.close).toHaveBeenCalledOnce();
});
it('keeps dependent chains on the existing route before preparing any input', () => {
  const standalone = createPlan('annotation');
  expect(canPrepareEffectRuntimeGpuComposition([createFrame([standalone])])).toBe(true);
  expect(
    canPrepareEffectRuntimeGpuComposition([createFrame([{ ...standalone, kind: 'targetEffect' }])])
  ).toBe(false);
  expect(
    canPrepareEffectRuntimeGpuComposition([
      createFrame([{ ...standalone, target: { kind: 'track', trackId: 'track', clipIds: [] } }]),
    ])
  ).toBe(false);
});
