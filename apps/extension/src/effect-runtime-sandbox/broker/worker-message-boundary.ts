import { closeEffectRuntimeBitmaps } from '../../contracts/effect-runtime/bitmap-lifetime';
import { hasExactKeys, isRecord } from '../../contracts/effect-runtime/identity';
import { parseEffectRuntimeFrameResult } from '../../contracts/effect-runtime/result-boundary';
import {
  EFFECT_RUNTIME_WORKER_RESPONSE,
  type EffectRuntimeFrameResult,
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

export function parseEffectRuntimeWorkerResponse(value: unknown): EffectRuntimeFrameResult | null {
  if (!isRecord(value) || !hasExactKeys(value, ['result', 'type'])) return null;
  if (value['type'] !== EFFECT_RUNTIME_WORKER_RESPONSE || !isRecord(value['result'])) return null;
  return parseEffectRuntimeFrameResult(value['result']);
}

export function closeEffectRuntimeWorkerRequestBitmaps(request: EffectRuntimeWorkerMessage): void {
  closeEffectRuntimeBitmaps(request.assetSelectionRef.assets);
  closeEffectRuntimeBitmaps(request.inputFrames);
}

export function hasExpectedEffectRuntimeAcknowledgement(
  request: EffectRuntimeWorkerMessage,
  result: EffectRuntimeFrameResult
): boolean {
  return (
    result.kind !== 'frame' ||
    (result.acknowledged.documentId === request.documentRef.id &&
      result.acknowledged.assetSelectionId === request.assetSelectionRef.id)
  );
}
