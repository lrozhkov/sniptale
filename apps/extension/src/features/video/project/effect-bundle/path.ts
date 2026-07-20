import { EFFECT_BUNDLE_LIMITS } from './limits';

const WINDOWS_DEVICE_NAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;
const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function isCanonicalEffectBundlePath(path: unknown): path is string {
  if (
    typeof path !== 'string' ||
    path.length === 0 ||
    path.length > EFFECT_BUNDLE_LIMITS.maxPathCharacters ||
    path.startsWith('/') ||
    path.endsWith('/') ||
    path.includes('\\') ||
    path.includes('\0') ||
    path.includes('?') ||
    path.includes('#') ||
    !isAscii(path)
  ) {
    return false;
  }
  const segments = path.split('/');
  return segments.every(
    (segment) =>
      segment.length > 0 &&
      segment !== '.' &&
      segment !== '..' &&
      !segment.endsWith('.') &&
      SEGMENT.test(segment) &&
      !WINDOWS_DEVICE_NAME.test(segment)
  );
}

export function isCanonicalEffectDocumentPath(path: unknown): path is string {
  return (
    isCanonicalEffectBundlePath(path) &&
    path.startsWith('effects/') &&
    path.endsWith('.sniptale-effect.json')
  );
}

export function isCanonicalEffectAssetPath(path: unknown): path is string {
  return isCanonicalEffectBundlePath(path) && path.startsWith('assets/');
}

export function normalizeEffectBundlePathForCollision(path: string): string {
  return path.normalize('NFC').toLowerCase();
}

function isAscii(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x20 || code > 0x7e) return false;
  }
  return true;
}
