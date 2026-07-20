import {
  assertExactKeys,
  assertId,
  assertNonNegativeInteger,
  assertObject,
} from './schema-assertions.mjs';

const DIAGNOSTIC_KEYS = ['summary', 'locations', 'remediation', 'ruleDoc', 'evidence'];
const LOCATION_KEYS = ['file', 'line', 'message'];
const EVIDENCE_KEYS = ['kind', 'runId', 'recordPath', 'logPath'];

function assertBoundedText(value, label, { nullable = false, maximum = 4096 } = {}) {
  if (nullable && value === null) return;
  if (typeof value !== 'string' || value.length === 0 || value.length > maximum) {
    throw new TypeError(`${label} must be bounded non-empty text`);
  }
}

function assertEvidencePath(value, label, prefix, suffix) {
  if (value === null) return;
  assertBoundedText(value, label);
  if (!value.startsWith(prefix) || !value.endsWith(suffix) || value.includes('..')) {
    throw new TypeError(`${label} must be a canonical QA evidence path`);
  }
}

function parseLocation(value) {
  assertObject(value, 'diagnostic location');
  assertExactKeys(value, LOCATION_KEYS, 'diagnostic location');
  assertBoundedText(value.file, 'diagnostic location.file');
  if (value.line !== null) assertNonNegativeInteger(value.line, 'diagnostic location.line');
  assertBoundedText(value.message, 'diagnostic location.message');
  return { ...value };
}

function parseEvidence(value) {
  assertObject(value, 'diagnostic evidence');
  assertExactKeys(value, EVIDENCE_KEYS, 'diagnostic evidence');
  if (value.kind !== 'child-run') throw new TypeError('diagnostic evidence.kind is invalid');
  assertId(value.runId, 'diagnostic evidence.runId');
  assertEvidencePath(
    value.recordPath,
    'diagnostic evidence.recordPath',
    '.tmp/qa-observability/runs/',
    '.json'
  );
  assertEvidencePath(value.logPath, 'diagnostic evidence.logPath', '.tmp/qa-logs/', '.log');
  if (
    value.recordPath === null ||
    value.logPath === null ||
    !value.recordPath.endsWith(`/${value.runId}.json`) ||
    !value.logPath.endsWith(`/${value.runId}.log`)
  ) {
    throw new TypeError('diagnostic evidence paths must identify the declared child run');
  }
  return { ...value };
}

export function parseDiagnostic(value) {
  if (value === null) return null;
  assertObject(value, 'step.diagnostic');
  assertExactKeys(value, DIAGNOSTIC_KEYS, 'step.diagnostic');
  assertBoundedText(value.summary, 'step.diagnostic.summary', { nullable: true, maximum: 2000 });
  assertBoundedText(value.remediation, 'step.diagnostic.remediation');
  assertBoundedText(value.ruleDoc, 'step.diagnostic.ruleDoc');
  if (!Array.isArray(value.locations) || value.locations.length > 100) {
    throw new TypeError('step.diagnostic.locations must be a bounded array');
  }
  if (!Array.isArray(value.evidence) || value.evidence.length > 10) {
    throw new TypeError('step.diagnostic.evidence must be a bounded array');
  }
  return {
    ...value,
    locations: value.locations.map(parseLocation),
    evidence: value.evidence.map(parseEvidence),
  };
}
