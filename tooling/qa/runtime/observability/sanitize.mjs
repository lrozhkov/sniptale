import path from 'node:path';

const AUTH_PATTERN =
  /\b((?:authorization|proxy-authorization)\s*[:=]\s*)(?:basic|bearer)\s+[^\s,;]+/giu;
const COOKIE_PATTERN = /\b((?:set-)?cookie\s*:\s*)[^\r\n]+/giu;
const SECRET_ASSIGNMENT_PATTERNS = [
  /\b(api[-_]?key|password|passwd|secret|token)\s*[:=]\s*([^\s,;]+)/giu,
  /\b((?:access|refresh)[-_]?token|client[-_]?secret)\s*[:=]\s*([^\s,;]+)/giu,
];
const SECRET_QUERY_PATTERNS = [
  /([?&](?:api[-_]?key|password|secret|token|signature|sig)=)[^&#\s]+/giu,
  /([?&](?:(?:access|refresh)[-_]?token|x-(?:amz|goog)-signature)=)[^&#\s]+/giu,
  /([?&]x-amz-credential=)[^&#\s]+/giu,
];
const JSON_QUOTED_SECRET_PATTERNS = [
  /(["'](?:authorization|proxy-authorization|(?:set-)?cookie)["']\s*:\s*)(["'])(?:\\.|[^\\\r\n])*?\2/giu,
  /(["'](?:api[-_]?key|password|passwd|secret|token)["']\s*:\s*)(["'])(?:\\.|[^\\\r\n])*?\2/giu,
  /(["'](?:(?:access|refresh)[-_]?token|client[-_]?secret)["']\s*:\s*)(["'])(?:\\.|[^\\\r\n])*?\2/giu,
];
const KNOWN_TOKEN_PATTERN = /\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/gu;
const URL_CREDENTIAL_PATTERN = /(https?:\/\/)[^/@\s:]+:[^/@\s]+@/giu;

function redactRecognizedSecretShapes(value) {
  let redacted = value;
  for (const pattern of JSON_QUOTED_SECRET_PATTERNS) {
    redacted = redacted.replace(pattern, '$1$2<redacted>$2');
  }
  redacted = redacted
    .replace(AUTH_PATTERN, '$1<redacted>')
    .replace(COOKIE_PATTERN, '$1<redacted>')
    .replace(KNOWN_TOKEN_PATTERN, '<redacted>')
    .replace(URL_CREDENTIAL_PATTERN, '$1<redacted>@');
  for (const pattern of SECRET_ASSIGNMENT_PATTERNS) {
    redacted = redacted.replace(pattern, '$1=<redacted>');
  }
  for (const pattern of SECRET_QUERY_PATTERNS) {
    redacted = redacted.replace(pattern, '$1<redacted>');
  }
  return redacted;
}

const SECRET_ENVIRONMENT_KEY_PARTS = [
  'apikey',
  'authorization',
  'authtoken',
  'cookie',
  'credential',
  'password',
  'passwd',
  'privatekey',
  'secret',
  'token',
];
const PRIVATE_ENVIRONMENT_KEYS = new Set([
  'COMPUTERNAME',
  'HOSTNAME',
  'LOGNAME',
  'SNIPTALE_QA_CLOSEOUT_BUILD_LOCK',
  'USER',
  'USERNAME',
]);

function normalizedEnvironmentKey(key) {
  return key.toLowerCase().replaceAll(/[^a-z0-9]/gu, '');
}

function isSensitiveEnvironmentKey(key) {
  if (PRIVATE_ENVIRONMENT_KEYS.has(key.toUpperCase())) return true;
  const normalized = normalizedEnvironmentKey(key);
  return SECRET_ENVIRONMENT_KEY_PARTS.some((part) => normalized.includes(part));
}

function normalizeSensitiveValues(values) {
  return [
    ...new Set(values.filter((value) => typeof value === 'string' && value.length >= 3)),
  ].sort((left, right) => right.length - left.length || left.localeCompare(right));
}

export function collectSensitiveEnvironmentValues(environment = process.env) {
  return normalizeSensitiveValues(
    Object.entries(environment)
      .filter(([key]) => isSensitiveEnvironmentKey(key))
      .map(([, value]) => value)
  );
}

function stripAnsiSequences(value) {
  let result = '';
  for (let index = 0; index < value.length; index += 1) {
    if (value.charCodeAt(index) !== 27 || value[index + 1] !== '[') {
      result += value[index];
      continue;
    }
    let cursor = index + 2;
    while (
      cursor < value.length &&
      value.charCodeAt(cursor) >= 48 &&
      value.charCodeAt(cursor) <= 63
    )
      cursor += 1;
    while (
      cursor < value.length &&
      value.charCodeAt(cursor) >= 32 &&
      value.charCodeAt(cursor) <= 47
    )
      cursor += 1;
    const finalCode = value.charCodeAt(cursor);
    if (finalCode >= 64 && finalCode <= 126) index = cursor;
    else result += value[index];
  }
  return result;
}

function stripUnsafeControls(value) {
  let result = '';
  for (const character of value) {
    const code = character.charCodeAt(0);
    const preservedWhitespace = code === 9 || code === 10 || code === 13;
    if (preservedWhitespace || code > 31) {
      if (code !== 127) result += character;
    }
  }
  return result;
}

function homePrefixLength(value, index) {
  if (value.startsWith('/home/', index)) return 6;
  if (value.startsWith('/Users/', index)) return 7;
  const driveCode = value.charCodeAt(index);
  const isDriveLetter =
    (driveCode >= 65 && driveCode <= 90) || (driveCode >= 97 && driveCode <= 122);
  return isDriveLetter && value.slice(index + 1, index + 9) === ':\\Users\\' ? 9 : 0;
}

function replaceHomePaths(value) {
  let result = '';
  for (let index = 0; index < value.length; index += 1) {
    const prefixLength = homePrefixLength(value, index);
    if (prefixLength === 0) {
      result += value[index];
      continue;
    }
    let cursor = index + prefixLength;
    while (cursor < value.length && value[cursor].trim() !== '') cursor += 1;
    result += '<home>';
    index = cursor - 1;
  }
  return result;
}

export function sanitizeLogText(
  value,
  { repositoryRoot = process.cwd(), repositoryRoots = [repositoryRoot], sensitiveValues = [] } = {}
) {
  let text = typeof value === 'string' ? value : String(value);
  text = stripUnsafeControls(stripAnsiSequences(text));
  for (const root of repositoryRoots.filter(Boolean)) {
    const normalizedRoot = path.resolve(root);
    text = text.replaceAll(normalizedRoot, '<repo>');
    text = text.replaceAll(normalizedRoot.replaceAll('/', '\\'), '<repo>');
  }
  text = redactRecognizedSecretShapes(replaceHomePaths(text));
  for (const sensitiveValue of normalizeSensitiveValues(sensitiveValues)) {
    text = text.replaceAll(sensitiveValue, '<redacted>');
  }
  return text;
}

function sanitizeBoundedText(value, options, maximum) {
  if (value === null || value === undefined) return null;
  const sanitized = sanitizeLogText(value, options);
  return sanitized.slice(0, maximum) || '<redacted>';
}

export function sanitizeDiagnostic(diagnostic, options = {}) {
  if (diagnostic === null || diagnostic === undefined) return null;
  return {
    summary: sanitizeBoundedText(diagnostic.summary, options, 2000),
    locations: (diagnostic.locations ?? []).slice(0, 100).map((location) => ({
      file: sanitizeBoundedText(location.file, options, 4096),
      line: location.line ?? null,
      message: sanitizeBoundedText(location.message, options, 4096),
    })),
    remediation: sanitizeBoundedText(diagnostic.remediation, options, 4096),
    ruleDoc: sanitizeBoundedText(diagnostic.ruleDoc, options, 4096),
    evidence: (diagnostic.evidence ?? []).slice(0, 10),
  };
}

export function truncateUtf8(value, maximumBytes) {
  const bytes = Buffer.from(value, 'utf8');
  if (bytes.length <= maximumBytes) return { text: value, truncated: false };
  let end = maximumBytes;
  while (end > 0 && (bytes[end] & 0xc0) === 0x80) end -= 1;
  return { text: bytes.subarray(0, end).toString('utf8'), truncated: true };
}

export function sanitizeBoundedConsoleOutput(value, options = {}, maximumBytes = 16 * 1024) {
  const marker = '\n[qa-observability: console output truncated]\n';
  const sanitized = sanitizeLogText(value, options);
  const bounded = truncateUtf8(sanitized, maximumBytes);
  if (!bounded.truncated) return bounded.text;
  const contentBytes = Math.max(0, maximumBytes - Buffer.byteLength(marker));
  return truncateUtf8(sanitized, contentBytes).text + marker;
}

export function sanitizeBoundedConsoleTail(value, options = {}, maximumBytes = 32 * 1024) {
  const marker = '[qa-observability: earlier failure output omitted]\n';
  const sanitized = sanitizeLogText(value, options);
  const bytes = Buffer.from(sanitized, 'utf8');
  if (bytes.length <= maximumBytes) return sanitized;
  const contentBytes = Math.max(0, maximumBytes - Buffer.byteLength(marker));
  let start = bytes.length - contentBytes;
  while (start < bytes.length && (bytes[start] & 0xc0) === 0x80) start += 1;
  return marker + bytes.subarray(start).toString('utf8');
}
