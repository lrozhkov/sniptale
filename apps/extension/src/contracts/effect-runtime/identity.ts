import type {
  EffectRuntimeErrorCode,
  EffectRuntimeFrameFailure,
  EffectRuntimeFrameIdentity,
} from './types';

const SAFE_ID = /^[A-Za-z0-9._:-]{1,128}$/u;

export const UNKNOWN_EFFECT_RUNTIME_IDENTITY: EffectRuntimeFrameIdentity = {
  effectInstanceId: 'unknown',
  requestId: 'unknown',
  sequenceId: -1,
  snapshotId: 'unknown',
};

export function isEffectRuntimeIdentifier(value: unknown): value is string {
  return typeof value === 'string' && SAFE_ID.test(value);
}

export function parseEffectRuntimeIdentity(value: unknown): EffectRuntimeFrameIdentity | null {
  if (!isRecord(value)) return null;
  if (
    !isEffectRuntimeIdentifier(value['effectInstanceId']) ||
    !isEffectRuntimeIdentifier(value['requestId']) ||
    !isEffectRuntimeIdentifier(value['snapshotId']) ||
    typeof value['sequenceId'] !== 'number' ||
    !Number.isSafeInteger(value['sequenceId']) ||
    value['sequenceId'] < 0
  ) {
    return null;
  }
  return {
    effectInstanceId: value['effectInstanceId'],
    requestId: value['requestId'],
    sequenceId: value['sequenceId'],
    snapshotId: value['snapshotId'],
  };
}

export function getEffectRuntimeIdentity(value: unknown): EffectRuntimeFrameIdentity {
  return parseEffectRuntimeIdentity(value) ?? UNKNOWN_EFFECT_RUNTIME_IDENTITY;
}

export function createEffectRuntimeFailure(
  value: EffectRuntimeFrameIdentity | unknown,
  code: Exclude<EffectRuntimeErrorCode, 'cacheMiss'>
): EffectRuntimeFrameFailure {
  return {
    ...getEffectRuntimeIdentity(value),
    code,
    kind: 'error',
  };
}

export function sameEffectRuntimeIdentity(
  left: EffectRuntimeFrameIdentity,
  right: EffectRuntimeFrameIdentity
): boolean {
  return (
    left.effectInstanceId === right.effectInstanceId &&
    left.requestId === right.requestId &&
    left.sequenceId === right.sequenceId &&
    left.snapshotId === right.snapshotId
  );
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}
