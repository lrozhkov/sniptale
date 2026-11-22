import type { AnimationTemplate } from '@sniptale/runtime-contracts/animation-template';
import type { EffectRuntimeSandboxExecutor } from '../../../../../contracts/effect-runtime/types';
import { collectEffectRuntimeResultBitmaps } from '../../../../../contracts/effect-runtime/retry-inputs';
import { buildEffectRuntimeGpuPlan } from '../render/gpu-plan';
import { createEffectRuntimeRenderMessage } from './request';
import { EffectRuntimeFrameError } from './frame-error';
import {
  closeEffectRuntimeGpuSceneResources,
  createEffectRuntimeGpuFrameLifetime,
  type createEffectRuntimeGpuFrameLedger,
} from './resource-limits';
import type { EffectRuntimeFramePlan, EffectRuntimeGpuPreparedFrame } from './types';

/** Prepare independent annotations; every returned raster has one owner and explicit GPU borrows. */
export async function prepareEffectRuntimeGpuFramePlans(args: {
  executor: EffectRuntimeSandboxExecutor;
  documents?: ReadonlyMap<string, { source: string; sha256: string; document: AnimationTemplate }>;
  plans: readonly EffectRuntimeFramePlan[];
  ledger: ReturnType<typeof createEffectRuntimeGpuFrameLedger>;
  signal?: AbortSignal;
}): Promise<ReadonlyMap<string, EffectRuntimeGpuPreparedFrame>> {
  const frames = new Map<string, EffectRuntimeGpuPreparedFrame>();
  const scope = args.ledger.createFrameScope();
  try {
    if (!args.executor.prepareGpuFrame)
      throw new Error('EFFECT_RUNTIME_GPU_PREPARATION_UNAVAILABLE');
    const prepare = args.executor.prepareGpuFrame;
    const prepareFrame = async (
      plan: EffectRuntimeFramePlan,
      sequenceId: number
    ): Promise<EffectRuntimeGpuPreparedFrame> => {
      args.signal?.throwIfAborted();
      if (
        plan.kind !== 'standalone' ||
        (plan.target.kind !== 'scene' && plan.target.kind !== 'clip')
      )
        throw new Error('EFFECT_RUNTIME_GPU_DEPENDENT_PLAN_UNSUPPORTED');
      const verifiedDocument = args.documents?.get(plan.effectInstanceId);
      const command = await createEffectRuntimeRenderMessage({
        ...(verifiedDocument ? { verifiedDocument } : {}),
        plan,
        inputFrames: {},
        requestId: crypto.randomUUID(),
        sequenceId,
      });
      args.signal?.throwIfAborted();
      const result = await prepare.call(args.executor, command, args.signal);
      let accepted = false;
      try {
        args.signal?.throwIfAborted();
        if (result.kind === 'error') throw EffectRuntimeFrameError.fromFailure(result);
        const source =
          result.kind === 'gpu-plan' ? buildEffectRuntimeGpuPlan(result) : result.bitmap;
        const reservation = scope.reserve(collectEffectRuntimeResultBitmaps(result));
        const lifetime = createEffectRuntimeGpuFrameLifetime(() => {
          closeEffectRuntimeGpuSceneResources(result);
          reservation.release();
        });
        const frame: EffectRuntimeGpuPreparedFrame = {
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
          ...lifetime,
        };
        accepted = true;
        return frame;
      } finally {
        if (!accepted) closeEffectRuntimeGpuSceneResources(result);
      }
    };
    const capacity = args.executor.maximumConcurrentPreparationRequests === 2 ? 2 : 1;
    let next = 0;
    let failed = false;
    let failure: unknown;
    const run = async () => {
      while (!failed) {
        try {
          args.signal?.throwIfAborted();
          const sequenceId = next++;
          const plan = args.plans[sequenceId];
          if (!plan) return;
          const frame = await prepareFrame(plan, sequenceId);
          frames.set(frame.effectInstanceId, frame);
        } catch (error) {
          if (
            !failed ||
            (failure instanceof EffectRuntimeFrameError &&
              failure.code === 'circuitOpen' &&
              error instanceof EffectRuntimeFrameError &&
              error.code !== 'circuitOpen')
          ) {
            failed = true;
            failure = error;
          }
        }
      }
    };
    // Refill a free slot immediately; a slow sibling must not hold the next independent request.
    // Both lanes drain before failure cleanup can release their owned resources.
    await Promise.all(Array.from({ length: Math.min(capacity, args.plans.length) }, run));
    if (failed) throw failure;
    return new Map(
      args.plans.map((plan) => {
        const frame = frames.get(plan.effectInstanceId);
        if (!frame) throw new Error('EFFECT_RUNTIME_GPU_FRAME_MISSING');
        return [plan.effectInstanceId, frame];
      })
    );
  } catch (error) {
    for (const frame of frames.values()) frame.dispose();
    throw error;
  }
}
