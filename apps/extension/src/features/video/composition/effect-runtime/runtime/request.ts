import { createEffectRuntimeAssetSelectionId } from '../../../../../contracts/effect-runtime/immutable-refs';
import type {
  EffectRuntimeFrameInputs,
  EffectRuntimeImmutablePayloads,
  EffectRuntimeRenderCommand,
} from '../../../../../contracts/effect-runtime/types';
import type { EffectRuntimeFramePlan } from './types';

export async function createEffectRuntimeRenderMessage(args: {
  inputFrames: EffectRuntimeFrameInputs;
  plan: EffectRuntimeFramePlan;
  requestId: string;
  sequenceId: number;
}): Promise<EffectRuntimeRenderCommand> {
  const visualAssets = args.plan.assets.filter((asset) => asset.kind !== 'audio');
  const assetSelectionId = await createEffectRuntimeAssetSelectionId(visualAssets);
  return {
    assetSelectionRef: { id: assetSelectionId },
    controls: { ...args.plan.controls },
    documentRef: { id: args.plan.documentSha256 },
    duration: args.plan.duration,
    effectInstanceId: args.plan.effectInstanceId,
    fps: args.plan.fps,
    frameIndex: args.plan.frameIndex,
    height: args.plan.dimensions.height,
    inputFrames: args.inputFrames,
    materializeImmutablePayloads: () => materializeImmutablePayloads(args.plan, visualAssets),
    progress: args.plan.progress,
    renderHeight: args.plan.renderDimensions.height,
    renderWidth: args.plan.renderDimensions.width,
    requestId: args.requestId,
    sequenceId: args.sequenceId,
    snapshotId: args.plan.snapshotId,
    time: args.plan.time,
    width: args.plan.dimensions.width,
  };
}

async function materializeImmutablePayloads(
  plan: EffectRuntimeFramePlan,
  visualAssets: EffectRuntimeFramePlan['assets']
): Promise<EffectRuntimeImmutablePayloads> {
  const assets: EffectRuntimeImmutablePayloads['assets'] = [];
  for (const asset of visualAssets) {
    if (asset.kind === 'audio') continue;
    const bytes = await asset.blob.arrayBuffer();
    if (bytes.byteLength !== asset.byteLength) {
      throw new Error('EFFECT_RUNTIME_ASSET_READ_FAILED');
    }
    assets.push({
      byteLength: asset.byteLength,
      bytes,
      id: asset.id,
      kind: asset.kind,
      mimeType: asset.mimeType,
      sha256: asset.sha256,
    });
  }
  return { assets, documentSource: plan.documentSource };
}
