import { assertExactKeys, assertObject } from './schema-assertions.mjs';

const MAXIMUM_ITEMS = 500;
const MAXIMUM_TEXT = 4096;
const PREFLIGHT_KEYS = [
  'owners',
  'runtimes',
  'riskAreas',
  'documents',
  'consumers',
  'proofRequirements',
  'structuralContext',
];
const ADVISORY_KEYS = ['introduced', 'worsened', 'existing'];

function assertText(value, label) {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAXIMUM_TEXT) {
    throw new TypeError(`${label} must be bounded non-empty text`);
  }
}

function parseTextArray(value, label) {
  if (!Array.isArray(value) || value.length > MAXIMUM_ITEMS) {
    throw new TypeError(`${label} must be a bounded array`);
  }
  for (const item of value) assertText(item, `${label} item`);
  if (new Set(value).size !== value.length)
    throw new TypeError(`${label} must not contain duplicates`);
  return [...value];
}

export function parsePreflightContext(value) {
  if (value === null) return null;
  assertObject(value, 'preflightContext');
  assertExactKeys(value, PREFLIGHT_KEYS, 'preflightContext');
  return Object.fromEntries(
    PREFLIGHT_KEYS.map((key) => [key, parseTextArray(value[key], `preflightContext.${key}`)])
  );
}

function parseAdvisoryItem(value, label) {
  assertObject(value, label);
  assertExactKeys(value, ['id', 'file', 'line', 'reason', 'severity'], label);
  for (const field of ['id', 'file', 'reason', 'severity'])
    assertText(value[field], `${label}.${field}`);
  if (value.line !== null && (!Number.isSafeInteger(value.line) || value.line <= 0)) {
    throw new TypeError(`${label}.line must be a positive integer or null`);
  }
  return { ...value };
}

export function parseAdvisory(value) {
  if (value === null) return null;
  assertObject(value, 'advisory');
  assertExactKeys(value, ADVISORY_KEYS, 'advisory');
  return Object.fromEntries(
    ADVISORY_KEYS.map((key) => {
      const items = value[key];
      if (!Array.isArray(items) || items.length > MAXIMUM_ITEMS) {
        throw new TypeError(`advisory.${key} must be a bounded array`);
      }
      return [
        key,
        items.map((item, index) => parseAdvisoryItem(item, `advisory.${key}[${index}]`)),
      ];
    })
  );
}

function parseEvidence(value, label) {
  assertObject(value, label);
  assertExactKeys(value, ['file', 'detail'], label);
  assertText(value.file, `${label}.file`);
  assertText(value.detail, `${label}.detail`);
  return { ...value };
}

function parseRiskSeam(value, label) {
  assertObject(value, label);
  assertExactKeys(value, ['id', 'level', 'evidence', 'requirements', 'reviews'], label);
  assertText(value.id, `${label}.id`);
  if (!['high', 'medium'].includes(value.level)) throw new TypeError(`${label}.level is invalid`);
  if (!Array.isArray(value.evidence) || value.evidence.length > MAXIMUM_ITEMS) {
    throw new TypeError(`${label}.evidence must be a bounded array`);
  }
  return {
    ...value,
    evidence: value.evidence.map((item, index) =>
      parseEvidence(item, `${label}.evidence[${index}]`)
    ),
    requirements: parseTextArray(value.requirements, `${label}.requirements`),
    reviews: parseTextArray(value.reviews, `${label}.reviews`),
  };
}

export function parseChangeRisk(value) {
  if (value === null) return null;
  assertObject(value, 'changeRisk');
  assertExactKeys(value, ['level', 'seams', 'requirements'], 'changeRisk');
  if (value.level !== null && !['HIGH', 'MEDIUM'].includes(value.level)) {
    throw new TypeError('changeRisk.level is invalid');
  }
  if (!Array.isArray(value.seams) || value.seams.length > MAXIMUM_ITEMS) {
    throw new TypeError('changeRisk.seams must be a bounded array');
  }
  return {
    level: value.level,
    seams: value.seams.map((item, index) => parseRiskSeam(item, `changeRisk.seams[${index}]`)),
    requirements: parseTextArray(value.requirements, 'changeRisk.requirements'),
  };
}
