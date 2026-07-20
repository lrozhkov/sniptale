/**
 * Sanitizes a preset relative path for UI input.
 */
export function sanitizePresetPathInput(raw: string): string {
  const normalized = raw
    .trim()
    .replace(/[:*?"<>|\\]/g, '-')
    .replace(/\/+/g, '/');
  const withoutTraversal = normalized.replace(/\.\.(?:\/|$)/g, '');
  const sanitizedSegments = withoutTraversal
    .split('/')
    .map((segment) => segment.trim().replace(/\.\./g, ''))
    .filter((segment) => segment.length > 0 && segment !== '..');

  return sanitizedSegments.join('/');
}
