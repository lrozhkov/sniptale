import { EFFECT_RUNTIME_RESOURCE_LIMITS } from '../runtime/resource-limits';
// policyStateIds: [] - empty render maps are immutable sentinels, not authority state.
import type { EffectRuntimeSandboxExecutor } from '../../../../../contracts/effect-runtime/types';
import type { VideoCompositionMediaSource } from '../../draw/media-source';
import type { VideoCompositionFrame, VideoCompositionVisualPass } from '../../types';
import { renderEffectRuntimeFramePlans } from '../runtime/driver';
import { createEffectRuntimeInputMaterializer } from '../frame/inputs';
import { disposeEffectRuntimeComposition } from './rendered';
import { createEffectRuntimeCompositionResourceLedger } from '../runtime/resource-limits';
import type {
  EffectRuntimeFramePlan,
  EffectRuntimeRenderedComposition,
  EffectRuntimeRenderedFrameMap,
} from '../runtime/types';

const EMPTY_EFFECT_RUNTIME_FRAMES: EffectRuntimeRenderedFrameMap = new Map();

export async function renderEffectRuntimeComposition(args: {
  clipMediaElements: ReadonlyMap<string, VideoCompositionMediaSource>;
  executor: EffectRuntimeSandboxExecutor;
  imageBank: Record<string, HTMLImageElement>;
  overlayFrame: VideoCompositionFrame;
  overlayTime: number;
  ownerDocument?: Document;
  rasterScale?: number;
  signal?: AbortSignal;
  visualPasses: readonly VideoCompositionVisualPass[];
}): Promise<EffectRuntimeRenderedComposition> {
  const renderedByTime = new Map<number, EffectRuntimeRenderedFrameMap>();
  const resourceLedger = createEffectRuntimeCompositionResourceLedger();
  try {
    const overlayFrames = await renderFrame(args.overlayFrame);
    renderedByTime.set(args.overlayTime, overlayFrames);
    for (const pass of args.visualPasses) {
      if (renderedByTime.has(pass.time)) continue;
      renderedByTime.set(pass.time, await renderFrame(pass.frame));
    }
    return { framesByTime: renderedByTime, overlayFrames };
  } catch (error) {
    disposeEffectRuntimeComposition({
      framesByTime: renderedByTime,
      overlayFrames: EMPTY_EFFECT_RUNTIME_FRAMES,
    });
    throw error;
  }

  function renderFrame(frame: VideoCompositionFrame): Promise<EffectRuntimeRenderedFrameMap> {
    args.signal?.throwIfAborted();
    if ((frame.effectRuntimePlans ?? []).length === 0) {
      return Promise.resolve(EMPTY_EFFECT_RUNTIME_FRAMES);
    }
    const resourceScope = resourceLedger.createFrameScope();
    const plans = (frame.effectRuntimePlans ?? []).map((plan) =>
      scaleEffectRuntimeFramePlan(plan, args.rasterScale)
    );
    return renderEffectRuntimeFramePlans({
      executor: args.executor,
      inputMaterializer: createEffectRuntimeInputMaterializer({
        camera: frame.camera,
        clipMediaElements: args.clipMediaElements,
        imageBank: args.imageBank,
        ...(args.ownerDocument ? { ownerDocument: args.ownerDocument } : {}),
        visualLayers: frame.effectInputLayers,
        resourceScope,
      }),
      plans,
      resourceScope,
      ...(args.signal ? { signal: args.signal } : {}),
    });
  }
}

function scaleEffectRuntimeFramePlan(
  plan: EffectRuntimeFramePlan,
  rasterScale: number | undefined
): EffectRuntimeFramePlan {
  const scale = Math.min(
    Math.max(0.01, rasterScale ?? 1),
    Math.sqrt(
      EFFECT_RUNTIME_RESOURCE_LIMITS.maxOutputPixels /
        (plan.dimensions.width * plan.dimensions.height)
    )
  );
  if (
    scale === 1 &&
    plan.renderDimensions.width === plan.dimensions.width &&
    plan.renderDimensions.height === plan.dimensions.height
  )
    return plan;
  return {
    ...plan,
    renderDimensions: {
      height: Math.max(1, Math.floor(plan.dimensions.height * scale)),
      width: Math.max(1, Math.floor(plan.dimensions.width * scale)),
    },
  };
}
