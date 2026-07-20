export const IDENTIFIER_PATTERN = /^[a-z][a-z0-9._-]{0,127}$/i;

export type EffectV1Record = Record<string, unknown>;

export interface EffectV1DiagnosticReporter {
  error(code: string, path: string, message: string, suggestion?: string): void;
  warning(code: string, path: string, message: string, suggestion?: string): void;
}

export function isRecord(value: unknown): value is EffectV1Record {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function toRecordArray(value: unknown): EffectV1Record[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

export function rejectUnknownKeys(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  path: string,
  report: EffectV1DiagnosticReporter
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      report.error(
        'UNKNOWN_FIELD',
        `${path}.${key}`,
        `Unknown field "${key}".`,
        'Remove it or use a field defined by EffectV1; unknown data is never ignored.'
      );
    }
  }
}

export function requireIdentifier(
  value: unknown,
  path: string,
  report: EffectV1DiagnosticReporter
): value is string {
  if (typeof value !== 'string' || !IDENTIFIER_PATTERN.test(value)) {
    report.error(
      'IDENTIFIER',
      path,
      'Expected a safe identifier (letters, digits, dot, underscore, dash).'
    );
    return false;
  }
  return true;
}

export function requireString(
  value: unknown,
  path: string,
  report: EffectV1DiagnosticReporter
): value is string {
  if (typeof value !== 'string' || value.trim() === '') {
    report.error('STRING_REQUIRED', path, 'Expected a non-empty string.');
    return false;
  }
  return true;
}

export function requirePositiveNumber(
  value: unknown,
  path: string,
  report: EffectV1DiagnosticReporter
): value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    report.error('POSITIVE_NUMBER', path, 'Expected a positive finite number.');
    return false;
  }
  return true;
}

export function validateRange(
  startValue: unknown,
  durationValue: unknown,
  duration: number,
  path: string,
  report: EffectV1DiagnosticReporter
): void {
  const start = Number(startValue);
  const itemDuration = Number(durationValue);
  if (!Number.isFinite(start) || start < 0) {
    report.error('RANGE_START', `${path}.start`, 'Expected a non-negative start.');
  }
  if (!Number.isFinite(itemDuration) || itemDuration <= 0) {
    report.error('RANGE_DURATION', `${path}.duration`, 'Expected a positive duration.');
  }
  if (
    Number.isFinite(start) &&
    Number.isFinite(itemDuration) &&
    start + itemDuration > duration + 1e-6
  ) {
    report.error('RANGE_OUTSIDE_EFFECT', path, 'Range exceeds the effect duration.');
  }
}

export function validateLocaleText(
  value: unknown,
  path: string,
  requireRu: boolean,
  report: EffectV1DiagnosticReporter
): void {
  if (!isRecord(value)) {
    report.error('LOCALE_TEXT', path, 'Expected a locale text object.');
    return;
  }
  if (requireRu && (typeof value['ru'] !== 'string' || value['ru'].trim() === '')) {
    report.error('LOCALE_RU_REQUIRED', `${path}.ru`, 'Russian source text is required.');
  }
  if (typeof value['en'] !== 'string' || value['en'].trim() === '') {
    report.error('LOCALE_EN_REQUIRED', `${path}.en`, 'English fallback text is required.');
  }
  for (const [locale, text] of Object.entries(value)) {
    if (!isLocaleCode(locale) || typeof text !== 'string') {
      report.error('LOCALE_ENTRY', `${path}.${locale}`, 'Expected a locale string.');
    }
  }
}

function isLocaleCode(value: string): boolean {
  const language = value.slice(0, 2);
  if (
    language.length !== 2 ||
    [...language].some((character) => character < 'a' || character > 'z')
  ) {
    return false;
  }
  if (value.length === 2) return true;
  const region = value.slice(3);
  return (
    value.length === 5 &&
    value[2] === '-' &&
    [...region].every((character) => character >= 'A' && character <= 'Z')
  );
}

export function isSafeRelativePath(value: unknown): boolean {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 512 &&
    !value.startsWith('/') &&
    !value.includes('\\') &&
    !value.split('/').includes('..') &&
    !/^[a-z]+:/i.test(value)
  );
}

export function isSafeSvg(value: unknown): boolean {
  if (typeof value !== 'string' || value.length > 1_500_000) return false;
  const executable = /<\s*(?:script|foreignObject)\b|\son[a-z]+\s*=/i;
  const externalReference = /(?:href|xlink:href)\s*=\s*["']\s*(?:https?:|data:|javascript:)/i;
  return !executable.test(value) && !externalReference.test(value);
}
