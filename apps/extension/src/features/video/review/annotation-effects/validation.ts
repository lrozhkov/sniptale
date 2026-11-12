import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import {
  parseAnimationTemplateSource,
  verifyAnimationResource,
  type AnimationTemplate,
} from '@sniptale/runtime-contracts/animation-template';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { EFFECT_BUNDLE_LIMITS } from '../../project/effect-bundle/limits';
import type {
  ReviewAnnotationEffect,
  ReviewAnnotationEffectAsset,
  ReviewAnnotationEffects,
  ReviewAnnotationEffectSnapshot,
} from './types';

const MAX_INSTANCES = 512;
const MAX_RETAINED_BYTES = 512 * 1024 * 1024;
const MAX_TIME = 86_400;
const identity = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= 256 &&
  value.trim() === value &&
  !['__proto__', 'constructor', 'prototype'].includes(value);
const finite = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const digest = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);

function parseTransform(raw: unknown): ReviewAnnotationEffect['transform'] | null {
  const box = raw;
  if (
    !isRecord(box) ||
    !finite(box['x'], -16, 16) ||
    !finite(box['y'], -16, 16) ||
    !finite(box['width'], 0.000001, 16) ||
    !finite(box['height'], 0.000001, 16) ||
    !finite(box['rotation'], -Math.PI * 2, Math.PI * 2)
  )
    return null;
  return {
    x: box['x'],
    y: box['y'],
    width: box['width'],
    height: box['height'],
    rotation: box['rotation'],
  };
}

function parseControls(raw: unknown): ReviewAnnotationEffect['controls'] | null {
  const values = raw;
  if (!isRecord(values) || Object.keys(values).length > 256) return null;
  const controls: Record<string, string | number> = {};
  let characters = 0;
  for (const [key, value] of Object.entries(values)) {
    if (
      !identity(key) ||
      (typeof value !== 'string' && typeof value !== 'number') ||
      (typeof value === 'number' && !Number.isFinite(value))
    )
      return null;
    if (typeof value === 'string') {
      characters += value.length;
      if (
        value.length > EFFECT_BUNDLE_LIMITS.maxJsonStringCharacters ||
        characters > EFFECT_BUNDLE_LIMITS.maxJsonBytes
      )
        return null;
    }
    controls[key] = value;
  }
  return controls;
}

function parseAnchors(raw: unknown): ReviewAnnotationEffect['anchors'] | null {
  if (raw === undefined) return undefined;
  if (!isRecord(raw) || Object.keys(raw).length > 256) return null;
  const anchors: NonNullable<ReviewAnnotationEffect['anchors']> = {};
  for (const [key, point] of Object.entries(raw)) {
    if (
      !identity(key) ||
      !isRecord(point) ||
      !finite(point['x'], -16, 16) ||
      !finite(point['y'], -16, 16)
    )
      return null;
    anchors[key] = { x: point['x'], y: point['y'] };
  }
  return anchors;
}

function parseInstance(raw: unknown): ReviewAnnotationEffect | null {
  if (
    !isRecord(raw) ||
    !identity(raw['id']) ||
    !identity(raw['snapshotId']) ||
    typeof raw['enabled'] !== 'boolean' ||
    !finite(raw['start'], 0, MAX_TIME) ||
    !finite(raw['end'], 0, MAX_TIME) ||
    raw['end'] <= raw['start'] ||
    (raw['attachment'] !== 'content' && raw['attachment'] !== 'viewport') ||
    !finite(raw['order'], 0, Number.MAX_SAFE_INTEGER) ||
    !Number.isSafeInteger(raw['order'])
  )
    return null;
  const transform = parseTransform(raw['transform']);
  const controls = parseControls(raw['controls']);
  const anchors = parseAnchors(raw['anchors']);
  if (!transform || !controls || anchors === null) return null;
  return {
    id: raw['id'],
    snapshotId: raw['snapshotId'],
    enabled: raw['enabled'],
    start: raw['start'],
    end: raw['end'],
    attachment: raw['attachment'],
    transform,
    controls,
    ...(anchors ? { anchors } : {}),
    order: raw['order'],
  };
}

/** Canonical JSON instances; disabled and wholly cut annotations remain authored content. */
export function parseReviewAnnotationEffects(raw: unknown): ReviewAnnotationEffects | null {
  if (
    !isRecord(raw) ||
    typeof raw['enabled'] !== 'boolean' ||
    !Array.isArray(raw['instances']) ||
    raw['instances'].length > MAX_INSTANCES
  )
    return null;
  const instances: ReviewAnnotationEffect[] = [];
  const ids = new Set<string>();
  const orders = new Set<number>();
  for (const value of raw['instances']) {
    const instance = parseInstance(value);
    if (!instance || ids.has(instance.id) || orders.has(instance.order)) return null;
    ids.add(instance.id);
    orders.add(instance.order);
    instances.push(instance);
  }
  return { enabled: raw['enabled'], instances: instances.sort((a, b) => a.order - b.order) };
}

/** Each animation snapshot owns its complete checked local package. */
export function readReviewAnnotationEffectDocument(source: string): AnimationTemplate | null {
  const result = parseAnimationTemplateSource(source);
  return result.ok ? result.template : null;
}

function parseSnapshot(raw: unknown): ReviewAnnotationEffectSnapshot | null {
  if (
    !isRecord(raw) ||
    raw['schemaVersion'] !== 'sniptale.animation.v1' ||
    raw['kind'] !== 'standalone' ||
    !digest(raw['sha256']) ||
    raw['id'] !== `effect:${raw['sha256']}` ||
    !identity(raw['documentId']) ||
    typeof raw['source'] !== 'string' ||
    raw['source'].length > EFFECT_BUNDLE_LIMITS.maxJsonBytes ||
    !finite(raw['retainedByteLength'], 1, MAX_RETAINED_BYTES) ||
    !Number.isSafeInteger(raw['retainedByteLength']) ||
    !Array.isArray(raw['assets']) ||
    raw['assets'].length !== 0
  )
    return null;
  const sourceBytes = new TextEncoder().encode(raw['source']).byteLength;
  if (sourceBytes !== raw['retainedByteLength']) return null;
  const document = readReviewAnnotationEffectDocument(raw['source']);
  if (!document || document.id !== raw['documentId']) return null;
  return {
    id: raw['id'],
    schemaVersion: 'sniptale.animation.v1',
    kind: 'standalone',
    documentId: raw['documentId'],
    sha256: raw['sha256'],
    source: raw['source'],
    retainedByteLength: raw['retainedByteLength'],
    assets: [],
  };
}

/** Structural registry admission only; byte digests/signatures are verified outside IndexedDB transactions. */
export function parseReviewAnnotationEffectSnapshots(
  raw: unknown
): ReviewAnnotationEffectSnapshot[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_INSTANCES) return null;
  const snapshots: ReviewAnnotationEffectSnapshot[] = [];
  const ids = new Set<string>();
  let retained = 0;
  for (const value of raw) {
    const snapshot = parseSnapshot(value);
    if (!snapshot || ids.has(snapshot.id)) return null;
    retained += snapshot.retainedByteLength;
    if (retained > MAX_RETAINED_BYTES) return null;
    ids.add(snapshot.id);
    snapshots.push(snapshot);
  }
  return snapshots.sort((a, b) => a.id.localeCompare(b.id));
}

/** Merges immutable identities without allowing even a resource binding to rewrite a retained source. */
export function mergeReviewAnnotationEffectSnapshots(
  current: readonly ReviewAnnotationEffectSnapshot[],
  additional: readonly ReviewAnnotationEffectSnapshot[]
): ReviewAnnotationEffectSnapshot[] | null {
  const retained = parseReviewAnnotationEffectSnapshots([...current]);
  const incoming = parseReviewAnnotationEffectSnapshots([...additional]);
  if (!retained || !incoming) return null;
  const merged = new Map(retained.map((snapshot) => [snapshot.id, snapshot]));
  for (const snapshot of incoming) {
    const previous = merged.get(snapshot.id);
    if (previous && JSON.stringify(previous) !== JSON.stringify(snapshot)) return null;
    merged.set(snapshot.id, snapshot);
  }
  return parseReviewAnnotationEffectSnapshots([...merged.values()]);
}

/** Checks every retained instance against its own immutable source, including handle and option bindings. */
export function reviewAnnotationEffectMatchesDocument(
  instance: ReviewAnnotationEffect,
  document: AnimationTemplate
): boolean {
  const controls = new Map(document.controls.map((control) => [control.id, control]));
  const handles = document.objectLayout?.handles ?? [];
  const anchorIds = Object.keys(instance.anchors ?? {});
  if (
    anchorIds.length !== handles.length ||
    handles.some((handle) => !instance.anchors?.[handle.id])
  )
    return false;
  const bound = new Set(handles.flatMap((handle) => [handle.xControl, handle.yControl]));
  for (const [key, value] of Object.entries(instance.controls)) {
    const control = controls.get(key);
    if (!control || bound.has(key)) return false;
    if (control.kind === 'number') {
      if (
        typeof value !== 'number' ||
        !Number.isFinite(value) ||
        (control.min !== undefined && value < control.min) ||
        (control.max !== undefined && value > control.max)
      )
        return false;
    } else if (typeof value !== 'string') return false;
    if (control.options && !control.options.some((option) => option.value === value)) return false;
  }
  return true;
}

/** Content-free read failure; retained source and authored history are never repaired or dropped. */
export class ReviewAnnotationEffectUnavailableError extends Error {
  constructor(
    public readonly code:
      | 'invalid'
      | 'source-integrity'
      | 'resource-unavailable'
      | 'resource-integrity'
  ) {
    super(`Annotation effect is unavailable: ${code}.`);
    this.name = 'ReviewAnnotationEffectUnavailableError';
  }
}

/** Verifies immutable bytes outside storage transactions through an injected existing asset reader. */
export async function verifyReviewAnnotationEffectSnapshot(
  raw: unknown,
  _readAsset: (reference: string, signal: AbortSignal) => Promise<Blob | undefined>,
  signal: AbortSignal
) {
  signal.throwIfAborted();
  const snapshot = parseReviewAnnotationEffectSnapshots([raw])?.[0];
  if (!snapshot) throw new ReviewAnnotationEffectUnavailableError('invalid');
  const sourceHash = bytesToHex(sha256(new TextEncoder().encode(snapshot.source)));
  signal.throwIfAborted();
  if (sourceHash !== snapshot.sha256)
    throw new ReviewAnnotationEffectUnavailableError('source-integrity');
  const document = readReviewAnnotationEffectDocument(snapshot.source);
  if (!document) throw new ReviewAnnotationEffectUnavailableError('invalid');
  for (const resource of document.resources) {
    signal.throwIfAborted();
    if (!(await verifyAnimationResource(resource)))
      throw new ReviewAnnotationEffectUnavailableError('resource-integrity');
  }
  const assets: (ReviewAnnotationEffectAsset & { blob: Blob })[] = [];
  signal.throwIfAborted();
  return {
    snapshot,
    document,
    mode: 'object' as const,
    assets,
  };
}
