import { closeEffectRuntimeGpuPlanResources } from '../../features/video/composition/effect-runtime/runtime/resource-limits';
import { parseEffectRuntimeGpuPlan } from '../../features/video/composition/effect-runtime/runtime/gpu-plan-boundary';
import { closeEffectRuntimeBitmaps } from '../../contracts/effect-runtime/bitmap-lifetime';
import { hasExactKeys, isRecord } from '../../contracts/effect-runtime/identity';
import { parseEffectRuntimeFrameResult } from '../../contracts/effect-runtime/result-boundary';
import {
  EFFECT_RUNTIME_WORKER_RESPONSE,
  type EffectRuntimeFrameResult,
  type EffectRuntimeWorkerResult,
  type EffectRuntimeWorkerMessage,
} from '../../contracts/effect-runtime/types';

export function collectEffectRuntimeWorkerTransferables(
  request: EffectRuntimeWorkerMessage
): Transferable[] {
  const bitmaps = [
    ...Object.values(request.assetSelectionRef.assets ?? {})
      .filter((asset) => asset.kind === 'image')
      .map((asset) => asset.bitmap),
    ...Object.values(request.inputFrames).map(({ bitmap }) => bitmap),
  ];
  return [...new Set(bitmaps)];
}

export function parseEffectRuntimeWorkerResponse(value: unknown): EffectRuntimeFrameResult | null;
export function parseEffectRuntimeWorkerResponse(
  value: unknown,
  expected: EffectRuntimeWorkerMessage
): EffectRuntimeWorkerResult | null;
export function parseEffectRuntimeWorkerResponse(
  value: unknown,
  expected?: EffectRuntimeWorkerMessage
): EffectRuntimeWorkerResult | null {
  if (!isRecord(value) || !hasExactKeys(value, ['result', 'type'])) return null;
  if (value['type'] !== EFFECT_RUNTIME_WORKER_RESPONSE || !isRecord(value['result'])) return null;
  if (value['result']['kind'] === 'gpu-plan')
    return expected ? parseEffectRuntimeGpuPlan(value['result'], expected) : null;
  return parseEffectRuntimeFrameResult(value['result']);
}

export function closeEffectRuntimeWorkerRequestBitmaps(request: EffectRuntimeWorkerMessage): void {
  closeEffectRuntimeBitmaps(request.assetSelectionRef.assets);
  closeEffectRuntimeBitmaps(request.inputFrames);
}

export function hasExpectedEffectRuntimeAcknowledgement(
  request: EffectRuntimeWorkerMessage,
  result: EffectRuntimeWorkerResult
): boolean {
  return (
    result.kind === 'error' ||
    (result.acknowledged.documentId === request.documentRef.id &&
      result.acknowledged.assetSelectionId === request.assetSelectionRef.id)
  );
}

/** Release worker output resources before rejecting malformed, stale, or late results. */
export function closeEffectRuntimeWorkerResponse(value: unknown): void {
  const result = isRecord(value) && isRecord(value['result']) ? value['result'] : value;
  if (isRecord(result) && (result['kind'] === 'gpu-plan' || Array.isArray(result['resources']))) {
    closeEffectRuntimeGpuPlanResources(result);
    return;
  }
  closeEffectRuntimeBitmaps(result);
}
