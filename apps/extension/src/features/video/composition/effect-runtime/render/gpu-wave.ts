import type { EffectRuntimeSandboxExecutor } from '../../../../../contracts/effect-runtime/types';
import type { VideoCompositionFrame, VideoCompositionVisualPass } from '../../types';
import { prepareEffectRuntimeGpuFramePlans } from '../runtime/gpu-driver';
import { createEffectRuntimeGpuFrameLedger } from '../runtime/resource-limits';
import type {
  EffectRuntimeGpuPreparedComposition,
  EffectRuntimeGpuPreparedFrame,
} from '../runtime/types';
import { prepareEffectRuntimeCompositionSamples } from './composition-samples';
import { scaleEffectRuntimeFramePlan, selectExposurePlans } from './wave';

/** Dependent input chains keep their existing representation until their GPU producer is migrated. */
export function canPrepareEffectRuntimeGpuComposition(
  frames: readonly VideoCompositionFrame[]
): boolean {
  return frames.every((frame) =>
    (frame.effectRuntimePlans ?? []).every(
      (plan) =>
        plan.kind === 'standalone' && (plan.target.kind === 'scene' || plan.target.kind === 'clip')
    )
  );
}

export async function prepareEffectRuntimeGpuComposition(args: {
  executor: EffectRuntimeSandboxExecutor;
  overlayFrame: VideoCompositionFrame;
  overlayTime: number;
  visualPasses: readonly VideoCompositionVisualPass[];
  rasterScale?: number;
  signal?: AbortSignal;
}): Promise<EffectRuntimeGpuPreparedComposition> {
  const ledger = createEffectRuntimeGpuFrameLedger();
  const samples = await prepareEffectRuntimeCompositionSamples<
    ReadonlyMap<string, EffectRuntimeGpuPreparedFrame>
  >({
    overlayTime: args.overlayTime,
    sampleTimes: args.visualPasses.map((pass) => pass.time),
    stream: true,
    render: (time, sampled) => {
      const frame = sampled
        ? args.visualPasses.find((pass) => pass.time === time)?.frame
        : args.overlayFrame;
      if (!frame) throw new Error('EFFECT_RUNTIME_VISUAL_PASS_MISSING');
      const plans = sampled
        ? selectExposurePlans(frame, args.overlayFrame)
        : (frame.effectRuntimePlans ?? []);
      return prepareEffectRuntimeGpuFramePlans({
        executor: args.executor,
        plans: plans.map((plan) => scaleEffectRuntimeFramePlan(plan, args.rasterScale)),
        ledger,
        ...(args.signal ? { signal: args.signal } : {}),
      });
    },
    release: (frames) => {
      for (const frame of frames.values()) frame.dispose();
    },
  });
  return { kind: 'gpu-scene', ...samples, dispose: samples.dispose! };
}
