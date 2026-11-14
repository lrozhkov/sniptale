import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import {
  ANIMATION_TEMPLATE_LIMITS,
  parseAnimationTemplateSource,
  validateAnimationTemplate,
  verifyAnimationResource,
  resolveAnimationObjectRenderBounds,
  type AnimationTemplate,
} from '@sniptale/runtime-contracts/animation-template';
import { parseEffectControlValues } from '@sniptale/runtime-contracts/effect-controls';
import { isEffectRuntimeImmutableId } from './immutable-refs';
import { parseEffectLogicalDimensions } from './dimensions';
import { hasExactKeys, isRecord } from './identity';

/** The source clock is intrinsic to the immutable animation, including a nonzero in-point. */
export function animationRuntimeDuration(document: AnimationTemplate): number {
  return (document.animation.op - document.animation.ip) / document.animation.fr;
}

/** Stabilize integer boundaries within eight arithmetic ULPs, without rounding real subframes. */
export function effectRuntimeFrameIndex(time: number, fps: number): number {
  const frame = time * fps;
  const integer = Math.round(frame);
  const tolerance = Number.EPSILON * Math.max(1, Math.abs(frame)) * 8;
  return Math.max(0, Math.floor(Math.abs(frame - integer) <= tolerance ? integer : frame));
}

/** dotLottie takes a frame relative to ip; its core applies the source in-point. */
export function animationRuntimeFrameIndex(
  animation: Pick<AnimationTemplate['animation'], 'fr' | 'ip' | 'op'>,
  time: number
): number {
  return Math.min(
    Math.max(0, Math.ceil(animation.op - animation.ip) - 1),
    effectRuntimeFrameIndex(time, animation.fr)
  );
}

export function parseRuntimeAnimationDocument(value: unknown): AnimationTemplate | null {
  const result = validateAnimationTemplate(value);
  return result.ok ? result.template : null;
}

const verifiedPackages = new WeakMap<AnimationTemplate, { source: string; digest: string }>();
const verifiedIndex = new Map<string, WeakRef<AnimationTemplate>>();
const MAX_VERIFIED_IDENTITIES = 512;

/** Reuse only a completely verified, immutable package with exactly the same source bytes. */
export function readVerifiedRuntimeAnimationSource(
  source: unknown,
  digest: string
): AnimationTemplate | null {
  if (typeof source !== 'string' || !isEffectRuntimeImmutableId(digest)) return null;
  const document = verifiedIndex.get(digest)?.deref();
  if (!document) {
    verifiedIndex.delete(digest);
    return null;
  }
  const proof = verifiedPackages.get(document);
  return proof?.source === source && proof.digest === digest ? document : null;
}
function freezeVerifiedPackage(value: unknown): void {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return;
  for (const child of Object.values(value)) freezeVerifiedPackage(child);
  Object.freeze(value);
}

/** Verify all package-local bytes before any image or font decoder can observe them. */
export async function verifyRuntimeAnimationSource(
  source: unknown,
  expectedSha256: string,
  signal?: AbortSignal
): Promise<AnimationTemplate | null> {
  signal?.throwIfAborted();
  const retained = readVerifiedRuntimeAnimationSource(source, expectedSha256);
  if (retained) return retained;
  if (typeof source !== 'string' || !isEffectRuntimeImmutableId(expectedSha256)) return null;
  const result = parseAnimationTemplateSource(source);
  if (!result.ok) return null;
  const bytes = new TextEncoder().encode(source);
  if (bytes.byteLength > ANIMATION_TEMPLATE_LIMITS.jsonBytes) return null;
  if (bytesToHex(sha256(bytes)) !== expectedSha256) return null;
  for (const resource of result.template.resources) {
    signal?.throwIfAborted();
    if (!(await verifyAnimationResource(resource))) return null;
  }
  signal?.throwIfAborted();
  const completed = readVerifiedRuntimeAnimationSource(source, expectedSha256);
  if (completed) return completed;
  freezeVerifiedPackage(result.template);
  verifiedPackages.set(result.template, { source, digest: expectedSha256 });
  if (!verifiedIndex.has(expectedSha256) && verifiedIndex.size >= MAX_VERIFIED_IDENTITIES) {
    const oldest = verifiedIndex.keys().next().value;
    if (oldest !== undefined) verifiedIndex.delete(oldest);
  }
  // Only weak document references and bounded digest metadata survive an owner's disposal.
  verifiedIndex.set(expectedSha256, new WeakRef(result.template));
  return result.template;
}

/** Both receiving runtimes use the same complete control set, logical bounds and frame clock. */
export function parseRuntimeAnimationFrame(
  value: Record<string, unknown>,
  document: AnimationTemplate
) {
  const controls = parseEffectControlValues(document, value['controls']);
  const dimensions = parseEffectLogicalDimensions(value['width'], value['height']);
  if (
    !controls ||
    !dimensions ||
    !isRecord(value['inputFrames']) ||
    !hasExactKeys(value['inputFrames'], [])
  )
    return null;
  const bounds = resolveAnimationObjectRenderBounds(document, controls);
  if (dimensions.width !== bounds.width || dimensions.height !== bounds.height) return null;
  const duration = animationRuntimeDuration(document);
  const time = value['time'],
    progress = value['progress'],
    fps = value['fps'],
    frameIndex = value['frameIndex'];
  if (
    value['duration'] !== duration ||
    typeof time !== 'number' ||
    !Number.isFinite(time) ||
    time < 0 ||
    time > duration ||
    typeof progress !== 'number' ||
    !Number.isFinite(progress) ||
    progress < 0 ||
    progress > 1 ||
    Math.abs(progress - time / duration) > 1e-7 ||
    typeof fps !== 'number' ||
    !Number.isFinite(fps) ||
    fps <= 0 ||
    fps > 240 ||
    typeof frameIndex !== 'number' ||
    !Number.isSafeInteger(frameIndex) ||
    frameIndex < 0
  )
    return null;
  return {
    controls,
    dimensions,
    inputs: {},
    timing: { duration, time, progress, fps, frameIndex },
  };
}
