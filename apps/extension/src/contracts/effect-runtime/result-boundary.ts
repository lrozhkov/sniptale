// policyStateIds: [] - result codes and key lists are immutable parser allowlists, not authority state.
import { hasExactKeys, isRecord, parseEffectRuntimeIdentity } from './identity';
import { isImageBitmap } from './bitmap-lifetime';
import { isEffectRuntimeImmutableId } from './immutable-refs';
import { type EffectRuntimeErrorCode, type EffectRuntimeFrameResult } from './types';

const FAILURE_CODES = new Set<EffectRuntimeErrorCode>([
  'circuitOpen',
  'crashed',
  'inputRejected',
  'malformed',
  'mediaDecodeFailed',
  'outputRejected',
  'queueDepthExceeded',
  'resourceLimit',
  'stale',
  'timeout',
]);
const FAILURE_KEYS = [
  'code',
  'effectInstanceId',
  'kind',
  'requestId',
  'sequenceId',
  'snapshotId',
] as const;
const CACHE_MISS_KEYS = [...FAILURE_KEYS, 'missingRef'] as const;
const SUCCESS_KEYS = [
  'acknowledged',
  'bitmap',
  'effectInstanceId',
  'height',
  'kind',
  'requestId',
  'sequenceId',
  'snapshotId',
  'width',
] as const;
const ACKNOWLEDGEMENT_KEYS = ['assetSelectionId', 'documentId'] as const;

export function parseEffectRuntimeFrameResult(value: unknown): EffectRuntimeFrameResult | null {
  if (!isRecord(value)) return null;
  const identity = parseEffectRuntimeIdentity(value);
  if (!identity) return null;
  return value['kind'] === 'error'
    ? parseEffectRuntimeErrorResult(value, identity)
    : parseEffectRuntimeFrame(value, identity);
}

function parseEffectRuntimeErrorResult(
  value: Record<string, unknown>,
  identity: NonNullable<ReturnType<typeof parseEffectRuntimeIdentity>>
): EffectRuntimeFrameResult | null {
  if (value['code'] === 'cacheMiss') {
    if (
      !hasExactKeys(value, CACHE_MISS_KEYS) ||
      (value['missingRef'] !== 'assetSelection' && value['missingRef'] !== 'document')
    ) {
      return null;
    }
    return { ...identity, code: 'cacheMiss', kind: 'error', missingRef: value['missingRef'] };
  }
  if (
    !hasExactKeys(value, FAILURE_KEYS) ||
    typeof value['code'] !== 'string' ||
    !FAILURE_CODES.has(value['code'] as EffectRuntimeErrorCode)
  ) {
    return null;
  }
  return {
    ...identity,
    code: value['code'] as Exclude<EffectRuntimeErrorCode, 'cacheMiss'>,
    kind: 'error',
  };
}

function parseEffectRuntimeFrame(
  value: Record<string, unknown>,
  identity: NonNullable<ReturnType<typeof parseEffectRuntimeIdentity>>
): EffectRuntimeFrameResult | null {
  const acknowledgement = parseAcknowledgement(value['acknowledged']);
  if (
    value['kind'] !== 'frame' ||
    !hasExactKeys(value, SUCCESS_KEYS) ||
    !acknowledgement ||
    !isImageBitmap(value['bitmap']) ||
    value['width'] !== value['bitmap'].width ||
    value['height'] !== value['bitmap'].height
  ) {
    return null;
  }
  return {
    ...identity,
    acknowledged: acknowledgement,
    bitmap: value['bitmap'],
    height: value['bitmap'].height,
    kind: 'frame',
    width: value['bitmap'].width,
  };
}

function parseAcknowledgement(value: unknown) {
  if (!isRecord(value) || !hasExactKeys(value, ACKNOWLEDGEMENT_KEYS)) return null;
  return isEffectRuntimeImmutableId(value['assetSelectionId']) &&
    isEffectRuntimeImmutableId(value['documentId'])
    ? { assetSelectionId: value['assetSelectionId'], documentId: value['documentId'] }
    : null;
}
