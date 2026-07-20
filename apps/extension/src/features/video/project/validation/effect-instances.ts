import { validateEffectV1Document } from '@sniptale/runtime-contracts/effect-v1';

import { parseBoundedEffectJson } from '../effect-bundle/json-structure';
import type {
  VideoProjectEffectInstance,
  VideoProjectEffectSnapshot,
} from '../effect-instance/types';
import {
  hasValidEffectProjectReferences as hasValidReferences,
  type VideoProjectEffectReferenceModel,
} from './effect-instance-references';
import { isRecord } from './primitives';

const SHA256 = /^[a-f0-9]{64}$/;
const MAX_EFFECT_INSTANCES = 1_000;
const MAX_EFFECT_SNAPSHOTS = 100;
const MAX_EFFECT_ASSETS_PER_SNAPSHOT = 200;
const MAX_PROJECT_EFFECT_SNAPSHOT_BYTES = 512 * 1024 * 1024;

export function isEffectProjectBranches(
  snapshotsValue: unknown,
  instancesValue: unknown
): snapshotsValue is VideoProjectEffectSnapshot[] {
  return validateEffectProjectBranches(snapshotsValue, instancesValue, isEffectSnapshotAsset);
}

export function isEffectProjectMetadataBranches(
  snapshotsValue: unknown,
  instancesValue: unknown
): boolean {
  return validateEffectProjectBranches(
    snapshotsValue,
    instancesValue,
    isEffectSnapshotAssetMetadata
  );
}

function validateEffectProjectBranches(
  snapshotsValue: unknown,
  instancesValue: unknown,
  isAsset: (value: unknown) => boolean
): boolean {
  if (
    snapshotsValue !== undefined &&
    (!Array.isArray(snapshotsValue) ||
      snapshotsValue.length > MAX_EFFECT_SNAPSHOTS ||
      !snapshotsValue.every((snapshot) => isEffectSnapshot(snapshot, isAsset)))
  ) {
    return false;
  }
  if (
    instancesValue !== undefined &&
    (!Array.isArray(instancesValue) ||
      instancesValue.length > MAX_EFFECT_INSTANCES ||
      !instancesValue.every(isEffectInstance))
  ) {
    return false;
  }
  const snapshots = (snapshotsValue ?? []) as VideoProjectEffectSnapshot[];
  const instances = (instancesValue ?? []) as VideoProjectEffectInstance[];
  const snapshotIds = new Set<string>();
  let retainedBytes = 0;
  for (const snapshot of snapshots) {
    if (snapshotIds.has(snapshot.id)) return false;
    snapshotIds.add(snapshot.id);
    retainedBytes += snapshot.retainedByteLength;
  }
  return (
    retainedBytes <= MAX_PROJECT_EFFECT_SNAPSHOT_BYTES &&
    instances.every(({ snapshotId }) => snapshotIds.has(snapshotId))
  );
}

export function hasValidEffectProjectReferences(
  project: VideoProjectEffectReferenceModel
): boolean {
  return hasValidReferences(project);
}

function isEffectSnapshot(
  value: unknown,
  isAsset: (value: unknown) => boolean
): value is VideoProjectEffectSnapshot {
  if (
    !isRecord(value) ||
    typeof value['id'] !== 'string' ||
    value['id'] !== `effect:${String(value['sha256'])}` ||
    typeof value['documentId'] !== 'string' ||
    value['schemaVersion'] !== 'sniptale.effect.v1' ||
    !isKind(value['kind']) ||
    typeof value['sha256'] !== 'string' ||
    !SHA256.test(value['sha256']) ||
    typeof value['source'] !== 'string' ||
    typeof value['retainedByteLength'] !== 'number' ||
    !Number.isSafeInteger(value['retainedByteLength']) ||
    value['retainedByteLength'] <= 0 ||
    !Array.isArray(value['assets']) ||
    value['assets'].length > MAX_EFFECT_ASSETS_PER_SNAPSHOT ||
    !value['assets'].every(isAsset)
  ) {
    return false;
  }
  let input: unknown;
  try {
    input = parseBoundedEffectJson(new TextEncoder().encode(value['source']));
  } catch {
    return false;
  }
  const validation = validateEffectV1Document(input);
  const retainedByteLength =
    new TextEncoder().encode(value['source']).byteLength +
    sumEffectSnapshotAssetBytes(value['assets']);
  return (
    validation.ok &&
    validation.document?.id === value['documentId'] &&
    validation.document.kind === value['kind'] &&
    retainedByteLength === value['retainedByteLength']
  );
}

function sumEffectSnapshotAssetBytes(value: unknown): number {
  if (!Array.isArray(value)) return 0;
  return value.reduce<number>(
    (total, asset) =>
      total +
      (isRecord(asset) && typeof asset['byteLength'] === 'number' ? asset['byteLength'] : 0),
    0
  );
}

function isEffectSnapshotAsset(value: unknown): boolean {
  return (
    isEffectSnapshotAssetMetadata(value) &&
    isRecord(value) &&
    value['blob'] instanceof Blob &&
    value['byteLength'] === value['blob'].size
  );
}

function isEffectSnapshotAssetMetadata(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value['id'] === 'string' &&
    value['id'].length > 0 &&
    value['id'].length <= 128 &&
    typeof value['byteLength'] === 'number' &&
    Number.isSafeInteger(value['byteLength']) &&
    value['byteLength'] > 0 &&
    (value['kind'] === 'audio' || value['kind'] === 'image' || value['kind'] === 'svg') &&
    typeof value['mimeType'] === 'string' &&
    typeof value['sha256'] === 'string' &&
    SHA256.test(value['sha256'])
  );
}

function isEffectInstance(value: unknown): value is VideoProjectEffectInstance {
  return (
    isRecord(value) &&
    typeof value['id'] === 'string' &&
    value['id'].length > 0 &&
    value['id'].length <= 128 &&
    typeof value['snapshotId'] === 'string' &&
    isKind(value['kind']) &&
    typeof value['enabled'] === 'boolean' &&
    isNonNegativeFinite(value['startTime']) &&
    isPositiveFinite(value['duration']) &&
    isPositiveFinite(value['playbackRate']) &&
    isEffectTarget(value['target']) &&
    isControls(value['controls'])
  );
}

function isEffectTarget(value: unknown): boolean {
  return (
    isRecord(value) &&
    (value['kind'] === 'scene' ||
      (value['kind'] === 'clip' && typeof value['clipId'] === 'string') ||
      (value['kind'] === 'transition' && typeof value['transitionId'] === 'string'))
  );
}

function isControls(value: unknown): boolean {
  return (
    isRecord(value) &&
    Object.keys(value).length <= 256 &&
    Object.entries(value).every(
      ([key, control]) =>
        key.length > 0 &&
        key.length <= 128 &&
        ((typeof control === 'number' && Number.isFinite(control)) ||
          (typeof control === 'string' && control.length <= 16_384))
    )
  );
}

function isKind(value: unknown): value is 'standalone' | 'targetEffect' | 'transition' {
  return value === 'standalone' || value === 'targetEffect' || value === 'transition';
}

function isNonNegativeFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isPositiveFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}
