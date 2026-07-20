import type {
  EffectRuntimeFrameInputs,
  EffectRuntimeFrameResult,
  EffectRuntimeSandboxExecutor,
} from '../../../../../contracts/effect-runtime/types';
import { createEffectRuntimeRenderMessage } from './request';
import {
  closeEffectRuntimeBitmap,
  createEffectRuntimeCompositionResourceLedger,
  releaseEffectRuntimeBitmap,
  type EffectRuntimeFrameResourceScope,
} from './resource-limits';
import type {
  EffectRuntimeFramePlan,
  EffectRuntimeRenderedFrame,
  EffectRuntimeRenderedFrameMap,
} from './types';

export interface EffectRuntimeInputMaterializer {
  materializeTargetSource(plan: EffectRuntimeFramePlan): Promise<ImageBitmap>;
  materializeTransitionInputs(
    plan: EffectRuntimeFramePlan
  ): Promise<{ from: ImageBitmap; to: ImageBitmap }>;
}

type EffectRuntimeFrameError = Extract<EffectRuntimeFrameResult, { kind: 'error' }>;

class EffectRuntimeFrameBatchError extends Error {
  readonly failures: readonly EffectRuntimeFrameError[];

  constructor(failures: readonly EffectRuntimeFrameError[]) {
    super(`Effect runtime frame batch failed: ${failures.map(({ code }) => code).join(',')}`);
    this.name = 'EffectRuntimeFrameBatchError';
    this.failures = failures;
  }
}

export async function renderEffectRuntimeFramePlans(args: {
  executor: EffectRuntimeSandboxExecutor;
  inputMaterializer: EffectRuntimeInputMaterializer;
  plans: readonly EffectRuntimeFramePlan[];
  resourceScope?: EffectRuntimeFrameResourceScope;
}): Promise<EffectRuntimeRenderedFrameMap> {
  const frames: MutableEffectRuntimeRenderedFrames = new Map();
  const { directPlans, targetPlans } = partitionFramePlans(args.plans);
  const executePlan = createPlanExecutor(args.executor);
  const resourceScope =
    args.resourceScope ?? createEffectRuntimeCompositionResourceLedger().createFrameScope();
  try {
    const directFailure = await renderDirectFramePlans(
      directPlans,
      args.inputMaterializer,
      executePlan,
      frames,
      resourceScope
    );
    const targetFailure = directFailure
      ? null
      : await renderTargetFrameChains(
          targetPlans,
          args.inputMaterializer,
          executePlan,
          frames,
          resourceScope
        );
    const failure = directFailure ?? targetFailure;
    if (failure) throw new EffectRuntimeFrameBatchError([failure]);
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

function createPlanExecutor(executor: EffectRuntimeSandboxExecutor): ExecuteFramePlan {
  let sequenceId = 0;
  return async (plan: EffectRuntimeFramePlan, inputFrames: EffectRuntimeFrameInputs) => {
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
    return executor.renderFrame(message);
  };
}

function partitionFramePlans(plans: readonly EffectRuntimeFramePlan[]) {
  const targetPlans = new Map<string, EffectRuntimeFramePlan[]>();
  const directPlans: EffectRuntimeFramePlan[] = [];
  for (const plan of plans) {
    if (plan.target.kind !== 'clip') {
      directPlans.push(plan);
      continue;
    }
    const chain = targetPlans.get(plan.target.clipId) ?? [];
    chain.push(plan);
    targetPlans.set(plan.target.clipId, chain);
  }
  return { directPlans, targetPlans };
}

async function renderDirectFramePlans(
  plans: readonly EffectRuntimeFramePlan[],
  materializer: EffectRuntimeInputMaterializer,
  executePlan: ExecuteFramePlan,
  frames: MutableEffectRuntimeRenderedFrames,
  resourceScope: EffectRuntimeFrameResourceScope
): Promise<EffectRuntimeFrameError | null> {
  for (const plan of plans) {
    const inputFrames: EffectRuntimeFrameInputs =
      plan.kind === 'transition' ? await materializeTransitionFrameInputs(materializer, plan) : {};
    let result: EffectRuntimeFrameResult;
    try {
      result = await executePlan(plan, inputFrames);
    } catch (error) {
      closeInputFrames(inputFrames);
      throw error;
    }
    releaseInputFrames(inputFrames);
    if (result.kind === 'error') return result;
    retainOutputBitmap(result.bitmap, resourceScope);
    frames.set(plan.effectInstanceId, toRenderedFrame(plan, result.bitmap));
  }
  return null;
}

async function materializeTransitionFrameInputs(
  materializer: EffectRuntimeInputMaterializer,
  plan: EffectRuntimeFramePlan
): Promise<EffectRuntimeFrameInputs> {
  try {
    const { from, to } = await materializer.materializeTransitionInputs(plan);
    return { from: createFrameInput(from, plan), to: createFrameInput(to, plan) };
  } catch {
    throw new Error('EFFECT_RUNTIME_INPUT_MATERIALIZATION_FAILED');
  }
}

async function renderTargetFrameChains(
  targetPlans: ReadonlyMap<string, EffectRuntimeFramePlan[]>,
  materializer: EffectRuntimeInputMaterializer,
  executePlan: ExecuteFramePlan,
  frames: MutableEffectRuntimeRenderedFrames,
  resourceScope: EffectRuntimeFrameResourceScope
): Promise<EffectRuntimeFrameError | null> {
  for (const chain of targetPlans.values()) {
    let source = await materializer.materializeTargetSource(chain[0]!);
    let finalPlan: EffectRuntimeFramePlan | null = null;
    for (const plan of chain) {
      try {
        const result = await executePlan(plan, { source: createFrameInput(source, plan) });
        releaseEffectRuntimeBitmap(source);
        if (result.kind === 'error') return result;
        retainOutputBitmap(result.bitmap, resourceScope);
        source = result.bitmap;
        finalPlan = plan;
      } catch {
        closeEffectRuntimeBitmap(source);
        throw new Error('EFFECT_RUNTIME_TARGET_CHAIN_FAILED');
      }
    }
    if (!finalPlan) {
      closeEffectRuntimeBitmap(source);
      throw new Error('EFFECT_RUNTIME_TARGET_CHAIN_EMPTY');
    }
    frames.set(finalPlan.effectInstanceId, toRenderedFrame(finalPlan, source));
  }
  return null;
}

function disposeEffectRuntimeRenderedFrames(
  frames: EffectRuntimeRenderedFrameMap | undefined
): void {
  if (!frames) return;
  for (const frame of frames.values()) closeEffectRuntimeBitmap(frame.bitmap);
}

function createFrameInput(bitmap: ImageBitmap, plan: EffectRuntimeFramePlan) {
  return {
    bitmap,
    height: plan.renderDimensions.height,
    width: plan.renderDimensions.width,
  };
}

function closeInputFrames(inputFrames: EffectRuntimeFrameInputs): void {
  for (const { bitmap } of Object.values(inputFrames)) closeEffectRuntimeBitmap(bitmap);
}

function releaseInputFrames(inputFrames: EffectRuntimeFrameInputs): void {
  for (const { bitmap } of Object.values(inputFrames)) releaseEffectRuntimeBitmap(bitmap);
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
