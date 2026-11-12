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

export function parseRuntimeAnimationDocument(value: unknown): AnimationTemplate | null {
  const result = validateAnimationTemplate(value);
  return result.ok ? result.template : null;
}

/** Verify all package-local bytes before any image or font decoder can observe them. */
export async function verifyRuntimeAnimationSource(
  source: unknown,
  expectedSha256: string
): Promise<AnimationTemplate | null> {
  if (typeof source !== 'string' || !isEffectRuntimeImmutableId(expectedSha256)) return null;
  const result = parseAnimationTemplateSource(source);
  if (!result.ok) return null;
  const bytes = new TextEncoder().encode(source);
  if (bytes.byteLength > ANIMATION_TEMPLATE_LIMITS.jsonBytes) return null;
  if (bytesToHex(sha256(bytes)) !== expectedSha256) return null;
  for (const resource of result.template.resources)
    if (!(await verifyAnimationResource(resource))) return null;
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
