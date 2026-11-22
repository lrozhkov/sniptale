import { parseReviewVisualAnchor } from '../visual-anchor';
import {
  readVerifiedRuntimeAnimationSource,
  verifyRuntimeAnimationSource,
} from '../../../../contracts/effect-runtime/animation';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import {
  parseAnimationTemplateSource,
  type AnimationTemplate,
} from '@sniptale/runtime-contracts/animation-template';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { EFFECT_BUNDLE_LIMITS } from '../../project/effect-bundle/limits';
import { REVIEW_TEXT_DIRECTIONS, REVIEW_TEXT_LOOPS, REVIEW_TEXT_TRANSITIONS } from './types';
import { parseReviewTextAppearance } from './text-appearance';
import type {
  ReviewAnnotationEffect,
  ReviewAnnotationTextClip,
  ReviewTextLoop,
  ReviewTextTransition,
  ReviewAnnotationEffectAsset,
  ReviewAnnotationEffects,
  ReviewAnnotationEffectSnapshot,
} from './types';

const MAX_INSTANCES = 512;
const MAX_RETAINED_BYTES = 512 * 1024 * 1024;
const MAX_TIME = 86_400;
const MAX_CONCURRENT_TEXT_WORK = 8192;
const TEXT_CLIP_PAINT_COST = 64;
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
    (raw['timeDomain'] !== undefined && raw['timeDomain'] !== 'result') ||
    !finite(raw['start'], 0, MAX_TIME) ||
    !finite(raw['end'], 0, MAX_TIME) ||
    raw['end'] <= raw['start'] ||
    (raw['attachment'] !== 'content' && raw['attachment'] !== 'viewport') ||
    !finite(raw['order'], 0, Number.MAX_SAFE_INTEGER) ||
    !Number.isSafeInteger(raw['order'])
  )
    return null;
  const visualAnchor = parseReviewVisualAnchor(raw['visualAnchor'], raw['end'] - raw['start']);
  if (visualAnchor === null) return null;
  const transform = parseTransform(raw['transform']);
  const controls = parseControls(raw['controls']);
  const anchors = parseAnchors(raw['anchors']);
  if (!transform || !controls || anchors === null) return null;
  return {
    id: raw['id'],
    snapshotId: raw['snapshotId'],
    enabled: raw['enabled'],
    ...(raw['timeDomain'] === 'result' ? { timeDomain: 'result' as const } : {}),
    start: raw['start'],
    end: raw['end'],
    ...(visualAnchor ? { visualAnchor } : {}),
    attachment: raw['attachment'],
    transform,
    controls,
    ...(anchors ? { anchors } : {}),
    order: raw['order'],
  };
}

/** Reads one authored entrance or exit phase from a project or template. */
export function parseTextTransition(raw: unknown): ReviewTextTransition | null {
  if (!isRecord(raw)) return null;
  const preset = REVIEW_TEXT_TRANSITIONS.find((item) => item === raw['preset']);
  const direction = REVIEW_TEXT_DIRECTIONS.find((item) => item === raw['direction']);
  if (
    !preset ||
    !direction ||
    !finite(raw['duration'], 0, 30) ||
    !finite(raw['distance'], 0, 1) ||
    !finite(raw['stagger'], 0, 1)
  )
    return null;
  return {
    preset,
    direction,
    duration: raw['duration'],
    distance: raw['distance'],
    stagger: raw['stagger'],
  };
}

/** Reads one authored holding motion from a project or template. */
export function parseTextLoop(raw: unknown): ReviewTextLoop | null {
  if (!isRecord(raw)) return null;
  const preset = REVIEW_TEXT_LOOPS.find((item) => item === raw['preset']);
  if (!preset || !finite(raw['period'], 0.1, 30) || !finite(raw['amount'], 0, 1)) return null;
  return { preset, period: raw['period'], amount: raw['amount'] };
}

function parseTextClip(raw: unknown): ReviewAnnotationTextClip | null {
  if (
    !isRecord(raw) ||
    !identity(raw['id']) ||
    typeof raw['enabled'] !== 'boolean' ||
    typeof raw['text'] !== 'string' ||
    raw['text'].length > 4096 ||
    !finite(raw['start'], 0, MAX_TIME) ||
    !finite(raw['end'], 0, MAX_TIME) ||
    raw['end'] <= raw['start'] ||
    !Number.isSafeInteger(raw['order']) ||
    !finite(raw['order'], 0, Number.MAX_SAFE_INTEGER) ||
    !finite(raw['fontSize'], 0.005, 0.5) ||
    typeof raw['color'] !== 'string' ||
    !/^#[a-f0-9]{6}$/iu.test(raw['color'])
  )
    return null;
  const transform = parseTransform(raw['transform']);
  const entrance = parseTextTransition(raw['entrance']);
  const exit = parseTextTransition(raw['exit']);
  const loop = parseTextLoop(raw['loop']);
  const appearance =
    raw['appearance'] === undefined ? undefined : parseReviewTextAppearance(raw['appearance']);
  if (!transform || !entrance || !exit || !loop || appearance === null) return null;
  return {
    id: raw['id'],
    enabled: raw['enabled'],
    text: raw['text'],
    start: raw['start'],
    end: raw['end'],
    transform,
    color: raw['color'],
    fontSize: raw['fontSize'],
    ...(appearance ? { appearance } : {}),
    order: raw['order'],
    entrance,
    loop,
    exit,
  };
}

function textWorkFitsFrame(clips: readonly ReviewAnnotationTextClip[]) {
  const events = clips
    .filter((clip) => clip.enabled && clip.text.trim())
    .flatMap(({ start, end, text }) => {
      const work = Math.max(TEXT_CLIP_PAINT_COST, text.length);
      return [
        { time: start, work },
        { time: end, work: -work },
      ];
    })
    .sort((a, b) => a.time - b.time || a.work - b.work);
  let work = 0;
  for (const event of events) {
    work += event.work;
    if (work > MAX_CONCURRENT_TEXT_WORK) return false;
  }
  return true;
}

/** Canonical JSON instances; disabled and wholly cut annotations remain authored content. */
export function parseReviewAnnotationEffects(raw: unknown): ReviewAnnotationEffects | null {
  if (
    !isRecord(raw) ||
    typeof raw['enabled'] !== 'boolean' ||
    !Array.isArray(raw['instances']) ||
    raw['instances'].length > MAX_INSTANCES ||
    (raw['textClips'] !== undefined &&
      (!Array.isArray(raw['textClips']) ||
        raw['instances'].length + raw['textClips'].length > MAX_INSTANCES))
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
  const textClips: ReviewAnnotationTextClip[] = [];
  if (Array.isArray(raw['textClips'])) {
    for (const value of raw['textClips']) {
      const clip = parseTextClip(value);
      if (!clip || ids.has(clip.id) || orders.has(clip.order)) return null;
      ids.add(clip.id);
      orders.add(clip.order);
      textClips.push(clip);
    }
  }
  if (!textWorkFitsFrame(textClips)) return null;
  return {
    enabled: raw['enabled'],
    instances: instances.sort((a, b) => a.order - b.order),
    ...(textClips.length ? { textClips: textClips.sort((a, b) => a.order - b.order) } : {}),
  };
}

/** Each animation snapshot owns its complete checked local package. */
export function readReviewAnnotationEffectDocument(
  source: string,
  digest?: string
): AnimationTemplate | null {
  const verified = digest ? readVerifiedRuntimeAnimationSource(source, digest) : null;
  if (verified) return verified;
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
  const document = readReviewAnnotationEffectDocument(raw['source'], raw['sha256']);
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
  const verified = readVerifiedRuntimeAnimationSource(snapshot.source, snapshot.sha256);
  if (!verified) {
    const sourceHash = bytesToHex(sha256(new TextEncoder().encode(snapshot.source)));
    signal.throwIfAborted();
    if (sourceHash !== snapshot.sha256)
      throw new ReviewAnnotationEffectUnavailableError('source-integrity');
  }
  const document = await verifyRuntimeAnimationSource(snapshot.source, snapshot.sha256, signal);
  signal.throwIfAborted();
  // Structural parsing already succeeded above; failed full admission means resource integrity failed.
  if (!document) throw new ReviewAnnotationEffectUnavailableError('resource-integrity');
  const assets: (ReviewAnnotationEffectAsset & { blob: Blob })[] = [];
  signal.throwIfAborted();
  return {
    snapshot,
    document,
    mode: 'object' as const,
    assets,
  };
}
