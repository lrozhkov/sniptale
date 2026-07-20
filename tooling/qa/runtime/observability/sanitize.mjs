import path from 'node:path';

import { redactRecognizedSecretShapes } from './sanitize-patterns.mjs';
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
