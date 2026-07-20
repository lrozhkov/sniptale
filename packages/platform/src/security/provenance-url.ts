const ALLOWED_PROVENANCE_URL_PROTOCOLS = new Set(['http:', 'https:']);
const SENSITIVE_PATH_SEGMENTS = new Set([
  'auth',
  'callback',
  'code',
  'invite',
  'magic',
  'oauth',
  'reset',
  'sso',
  'token',
  'verification',
  'verify',
]);
const SENSITIVE_PATH_TOKENS = new Set([
  ...SENSITIVE_PATH_SEGMENTS,
  'invitee',
  'invitation',
  'password',
]);
const HIGH_ENTROPY_PATH_SEGMENT_PATTERN = /^[A-Za-z0-9_-]{24,}$/u;

function decodePathSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function isHighEntropyPathSegment(segment: string): boolean {
  return (
    HIGH_ENTROPY_PATH_SEGMENT_PATTERN.test(segment) &&
    /[A-Za-z]/u.test(segment) &&
    /[0-9]/u.test(segment)
  );
}

function hasSensitivePathMarker(segment: string): boolean {
  const tokens = segment.split(/[^a-z0-9]+/u).filter(Boolean);
  if (tokens.some((token) => SENSITIVE_PATH_TOKENS.has(token))) {
    return true;
  }

  return [...SENSITIVE_PATH_TOKENS].some(
    (token) => segment.startsWith(token) || segment.endsWith(token)
  );
}

function hasSensitivePath(url: URL): boolean {
  return url.pathname
    .split('/')
    .filter(Boolean)
    .map((segment) => decodePathSegment(segment).toLowerCase())
    .some((segment) => hasSensitivePathMarker(segment) || isHighEntropyPathSegment(segment));
}

export function sanitizeProvenanceUrl(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    if (!ALLOWED_PROVENANCE_URL_PROTOCOLS.has(url.protocol)) {
      return null;
    }

    url.username = '';
    url.password = '';
    url.search = '';
    url.hash = '';

    if (hasSensitivePath(url)) {
      url.pathname = '/';
    }

    return url.toString();
  } catch {
    return null;
  }
}
