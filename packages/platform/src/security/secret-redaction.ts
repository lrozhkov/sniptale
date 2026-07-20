const DATA_URL_PREVIEW_THRESHOLD = 100;

const SECRET_ASSIGNMENT_PATTERNS = [
  /\b(api[-_\s]?key|apikey)\s*[:=]\s*([^\s&;,)"']+)/gi,
  /\b(token|access[-_\s]?token|refresh[-_\s]?token)\s*[:=]\s*([^\s&;,)"']+)/gi,
  /\b(password|passphrase|secret)\s*[:=]\s*([^\s&;,)"']+)/gi,
  /\b(client[-_\s]?secret|private[-_\s]?key|session[-_\s]?id)\s*[:=]\s*([^\s&;,)"']+)/gi,
  /\b(csrf|xsrf|otp|one[-_\s]?time[-_\s]?code|verification[-_\s]?code)\s*[:=]\s*([^\s&;,)"']+)/gi,
  /\b(credential|policy|sig|signature|x-amz-[^\s:=]+|x-goog-[^\s:=]+)\s*[:=]\s*([^\s&;,)"']+)/gi,
] as const;
const AUTH_HEADER_PREFIX_PATTERN = /\b(authorization|proxy-authorization)[ \t]*[:=][ \t]*/gi;
const COOKIE_HEADER_PATTERN = /\b(cookie|set-cookie)\s*[:=]\s*([^\n\r]+)/gi;
const BEARER_TOKEN_PATTERN = /\bbearer\s+([A-Za-z0-9._~+/=-]{8,})/gi;
const OPENAI_KEY_PATTERN = /\bsk-[A-Za-z0-9_-]{8,}/g;
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;
const SECRET_URL_COMPONENT_PATTERNS = [
  /([?&#](?:api[-_\s]?key|apikey)=)[^&#\s]+/gi,
  /([?&#](?:token|access[-_\s]?token|refresh[-_\s]?token)=)[^&#\s]+/gi,
  /([?&#](?:password|passphrase|secret)=)[^&#\s]+/gi,
  /([?&#](?:client[-_\s]?secret|private[-_\s]?key|session[-_\s]?id)=)[^&#\s]+/gi,
  /([?&#](?:csrf|xsrf|otp|one[-_\s]?time[-_\s]?code|verification[-_\s]?code)=)[^&#\s]+/gi,
  /([?&#](?:credential|policy|sig|signature|x-amz-[^=&#\s]+|x-goog-[^=&#\s]+)=)[^&#\s]+/gi,
] as const;
const SECRET_URL_COMPONENT_NAME_FRAGMENTS = [
  'apikey',
  'token',
  'accesstoken',
  'refreshtoken',
  'password',
  'passphrase',
  'secret',
  'clientsecret',
  'privatekey',
  'sessionid',
  'csrf',
  'xsrf',
  'otp',
  'onetimecode',
  'verificationcode',
  'credential',
  'policy',
  'signature',
  'xamz',
  'xgoog',
] as const;
const EXACT_SECRET_URL_COMPONENT_NAMES = new Set(['sig']);

function normalizeSecretComponentName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

export function isSensitiveUrlComponentName(name: string): boolean {
  const normalized = normalizeSecretComponentName(name);
  return (
    EXACT_SECRET_URL_COMPONENT_NAMES.has(normalized) ||
    SECRET_URL_COMPONENT_NAME_FRAGMENTS.some((fragment) => normalized.includes(fragment))
  );
}

function replaceAllPatterns(
  value: string,
  patterns: readonly RegExp[],
  replacement: string
): string {
  return patterns.reduce((nextValue, pattern) => nextValue.replace(pattern, replacement), value);
}

function readAuthHeaderValueEnd(value: string, startIndex: number): number {
  let cursor = startIndex;
  while (cursor < value.length && value[cursor] !== '\n' && value[cursor] !== '\r') {
    cursor += 1;
  }
  return cursor;
}

function redactAuthorizationHeaders(value: string): string {
  let redacted = '';
  let lastIndex = 0;

  for (const match of value.matchAll(AUTH_HEADER_PREFIX_PATTERN)) {
    const matchIndex = match.index ?? 0;
    redacted += value.slice(lastIndex, matchIndex);
    redacted += `${match[1]}: ***`;
    lastIndex = readAuthHeaderValueEnd(value, matchIndex + match[0].length);
  }

  return redacted + value.slice(lastIndex);
}

export function redactSensitiveString(value: string, maxLength: number): string {
  if (value.startsWith('data:') && value.length > DATA_URL_PREVIEW_THRESHOLD) {
    return `[data URL: ${value.length} chars]`;
  }

  const headerRedacted = redactAuthorizationHeaders(value)
    .replace(COOKIE_HEADER_PATTERN, '$1=***')
    .replace(BEARER_TOKEN_PATTERN, 'Bearer ***')
    .replace(OPENAI_KEY_PATTERN, 'sk-***')
    .replace(JWT_PATTERN, 'jwt-***');
  const assignmentRedacted = replaceAllPatterns(
    headerRedacted,
    SECRET_ASSIGNMENT_PATTERNS,
    '$1=***'
  );
  const redacted = replaceAllPatterns(assignmentRedacted, SECRET_URL_COMPONENT_PATTERNS, '$1***');

  if (redacted.length > maxLength) {
    return `${redacted.substring(0, maxLength)}... [truncated]`;
  }

  return redacted;
}

export function sanitizeSensitiveError(
  error: Error,
  maxLength: number
): Record<string, string | boolean | undefined> {
  return {
    _error: true,
    name: error.name,
    message: redactSensitiveString(error.message, maxLength),
    stack: error.stack === undefined ? undefined : redactSensitiveString(error.stack, maxLength),
  };
}
