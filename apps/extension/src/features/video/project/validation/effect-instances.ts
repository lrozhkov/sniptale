import { parseAnimationTemplateSource } from '@sniptale/runtime-contracts/animation-template';

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
const MAX_PROJECT_EFFECT_SNAPSHOT_BYTES = 512 * 1024 * 1024;

export function isEffectProjectBranches(
  snapshotsValue: unknown,
  instancesValue: unknown
): snapshotsValue is VideoProjectEffectSnapshot[] {
  return validateEffectProjectBranches(snapshotsValue, instancesValue);
}

export function isEffectProjectMetadataBranches(
  snapshotsValue: unknown,
  instancesValue: unknown
): boolean {
  return validateEffectProjectBranches(snapshotsValue, instancesValue);
}

function validateEffectProjectBranches(snapshotsValue: unknown, instancesValue: unknown): boolean {
  if (
    snapshotsValue !== undefined &&
    (!Array.isArray(snapshotsValue) ||
      snapshotsValue.length > MAX_EFFECT_SNAPSHOTS ||
      !snapshotsValue.every((snapshot) => isEffectSnapshot(snapshot)))
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
    instances.every(
      (instance) =>
        snapshotIds.has(instance.snapshotId) &&
        hasValidInstanceLayout(
          instance,
          snapshots.find((snapshot) => snapshot.id === instance.snapshotId)!
        )
    )
  );
}

export function hasValidEffectProjectReferences(
  project: VideoProjectEffectReferenceModel
): boolean {
  return hasValidReferences(project);
}

function isEffectSnapshot(value: unknown): value is VideoProjectEffectSnapshot {
  if (
    !isRecord(value) ||
    typeof value['id'] !== 'string' ||
    value['id'] !== `effect:${value['sha256']}` ||
    typeof value['documentId'] !== 'string' ||
    value['schemaVersion'] !== 'sniptale.animation.v1' ||
    !isKind(value['kind']) ||
    typeof value['sha256'] !== 'string' ||
    !SHA256.test(value['sha256']) ||
    typeof value['source'] !== 'string' ||
    typeof value['retainedByteLength'] !== 'number' ||
    !Number.isSafeInteger(value['retainedByteLength']) ||
    value['retainedByteLength'] <= 0 ||
    !Array.isArray(value['assets']) ||
    value['assets'].length !== 0
  ) {
    return false;
  }
  const validation = parseAnimationTemplateSource(value['source']);
  return (
    validation.ok &&
    validation.template.id === value['documentId'] &&
    new TextEncoder().encode(value['source']).byteLength === value['retainedByteLength']
  );
}

function isEffectInstance(value: unknown): value is VideoProjectEffectInstance {
  return (
    isRecord(value) &&
    typeof value['id'] === 'string' &&
    value['id'].length > 0 &&
    value['id'].length <= 128 &&
    typeof value['snapshotId'] === 'string' &&
    (value['catalogPackId'] === undefined ||
      (typeof value['catalogPackId'] === 'string' &&
        (value['catalogPackId'].startsWith('builtin:')
          ? /^builtin:[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value['catalogPackId'])
          : /^[A-Za-z0-9][A-Za-z0-9._-]{0,191}$/.test(value['catalogPackId'])))) &&
    isKind(value['kind']) &&
    typeof value['enabled'] === 'boolean' &&
    value['rangeMode'] === undefined &&
    isNonNegativeFinite(value['startTime']) &&
    isPositiveFinite(value['duration']) &&
    isPositiveFinite(value['playbackRate']) &&
    (value['sourceStart'] === undefined || isNonNegativeFinite(value['sourceStart'])) &&
    isEffectTarget(value['target']) &&
    isSceneAnchors(value['sceneAnchors']) &&
    isControls(value['controls'])
  );
}

function isEffectTarget(value: unknown): boolean {
  return isRecord(value) && value['kind'] === 'scene';
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

function isKind(value: unknown): value is 'standalone' {
  return value === 'standalone';
}

function isNonNegativeFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isPositiveFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function isSceneAnchors(value: unknown): boolean {
  if (value === undefined) return true;
  return (
    isRecord(value) &&
    Object.keys(value).length <= 8 &&
    Object.values(value).every(
      (point) =>
        isRecord(point) &&
        Object.keys(point).length === 2 &&
        typeof point['x'] === 'number' &&
        Number.isFinite(point['x']) &&
        Math.abs(point['x']) <= 1_000_000 &&
        typeof point['y'] === 'number' &&
        Number.isFinite(point['y']) &&
        Math.abs(point['y']) <= 1_000_000
    )
  );
}

function hasValidInstanceLayout(
  instance: VideoProjectEffectInstance,
  snapshot: VideoProjectEffectSnapshot
): boolean {
  const parsed = parseAnimationTemplateSource(snapshot.source);
  if (!parsed.ok) return false;
  const document = parsed.template;
  const handles = document.objectLayout?.handles ?? [];
  const anchors = instance.sceneAnchors ?? {};
  return (
    Object.keys(anchors).length === handles.length &&
    handles.every(
      (handle) =>
        Object.hasOwn(anchors, handle.id) &&
        instance.controls[handle.xControl] === undefined &&
        instance.controls[handle.yControl] === undefined
    )
  );
}
