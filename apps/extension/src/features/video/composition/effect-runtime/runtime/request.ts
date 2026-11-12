import { createEffectRuntimeAssetSelectionId } from '../../../../../contracts/effect-runtime/immutable-refs';
import { verifyRuntimeAnimationSource } from '../../../../../contracts/effect-runtime/animation';
import type {
  EffectRuntimeFrameInputs,
  EffectRuntimeRenderCommand,
} from '../../../../../contracts/effect-runtime/types';
import { readEffectPresentationDocument } from '../../../project/effect-bundle/presentation-document';
import type { EffectRuntimeFramePlan } from './types';

export async function createEffectRuntimeRenderMessage(args: {
  inputFrames: EffectRuntimeFrameInputs;
  plan: EffectRuntimeFramePlan;
  requestId: string;
  sequenceId: number;
}): Promise<EffectRuntimeRenderCommand> {
  const { plan } = args;
  if (plan.assets.length !== 0 || Object.keys(args.inputFrames).length !== 0)
    throw new Error('EFFECT_RUNTIME_ANIMATION_INPUT_REJECTED');
  const document = readEffectPresentationDocument(plan.documentSource).document;
  if (!document) throw new Error('EFFECT_RUNTIME_ANIMATION_SOURCE_REJECTED');
  const assetSelectionId = await createEffectRuntimeAssetSelectionId(
    document.resources.map(({ path, sha256 }) => ({ id: path, sha256 }))
  );
  return {
    assetSelectionRef: { id: assetSelectionId },
    controls: { ...plan.controls },
    documentRef: { id: plan.documentSha256 },
    duration: plan.duration,
    effectInstanceId: plan.effectInstanceId,
    fps: plan.fps,
    frameIndex: plan.frameIndex,
    height: plan.dimensions.height,
    inputFrames: {},
    async materializeImmutablePayloads() {
      if (!(await verifyRuntimeAnimationSource(plan.documentSource, plan.documentSha256)))
        throw new Error('EFFECT_RUNTIME_ANIMATION_INTEGRITY_FAILED');
      return { assets: [], documentSource: plan.documentSource };
    },
    progress: plan.progress,
    renderHeight: plan.renderDimensions.height,
    renderWidth: plan.renderDimensions.width,
    requestId: args.requestId,
    sequenceId: args.sequenceId,
    snapshotId: plan.snapshotId,
    time: plan.time,
    width: plan.dimensions.width,
  };
}
