import type { EffectRuntimeSandboxExecutor } from '../../../../../contracts/effect-runtime/types';
import { collectEffectRuntimeResultBitmaps } from '../../../../../contracts/effect-runtime/retry-inputs';
import { buildEffectRuntimeGpuPlan } from '../render/gpu-plan';
import { createEffectRuntimeRenderMessage } from './request';
import {
  closeEffectRuntimeGpuSceneResources,
  type createEffectRuntimeGpuFrameLedger,
} from './resource-limits';
import type { EffectRuntimeFramePlan, EffectRuntimeGpuPreparedFrame } from './types';

/** Prepare independent annotations; every returned raster has one owner and explicit GPU borrows. */
export async function prepareEffectRuntimeGpuFramePlans(args: {
  executor: EffectRuntimeSandboxExecutor;
  plans: readonly EffectRuntimeFramePlan[];
  ledger: ReturnType<typeof createEffectRuntimeGpuFrameLedger>;
  signal?: AbortSignal;
}): Promise<ReadonlyMap<string, EffectRuntimeGpuPreparedFrame>> {
  const frames = new Map<string, EffectRuntimeGpuPreparedFrame>();
  const scope = args.ledger.createFrameScope();
  try {
    if (!args.executor.prepareGpuFrame)
      throw new Error('EFFECT_RUNTIME_GPU_PREPARATION_UNAVAILABLE');
    for (const [sequenceId, plan] of args.plans.entries()) {
      args.signal?.throwIfAborted();
      if (
        plan.kind !== 'standalone' ||
        (plan.target.kind !== 'scene' && plan.target.kind !== 'clip')
      )
        throw new Error('EFFECT_RUNTIME_GPU_DEPENDENT_PLAN_UNSUPPORTED');
      const command = await createEffectRuntimeRenderMessage({
        plan,
        inputFrames: {},
        requestId: crypto.randomUUID(),
        sequenceId,
      });
      args.signal?.throwIfAborted();
      const result = await args.executor.prepareGpuFrame(command);
      let accepted = false;
      try {
        args.signal?.throwIfAborted();
        if (result.kind === 'error') throw new Error('EFFECT_RUNTIME_GPU_PREPARATION_FAILED');
        const source =
          result.kind === 'gpu-plan' ? buildEffectRuntimeGpuPlan(result) : result.bitmap;
        const reservation = scope.reserve(collectEffectRuntimeResultBitmaps(result));
        let retired = false,
          closed = false,
          borrowers = 0;
        const release = () => {
          if (!retired || borrowers || closed) return;
          closed = true;
          closeEffectRuntimeGpuSceneResources(result);
          reservation.release();
        };
        frames.set(plan.effectInstanceId, {
          source,
          width: result.width,
          height: result.height,
          logicalWidth: plan.dimensions.width,
          logicalHeight: plan.dimensions.height,
          effectInstanceId: plan.effectInstanceId,
          snapshotId: plan.snapshotId,
          kind: plan.kind,
          target: plan.target,
          ...(plan.bitmapBounds ? { bitmapBounds: plan.bitmapBounds } : {}),
          retain() {
            if (retired) throw new Error('EFFECT_RUNTIME_GPU_FRAME_RETIRED');
            borrowers++;
            let returned = false;
            return {
              release() {
                if (returned) return;
                returned = true;
                borrowers--;
                release();
              },
            };
          },
          dispose() {
            retired = true;
            release();
          },
        });
        accepted = true;
      } finally {
        if (!accepted) closeEffectRuntimeGpuSceneResources(result);
      }
    }
    return frames;
  } catch (error) {
    for (const frame of frames.values()) frame.dispose();
    throw error;
  }
}
