import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { readImageDataUrlDimensions } from '../validation/data-url.js';
import {
  decodeBase64Bytes,
  estimateBase64DecodedBytes,
  isBoundedBase64,
} from '../validation/base64.js';
import { ANIMATION_TEMPLATE_LIMITS, type AnimationResource } from './types.js';

/** Package-local paths have one canonical spelling and cannot reference another origin or directory. */
export function isAnimationResourcePath(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 512 &&
    !/[\\:%?#]/u.test(value) &&
    [...value].every(
      (character) => character.charCodeAt(0) > 0x20 && character.charCodeAt(0) !== 0x7f
    ) &&
    !value.startsWith('/') &&
    value.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..')
  );
}

/** Inspect image dimensions without allocating decoded pixels. */
export function animationResourceRasterSize(
  resource: AnimationResource
): { width: number; height: number } | null {
  if (!resource.mimeType.startsWith('image/')) return null;
  const size = readImageDataUrlDimensions(
    `data:${resource.mimeType};base64,${resource.base64}`,
    ANIMATION_TEMPLATE_LIMITS.resourceBytes
  );
  return size &&
    size.width <= ANIMATION_TEMPLATE_LIMITS.dimension &&
    size.height <= ANIMATION_TEMPLATE_LIMITS.dimension &&
    size.width * size.height <= ANIMATION_TEMPLATE_LIMITS.rasterPixels
    ? size
    : null;
}

/** Check payload size, digest and basic file signature before a resource reaches its decoder. */
export async function verifyAnimationResource(resource: AnimationResource): Promise<boolean> {
  if (
    !isAnimationResourcePath(resource.path) ||
    !isBoundedBase64(resource.base64, ANIMATION_TEMPLATE_LIMITS.resourceBytes) ||
    estimateBase64DecodedBytes(resource.base64) !== resource.byteLength
  )
    return false;
  let bytes: Uint8Array<ArrayBuffer>;
  try {
    bytes = decodeBase64Bytes(resource.base64);
  } catch {
    return false;
  }
  const signature =
    resource.mimeType === 'image/png'
      ? bytes[0] === 137 &&
        bytes[1] === 80 &&
        bytes[2] === 78 &&
        bytes[3] === 71 &&
        bytes[4] === 13 &&
        bytes[5] === 10 &&
        bytes[6] === 26 &&
        bytes[7] === 10
      : resource.mimeType === 'image/jpeg'
        ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
        : resource.mimeType === 'image/webp'
          ? String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF' &&
            String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP'
          : resource.mimeType === 'font/ttf'
            ? bytes[0] === 0 && bytes[1] === 1 && bytes[2] === 0 && bytes[3] === 0
            : String.fromCharCode(...bytes.subarray(0, 4)) === 'OTTO';
  if (
    !signature ||
    (resource.mimeType.startsWith('image/') && !animationResourceRasterSize(resource))
  )
    return false;
  return resource.sha256 === bytesToHex(sha256(bytes));
}
