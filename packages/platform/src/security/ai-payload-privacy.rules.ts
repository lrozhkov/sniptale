export const AI_REDACTED_VALUE = '[redacted]';
export const AI_SECRET_TEXT_MAX_LENGTH = 100_000;

const HIGH_ENTROPY_SECRET_MIN_LENGTH = 32;

const SENSITIVE_FIELD_NAME_PATTERNS = [
  /\bapi\s*key\b/iu,
  /\bapikey\b/iu,
  /\b(access|refresh)\s*token\b/iu,
  /\btoken\b/iu,
  /\bpass(word|phrase)\b/iu,
  /\bsecret\b/iu,
  /\bclient\s*secret\b/iu,
  /\bprivate\s*key\b/iu,
  /\bsession\s*(id)?\b/iu,
  /\bcsrf\b/iu,
  /\bxsrf\b/iu,
  /\bbearer\b/iu,
  /\botp\b/iu,
  /\bone\s*time\b/iu,
  /\bone\s*time\s*code\b/iu,
  /\bverification\s*code\b/iu,
  /\bauth\s*code\b/iu,
  /\bauthentication\s*code\b/iu,
  /\bauthorization\b/iu,
  /\bproxy\s*authorization\b/iu,
  /\bcookie\b/iu,
  /\bset\s*cookie\b/iu,
  /\be[-_\s]?mail\b/iu,
  /\b(phone|telephone|mobile)\b/iu,
] as const;

const TABLE_CONTEXT_LABEL_PATTERNS = [
  /\bname\b/iu,
  /\bkey\b/iu,
  /\bfield\b/iu,
  /\blabel\b/iu,
  /\bproperty\b/iu,
  /\bparameter\b/iu,
] as const;

export const SENSITIVE_INPUT_TYPES = new Set(['hidden', 'password']);
export const SENSITIVE_AUTOCOMPLETE_VALUES = new Set([
  'current-password',
  'new-password',
  'one-time-code',
]);

function normalizeFieldName(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/gu, '$1 $2')
    .replace(/[_-]+/gu, ' ')
    .trim();
}

export function isSensitiveAiFieldName(value: string): boolean {
  const normalized = normalizeFieldName(value);
  return SENSITIVE_FIELD_NAME_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function isTableContextLabelHeader(value: string): boolean {
  const normalized = normalizeFieldName(value);
  return TABLE_CONTEXT_LABEL_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function isHighEntropySecretLikeValue(value: string): boolean {
  const trimmed = value.trim();
  if (
    trimmed.length < HIGH_ENTROPY_SECRET_MIN_LENGTH ||
    /\s/u.test(trimmed) ||
    /^[\d.,:-]+$/u.test(trimmed)
  ) {
    return false;
  }

  const classes = [
    /[a-z]/u.test(trimmed),
    /[A-Z]/u.test(trimmed),
    /\d/u.test(trimmed),
    /[_\-./+=]/u.test(trimmed),
  ].filter(Boolean).length;
  return classes >= 3;
}
