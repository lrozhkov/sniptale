import type {
  EffectRuntimeFrameInputs,
  EffectRuntimeFrameResult,
  EffectRuntimeSandboxExecutor,
} from '../../../../../contracts/effect-runtime/types';
import { createEffectRuntimeRenderMessage } from './request';
import { EffectRuntimeFrameError } from './frame-error';
import {
  closeEffectRuntimeBitmap,
  createEffectRuntimeCompositionResourceLedger,
  type EffectRuntimeFrameResourceScope,
} from './resource-limits';
import type {
  EffectRuntimeFramePlan,
  EffectRuntimeRenderedFrame,
  EffectRuntimeRenderedFrameMap,
} from './types';

export interface EffectRuntimeInputMaterializer {
  materializeTargetSource(
    plan: EffectRuntimeFramePlan,
    frames?: EffectRuntimeRenderedFrameMap
  ): Promise<ImageBitmap>;
  materializeTransitionInputs(
    plan: EffectRuntimeFramePlan,
    frames?: EffectRuntimeRenderedFrameMap
  ): Promise<{ from: ImageBitmap; to: ImageBitmap }>;
}

export async function renderEffectRuntimeFramePlans(args: {
  executor: EffectRuntimeSandboxExecutor;
  inputMaterializer: EffectRuntimeInputMaterializer;
  plans: readonly EffectRuntimeFramePlan[];
  resourceScope?: EffectRuntimeFrameResourceScope;
  signal?: AbortSignal;
}): Promise<EffectRuntimeRenderedFrameMap> {
  if (args.plans.some((plan) => plan.kind !== 'standalone' || plan.target.kind !== 'scene'))
    throw new Error('EFFECT_RUNTIME_ANIMATION_INPUT_REJECTED');
  const frames: MutableEffectRuntimeRenderedFrames = new Map();
  const plans = args.plans.slice();
  const executePlan = createPlanExecutor(args.executor, args.signal);
  const resourceScope =
    args.resourceScope ?? createEffectRuntimeCompositionResourceLedger().createFrameScope();
  try {
    const failure = await renderDirectFramePlans(
      plans,
      executePlan,
      frames,
      resourceScope,
      args.signal
    );
    if (failure) throw failure;
    args.signal?.throwIfAborted();
    return frames;
  } catch (error) {
    disposeEffectRuntimeRenderedFrames(frames);
    throw error;
  }
}

type ExecuteFramePlan = (
  plan: EffectRuntimeFramePlan,
  inputFrames: EffectRuntimeFrameInputs
) => Promise<EffectRuntimeFrameResult>;
type MutableEffectRuntimeRenderedFrames = Map<string, EffectRuntimeRenderedFrame>;

function createPlanExecutor(
  executor: EffectRuntimeSandboxExecutor,
  signal?: AbortSignal
): ExecuteFramePlan {
  let sequenceId = 0;
  return async (plan: EffectRuntimeFramePlan, inputFrames: EffectRuntimeFrameInputs) => {
    signal?.throwIfAborted();
    let message;
    try {
      message = await createEffectRuntimeRenderMessage({
        inputFrames,
        plan,
        requestId: crypto.randomUUID(),
        sequenceId: sequenceId++,
      });
    } catch {
      throw new Error('EFFECT_RUNTIME_REQUEST_BUILD_FAILED');
    }
    signal?.throwIfAborted();
    return executor.renderFrame(message);
  };
}

async function renderDirectFramePlans(
  plans: readonly EffectRuntimeFramePlan[],
  executePlan: ExecuteFramePlan,
  frames: MutableEffectRuntimeRenderedFrames,
  resourceScope: EffectRuntimeFrameResourceScope,
  signal?: AbortSignal
): Promise<EffectRuntimeFrameError | null> {
  for (const plan of plans) {
    signal?.throwIfAborted();
    const result = await executePlan(plan, {});
    if (result.kind === 'error') return EffectRuntimeFrameError.fromFailure(result);
    retainOutputBitmap(result.bitmap, resourceScope);
    frames.set(plan.effectInstanceId, toRenderedFrame(plan, result.bitmap));
  }
  return null;
}

function disposeEffectRuntimeRenderedFrames(
  frames: EffectRuntimeRenderedFrameMap | undefined
): void {
  if (!frames) return;
  for (const frame of frames.values()) closeEffectRuntimeBitmap(frame.bitmap);
}

function retainOutputBitmap(
  bitmap: ImageBitmap,
  resourceScope: EffectRuntimeFrameResourceScope
): void {
  try {
    resourceScope.retainBitmap(bitmap);
  } catch {
    bitmap.close();
    throw new Error('EFFECT_RUNTIME_OUTPUT_RESOURCE_LIMIT');
  }
}

function toRenderedFrame(
  plan: EffectRuntimeFramePlan,
  bitmap: ImageBitmap
): EffectRuntimeRenderedFrame {
  return {
    bitmap,
    ...(plan.bitmapBounds ? { bitmapBounds: plan.bitmapBounds } : {}),
    effectInstanceId: plan.effectInstanceId,
    height: bitmap.height,
    kind: plan.kind,
    logicalHeight: plan.dimensions.height,
    logicalWidth: plan.dimensions.width,
    snapshotId: plan.snapshotId,
    target: plan.target,
    width: bitmap.width,
  };
}
